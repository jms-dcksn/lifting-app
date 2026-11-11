import "server-only";
import pg from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { parseThreadId, threadTitleFromUserText, type TurnRequest } from "./chat-state";
import { isAgentPart, type AgentPart } from "./messages";
import { stableUuid, projectionMessages } from "./durable-messages";

export const COACH_RUNTIME_VERSION = "coach-deep-v1";
export class DurableChatError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}
export type OwnedScope = { owner: string; thread: string };
export type ExecutionScope = OwnedScope & { epoch: number };
const iso = z.coerce.date().transform(value => value.toISOString());
const messageSchema = z.object({ id: z.string().uuid(), role: z.enum(["user", "assistant", "tool"]),
  parts: z.array(z.custom<AgentPart>(isAgentPart)), createdAt: iso });
const turnSchema = z.object({ request_id: z.string().uuid(), payload_hash: z.string(), input_message_id: z.string().uuid(),
  status: z.enum(["accepted", "running", "interrupted", "failed", "completed"]), epoch: z.coerce.number().int(),
  lease_until: iso.nullable(), committed_checkpoint_id: z.string().nullable(), error_code: z.string().nullable() });
export type DurableTurn = z.infer<typeof turnSchema>;
const bindingSchema = z.object({ runtime_version: z.string(), epoch: z.coerce.number().int(),
  bootstrap_version: z.number().nullable(), bootstrap_checkpoint_id: z.string().nullable() });

export async function ownedTransaction<T>(pool: pg.Pool, scope: OwnedScope, work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config('coach.owner',$1,true),set_config('coach.thread',$2,true)", [scope.owner, scope.thread]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function checkExecution(client: pg.PoolClient, scope: ExecutionScope) {
  const binding = await client.query("select epoch from coach_runtime.thread where thread_id=$1 and epoch=$2 for share", [scope.thread, scope.epoch]);
  const turn = await client.query(`select epoch from coach_runtime.turn where conversation_id=$1 and epoch=$2
    and status='running' and lease_until > clock_timestamp() for share`, [scope.thread, scope.epoch]);
  if (!binding.rowCount || !turn.rowCount) throw new DurableChatError("Execution claim expired. Reopen this chat to recover.");
}

