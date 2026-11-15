import pg from "pg";

// Readiness prototype for the pinned saver's promise-only pool usage, not a general pg adapter.
export class FencedTestPool extends pg.Pool {
  constructor(connectionString, scope) {
    const url = new URL(connectionString);
    if (url.hostname !== "127.0.0.1") throw Error("Disposable loopback database required");
    super({ connectionString, max: 2, connectionTimeoutMillis: 2000, statement_timeout: 3000 });
    this.scope = scope;
  }

  async authorize(client) {
    const { owner, thread, epoch } = this.scope;
    await client.query("SELECT set_config('coach.owner', $1, true), set_config('coach.thread', $2, true), set_config('coach.epoch', $3, true)", [owner, thread, String(epoch)]);
    const result = await client.query("SELECT epoch FROM coach_checkpoint_test.thread_binding WHERE thread_id=$1 FOR SHARE", [thread]);
    if (result.rows[0]?.epoch !== epoch) throw Error("Owned execution claim is unavailable or stale");
  }

  async query(...args) {
    const client = await super.connect();
    try {
      await client.query("BEGIN");
      await this.authorize(client);
      const result = await client.query(...args);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async connect() {
    const client = await super.connect();
    return {
      query: async (...args) => {
        if (args[0] === "BEGIN") {
          await client.query("BEGIN");
          await this.authorize(client);
          return;
        }
        return client.query(...args);
      },
      release: () => client.release(),
    };
  }
}
