import "server-only";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { StateSchema } from "@langchain/langgraph";
import { createMiddleware } from "langchain";
import { CompositeBackend, FilesystemBackend, StateBackend, createSkillsMiddleware, parseSkillMetadata, pinnedSkillsValue, skillsMetadataValue } from "deepagents";
import { z } from "zod";

const manifestSchema = z.object({ skills: z.array(z.object({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().min(1),
  files: z.array(z.string().regex(/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.md$/)).min(1),
})) });

export type RequiredCoachSkill = { name: string; version: string; digest: string };

function skillReads(messages: readonly BaseMessage[]) {
  return new Map(messages.flatMap(message => AIMessage.isInstance(message)
    ? (message.tool_calls ?? []).filter(call => call.name === "read_file" && call.id)
      .map(call => [call.id, call.args.file_path ?? call.args.path] as const) : []));
}

function hasInstructions(messages: readonly BaseMessage[], skill: { name: string; path: string; body: string; content: string }) {
  const reads = skillReads(messages);
  return messages.some(message => HumanMessage.isInstance(message)
    && message.additional_kwargs.lc_source === "pinned_skill"
    && message.content === `<skill name="${skill.name}" path="${skill.path}">\n${skill.body}\n</skill>`)
    || messages.some(message => ToolMessage.isInstance(message) && message.status !== "error"
      && reads.get(message.tool_call_id) === skill.path && message.text.endsWith(skill.content.trimEnd()));
}

class ReadOnlySkillsBackend extends FilesystemBackend {
  override async write() { return { error: "Skills are read-only" }; }
  override async edit() { return { error: "Skills are read-only" }; }
  override async delete() { return { error: "Skills are read-only" }; }
  override async uploadFiles(files: Array<[string, Uint8Array]>) {
    return files.map(([path]) => ({ path, error: "permission_denied" as const }));
  }
}

/** Only trusted server code selects the deployment bundle and required workflow references. */
export function createCoachSkills(input: { rootDir?: string; required?: readonly RequiredCoachSkill[] } = {}) {
  const rootDir = realpathSync(/* turbopackIgnore: true */ input.rootDir ?? resolve("src/lib/agent/skills"));
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(/* turbopackIgnore: true */ join(rootDir, "manifest.json"), "utf8")));
  const skills = manifest.skills.map(entry => {
    if (!entry.files.includes("SKILL.md")) throw new Error(`Missing SKILL.md in manifest: ${entry.name}`);
    const files = [...new Set(entry.files)].sort().map(file => {
      const path = realpathSync(/* turbopackIgnore: true */ join(rootDir, entry.name, file));
      if (relative(rootDir, path).startsWith("..")) throw new Error("Skill file escapes bundle");
      return [file, readFileSync(/* turbopackIgnore: true */ path, "utf8")];
    });
    const metadata = parseSkillMetadata(/* turbopackIgnore: true */ join(rootDir, entry.name, "SKILL.md"), "project");
    if (!metadata || metadata.name !== entry.name) throw new Error(`Invalid skill: ${entry.name}`);
    const content = readFileSync(/* turbopackIgnore: true */ join(rootDir, entry.name, "SKILL.md"), "utf8");
    return { name: entry.name, version: entry.version,
      digest: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
      path: `/skills/${entry.name}/SKILL.md`, content, body: content.replace(/^---\s*\n([\s\S]*?)\n---\s*\n/, "").trimEnd() };
  });
  if (new Set(skills.map(skill => skill.name)).size !== skills.length) throw new Error("Duplicate skill name");
  const requiredSkills = (input.required ?? []).map(required => {
    const current = skills.find(skill => skill.name === required.name);
    if (!current || current.version !== required.version || current.digest !== required.digest) {
      throw new Error(`Required skill unavailable or changed: ${required.name}`);
    }
    return current;
  });
  const digest = createHash("sha256").update(JSON.stringify(skills)).digest("hex");
  const backend = new CompositeBackend(new StateBackend(), {
    "/skills/": new ReadOnlySkillsBackend({ rootDir, virtualMode: true }),
  });
  const native = createSkillsMiddleware({ backend, sources: skills.map(skill => `/skills/${skill.name}/`) });
  const restore = createMiddleware({
    name: "CoachSkillReferences",
    stateSchema: new StateSchema({ skillsMetadata: skillsMetadataValue, pinnedSkills: pinnedSkillsValue,
      coachSkillBundle: z.string().optional() }),
    beforeModel(state) {
      const changed = state.coachSkillBundle !== digest;
      const pins = state.messages.filter(message => HumanMessage.isInstance(message)
        && message.additional_kwargs.lc_source === "pinned_skill");
      const reads = skillReads(state.messages);
      const expiredReads = changed ? state.messages.flatMap(message => {
        if (!ToolMessage.isInstance(message) || !message.id) return [];
        const path = reads.get(message.tool_call_id);
        return typeof path === "string" && path.startsWith("/skills/") ? [new ToolMessage({
          id: message.id, tool_call_id: message.tool_call_id, name: message.name, status: "error",
          content: "Earlier skill read expired after a bundle change. Read the current skill or reference file before using it.",
        })] : [];
      }) : [];
      const missing = requiredSkills.filter(skill => changed || !hasInstructions(state.messages, skill));
      // Replace in place: native compaction stores a message cutoff index.
      return {
        ...(changed ? { coachSkillBundle: digest, skillsMetadata: null,
          messages: [...pins.map(message => new HumanMessage({ id: message.id,
            content: "Earlier skill instructions expired after a bundle change. Use the current skill version.",
            additional_kwargs: { lc_source: "expired_skill" },
          })), ...expiredReads] } : {}),
        pinnedSkills: missing.map(skill => skill.name),
      };
    },
    async wrapModelCall(request, handler) {
      const missing = requiredSkills.filter(skill => !hasInstructions(request.messages, skill));
      if (!missing.length) return handler(request);
      // Native compaction changes the model's messages after beforeModel has run.
      const pin = typeof native.beforeModel === "function" ? native.beforeModel : native.beforeModel?.hook;
      const update = await pin?.({ ...request.state, files: undefined, _skillToolsDisclosed: undefined, messages: request.messages,
        pinnedSkills: missing.map(skill => skill.name) }, request.runtime);
      const { messages: pins } = z.object({ messages: z.array(z.instanceof(HumanMessage)).default([]) }).parse(update ?? {});
      const messages = [...request.messages, ...pins];
      for (const skill of requiredSkills) {
        if (!hasInstructions(messages, skill)) throw new Error(`Required skill was not loaded: ${skill.name}`);
      }
      return handler({ ...request, messages });
    },
  });
  return { backend, skills: skills.map(({ name, version, digest }) => ({ name, version, digest })),
    middleware: [restore, native] as const };
}