/** Promise-only adapter for the pinned saver. Every native transaction rechecks its claim. */
export function scopedSaver(pool: pg.Pool, scope: OwnedScope | ExecutionScope) {
  const authorize = async (client: pg.PoolClient) => {
    await client.query("select set_config('coach.owner',$1,true),set_config('coach.thread',$2,true)", [scope.owner, scope.thread]);
    if ("epoch" in scope) await checkExecution(client, scope);
    else {
      const found = await client.query("select 1 from coach_runtime.thread where thread_id=$1 for share", [scope.thread]);
      if (!found.rowCount) throw new DurableChatError("Conversation unavailable", 404);
    }
  };
  const query = async (client: pg.PoolClient, sql: string | pg.QueryConfig, values?: unknown[]) => {
    const text = typeof sql === "string" ? sql : sql.text;
    if (!("epoch" in scope) && !/^\s*select\b/i.test(text)) throw new DurableChatError("Checkpoint reader cannot write");
    return client.query(sql, values);
  };
  const adapter = new Proxy(pool, { get(target, property) {
    if (property === "query") return (sql: string | pg.QueryConfig, values?: unknown[]) => ownedTransaction(target, scope, async client => {
      await authorize(client);
      return query(client, sql, values);
    });
    if (property === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(connection, key) {
        if (key === "query") return async (sql: string | pg.QueryConfig, values?: unknown[]) => {
          if (sql === "BEGIN") {
            if (!("epoch" in scope)) throw new DurableChatError("Checkpoint reader cannot write");
            await connection.query("BEGIN");
            await authorize(connection);
            return;
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") return connection.query(sql);
          return query(connection, sql, values);
        };
        const value = Reflect.get(connection, key);
        return typeof value === "function" ? value.bind(connection) : value;
      } });
    };
    if (property === "end") return () => { throw new Error("Shared runtime pool is owned by the application"); };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const saver = new PostgresSaver(adapter, undefined, { schema: "coach_runtime" });
  saver.setup = async () => { throw new Error("Checkpoint schema is installed by reviewed application migration only"); };
  return saver;
}

async function transcript(client: pg.PoolClient, thread: string) {
  const result = await client.query(`select id,role,parts,created_at as "createdAt" from public.agent_message
    where thread_id=$1 order by created_at,id`, [thread]);
  return z.array(messageSchema).parse(result.rows);
}
async function binding(client: pg.PoolClient, thread: string) {
  const result = await client.query("select * from coach_runtime.thread where thread_id=$1 for update", [thread]);
  const row = bindingSchema.parse(result.rows[0]);
  if (row.runtime_version !== COACH_RUNTIME_VERSION) throw new DurableChatError("This conversation requires a compatible Coach runtime.");
  return row;
}
function hashPayload(request: TurnRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function createDurableStore(pool: pg.Pool) {
  return {
    pool,
    async prune(scope: OwnedScope) {
      return ownedTransaction(pool, scope, async client => {
        const thread = await client.query("select id from public.agent_thread where id=$1 for update", [scope.thread]);
        if (!thread.rowCount) throw new DurableChatError("Conversation unavailable", 404);
        await binding(client, scope.thread);
        const unfinished = await client.query("select 1 from coach_runtime.turn where conversation_id=$1 and status<>'completed'", [scope.thread]);
        if (unfinished.rowCount) return { checkpoints: 0, writes: 0, blobs: 0 };
        const removed = await client.query(`with retained as (
          select checkpoint_ns,checkpoint_id,parent_checkpoint_id from coach_runtime.checkpoints c where thread_id=$1 and (
            (checkpoint->>'ts')::timestamptz >= clock_timestamp()-interval '30 days'
            or checkpoint_id=(select max(checkpoint_id) from coach_runtime.checkpoints where thread_id=$1 and checkpoint_ns=c.checkpoint_ns)
            or checkpoint_id=(select bootstrap_checkpoint_id from coach_runtime.thread where conversation_id=$1::uuid)
            or checkpoint_id in (select committed_checkpoint_id from coach_runtime.turn where conversation_id=$1::uuid)
            or checkpoint_id in (select projected_checkpoint_id from coach_runtime.turn where conversation_id=$1::uuid)))
          delete from coach_runtime.checkpoints c where thread_id=$1
          and not exists(select 1 from retained r where r.checkpoint_ns=c.checkpoint_ns
            and (r.checkpoint_id=c.checkpoint_id or r.parent_checkpoint_id=c.checkpoint_id)) returning checkpoint_id`, [scope.thread]);
        const writes = await client.query(`delete from coach_runtime.checkpoint_writes w where thread_id=$1
          and not exists(select 1 from coach_runtime.checkpoints c where c.thread_id=w.thread_id
            and c.checkpoint_ns=w.checkpoint_ns and c.checkpoint_id=w.checkpoint_id)`, [scope.thread]);
        const blobs = await client.query(`delete from coach_runtime.checkpoint_blobs b where thread_id=$1
          and not exists(select 1 from coach_runtime.checkpoints c where c.thread_id=b.thread_id
            and c.checkpoint_ns=b.checkpoint_ns and c.checkpoint->'channel_versions'->>b.channel=b.version)`, [scope.thread]);
        return { checkpoints: removed.rowCount ?? 0, writes: writes.rowCount ?? 0, blobs: blobs.rowCount ?? 0 };
      });
    },
    async admit(owner: string, input: { requestId: string; request: TurnRequest; resume?: boolean; seedId?: string }) {
      const { request, requestId } = input;
      const thread = request.kind === "new" ? stableUuid(`thread:${owner}:${requestId}`) : request.threadId;
      const scope = { owner, thread };
      return ownedTransaction(pool, scope, async client => {
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`turn:${owner}:${requestId}`]);
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`thread:${thread}`]);
        if (request.kind === "new") await client.query(`insert into public.agent_thread(id,user_id,title) values($1,$2,$3)
          on conflict(id) do nothing`, [thread, owner, threadTitleFromUserText(request.text)]);
        const found = await client.query("select title,updated_at from public.agent_thread where id=$1 for update", [thread]);
        if (!found.rowCount) throw new DurableChatError("Conversation unavailable", 404);
        await client.query(`insert into coach_runtime.thread(conversation_id,owner_id,runtime_version) values($1,$2,$3)
          on conflict(conversation_id) do nothing`, [thread, owner, COACH_RUNTIME_VERSION]);
        const state = await binding(client, thread);
        const existing = await client.query(`select *, (status='running' and lease_until>clock_timestamp()) as lease_active
          from coach_runtime.turn where request_id=$1 and owner_id=$2 for update`, [requestId, owner]);
        let turn = existing.rowCount ? turnSchema.parse(existing.rows[0]) : null;
        const recovered = turn !== null;
        if (turn && !input.resume && turn.payload_hash !== hashPayload(request)) throw new DurableChatError("Request ID was already used for different input.");
        if (input.resume && !turn) throw new DurableChatError("Turn unavailable", 404);
        if (!turn) {
          const unresolved = await client.query("select 1 from coach_runtime.turn where conversation_id=$1 and status<>'completed'", [thread]);
          if (unresolved.rowCount) throw new DurableChatError("Recover the unfinished response before sending another message.");
          const inputId = request.kind === "review" ? input.seedId : stableUuid(`input:${owner}:${requestId}`);
          if (!inputId) throw new DurableChatError("Review unavailable", 404);
          if (request.kind === "review") {
            const history = await transcript(client, thread);
            if (history.length !== 1 || history[0]?.id !== inputId || history[0].role !== "user") throw new DurableChatError("Review already answered", 409);
          } else await client.query(`insert into public.agent_message(id,thread_id,user_id,role,parts)
            values($1,$2,$3,'user',$4)`, [inputId, thread, owner, JSON.stringify([{ type: "text", text: request.text }])]);
          const inserted = await client.query(`insert into coach_runtime.turn(request_id,owner_id,conversation_id,payload_hash,input_message_id,status,epoch)
            values($1,$2,$3,$4,$5,'accepted',$6) returning *`, [requestId, owner, thread, hashPayload(request), inputId, state.epoch + 1]);
          turn = turnSchema.parse(inserted.rows[0]);
        }
        const running = turn.status === "running" && z.boolean().parse(existing.rows[0]?.lease_active ?? false);
        const execute = turn.status !== "completed" && !running && (!recovered || input.resume === true);
        if (execute) {
          const next = await client.query("update coach_runtime.thread set epoch=epoch+1 where conversation_id=$1 returning epoch", [thread]);
          const epoch = z.coerce.number().int().parse(next.rows[0].epoch);
          const updated = await client.query(`update coach_runtime.turn set status='running',epoch=$3,lease_until=clock_timestamp()+interval '90 seconds',
            error_code=null,updated_at=clock_timestamp() where owner_id=$1 and request_id=$2 returning *`, [owner, requestId, epoch]);
          turn = turnSchema.parse(updated.rows[0]);
        }
        const history = await transcript(client, thread);
        const userMessage = history.find(row => row.id === turn.input_message_id);
        const id = parseThreadId(thread);
        if (!id || !userMessage) throw new DurableChatError("Conversation input unavailable", 503);
        if (execute && !recovered) await client.query("update public.agent_thread set updated_at=clock_timestamp() where id=$1", [thread]);
        return { scope: { ...scope, epoch: turn.epoch }, turn, execute, recovered, binding: state,
          thread: { id, title: z.string().parse(found.rows[0].title), updatedAt: recovered ? iso.parse(found.rows[0].updated_at) : userMessage.createdAt }, userMessage, history };
      });
    },
    async status(scope: OwnedScope) {
      return ownedTransaction(pool, scope, async client => {
        const rows = await client.query("select * from coach_runtime.turn where conversation_id=$1 order by created_at desc limit 1", [scope.thread]);
        if (!rows.rowCount) return null;
        const turn = turnSchema.parse(rows.rows[0]);
        if (turn.status === "running") {
          const result = await client.query(`update coach_runtime.turn set status='interrupted',lease_until=null,error_code='interrupted',updated_at=clock_timestamp()
            where owner_id=$1 and request_id=$2 and status='running' and lease_until<=clock_timestamp() returning *`, [scope.owner, turn.request_id]);
          return result.rowCount ? turnSchema.parse(result.rows[0]) : turn;
        }
        return turn;
      });
    },
    async bootstrap(scope: ExecutionScope, checkpointId: string) {
      return ownedTransaction(pool, scope, async client => {
        await checkExecution(client, scope);
        await client.query("update coach_runtime.thread set bootstrap_version=1,bootstrap_checkpoint_id=$2 where conversation_id=$1", [scope.thread, checkpointId]);
      });
    },
    async interrupt(scope: ExecutionScope, requestId: string, status: "interrupted" | "failed" = "interrupted") {
      return ownedTransaction(pool, scope, async client => {
        await client.query(`update coach_runtime.turn set status=$4,lease_until=null,error_code=$4,updated_at=clock_timestamp()
          where owner_id=$1 and request_id=$2 and epoch=$3 and status='running'`, [scope.owner, requestId, scope.epoch, status]);
      });
    },
    async project(scope: OwnedScope, turn: DurableTurn, checkpointId: string, messages: ReturnType<typeof projectionMessages>) {
      return ownedTransaction(pool, scope, async client => {
        await client.query("select id from public.agent_thread where id=$1 for update", [scope.thread]);
        const binding = await client.query("select epoch from coach_runtime.thread where thread_id=$1 for update", [scope.thread]);
        const current = await client.query("select * from coach_runtime.turn where owner_id=$1 and request_id=$2 for update", [scope.owner, turn.request_id]);
        const latest = turnSchema.parse(current.rows[0]);
        if (latest.epoch !== turn.epoch || z.coerce.number().parse(binding.rows[0]?.epoch) !== turn.epoch) throw new DurableChatError("Execution claim changed during recovery");
        for (const [index, message] of messages.entries()) await client.query(`insert into public.agent_message(id,thread_id,user_id,role,parts,created_at)
          select $1,$2,$3,$4,$5,created_at + ($6::integer * interval '1 microsecond') from coach_runtime.turn where owner_id=$3 and request_id=$7
          on conflict(id) do nothing`, [message.id, scope.thread, scope.owner, message.role, JSON.stringify(message.parts), index + 1, turn.request_id]);
        await client.query(`update coach_runtime.turn set status='completed',lease_until=null,error_code=null,committed_checkpoint_id=$3,
          projected_checkpoint_id=$3,updated_at=clock_timestamp() where owner_id=$1 and request_id=$2`, [scope.owner, turn.request_id, checkpointId]);
        await client.query("update public.agent_thread set updated_at=clock_timestamp() where id=$1", [scope.thread]);
        return transcript(client, scope.thread);
      });
    },
  };
}
export type DurableStore = ReturnType<typeof createDurableStore>;

let sharedPool: pg.Pool | undefined;
export function configuredDurableStore() {
  const connectionString = process.env.COACH_RUNTIME_DATABASE_URL;
  if (!connectionString) throw new DurableChatError("Coach persistence is unavailable. Please retry later.", 503);
  if (!sharedPool) {
    const url = new URL(connectionString);
    if (url.username.split(".")[0] !== "coach_agent_runtime") throw new Error("Coach requires its dedicated runtime role");
    if (url.searchParams.has("sslmode")) throw new Error("Configure verified TLS without sslmode URL overrides");
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    sharedPool = new pg.Pool({ connectionString, ssl: loopback ? false : { rejectUnauthorized: true }, max: 2,
      connectionTimeoutMillis: 5000, statement_timeout: 10000, idleTimeoutMillis: 30000 });
    sharedPool.on("error", () => { console.error("Coach persistence pool connection failed"); });
  }
  return createDurableStore(sharedPool);
}
