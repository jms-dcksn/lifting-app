import "server-only";
import { StateBackend, type FileData } from "deepagents";
import { getConfig } from "@langchain/langgraph";

export const WORKING_FILE_LIMITS = { fileBytes: 128 * 1024, files: 32, totalBytes: 1024 * 1024,
  readLines: 200, readBytes: 8 * 1024 };
const bytes = (content: FileData["content"]) => typeof content === "string" ? Buffer.byteLength(content)
  : content instanceof Uint8Array ? content.byteLength : Buffer.byteLength(content.join("\n"));

/** Native state writes stay durable; rejected writes never change existing files. */
export class WorkingFilesBackend extends StateBackend {
  // Parallel tool tasks share a root checkpoint, but not their pending state writes.
  private reservations = new Map<string, Map<string, number>>();

  private quota(updates: Array<[string, number]>): string | undefined {
    let checkpoint: unknown;
    try { checkpoint = getConfig().configurable?.checkpoint_map?.[""]; } catch { /* Legacy backend outside a graph. */ }
    const pending = typeof checkpoint === "string" ? this.reservations.get(checkpoint) ?? new Map<string, number>() : new Map<string, number>();
    const sizes = new Map(super.downloadFiles((super.glob("**/*").files ?? []).map(file => file.path))
      .map(file => [file.path, file.content?.byteLength ?? 0]));
    for (const [path, size] of pending) sizes.set(path, size);
    for (const [path, size] of updates) {
      if (size > WORKING_FILE_LIMITS.fileBytes) return "Working file exceeds 128 KiB; request narrower evidence.";
      sizes.set(path, size);
    }
    if (sizes.size > WORKING_FILE_LIMITS.files) return "Working file limit reached (32 files).";
    if ([...sizes.values()].reduce((total, size) => total + size, 0) > WORKING_FILE_LIMITS.totalBytes) return "Working file storage limit reached (1 MiB).";
    if (typeof checkpoint === "string") {
      for (const [path, size] of updates) pending.set(path, size);
      this.reservations.set(checkpoint, pending);
    }
  }

  override write(path: string, content: string) {
    const error = this.quota([[path, Buffer.byteLength(content)]]);
    return error ? { error } : super.write(path, content);
  }

  override edit(path: string, oldString: string, newString: string, replaceAll = false) {
    const existing = super.readRaw(path);
    if (!existing.data) return { error: existing.error };
    const preview = new StateBackend({ state: { files: { [path]: existing.data } } }).edit(path, oldString, newString, replaceAll);
    if (preview.error) return preview;
    const updated = preview.filesUpdate?.[path];
    const error = updated ? this.quota([[path, bytes(updated.content)]]) : undefined;
    return error ? { error } : super.edit(path, oldString, newString, replaceAll);
  }

  override uploadFiles(files: Array<[string, Uint8Array]>): ReturnType<StateBackend["uploadFiles"]> {
    const preview = new StateBackend({ state: { files: {} } }).uploadFiles(files);
    const error = this.quota(Object.entries(preview.filesUpdate ?? {}).map(([path, data]) => [path, bytes(data.content)]));
    return error ? files.map(([path]) => ({ path, error: "permission_denied" })) : super.uploadFiles(files);
  }

  override read(path: string, offset = 0, limit = 100): ReturnType<StateBackend["read"]> {
    const raw = super.readRaw(path);
    if (!raw.data) return { error: raw.error };
    // Read-only display lines let native line offsets page through large JSON strings.
    const content = Array.isArray(raw.data.content) ? raw.data.content.join("\n") : raw.data.content;
    const display = typeof content === "string" ? content.split("\n").flatMap(line => {
      const chunks: string[] = [];
      let chunk = "";
      let size = 0;
      for (const character of line) {
        const width = Buffer.byteLength(character);
        if (size + width > 2048) { chunks.push(chunk); chunk = ""; size = 0; }
        chunk += character;
        size += width;
      }
      chunks.push(chunk);
      return chunks;
    }).join("\n") : content;
    const reader = new StateBackend({ state: { files: { [path]: { ...raw.data, content: display } } } });
    const result = reader.read(path, offset, Math.min(limit, WORKING_FILE_LIMITS.readLines));
    if (result.error || result.content === undefined) return result;
    if (typeof result.content !== "string") return { error: "Working files support text read-back only." };
    const lines = result.content.split("\n");
    let size = 0;
    let count = 0;
    for (const line of lines) {
      const next = Buffer.byteLength(line) + (count ? 1 : 0);
      if (size + next > WORKING_FILE_LIMITS.readBytes) break;
      size += next;
      count++;
    }
    if (count === lines.length) return result;
    const endLine = (result.startLine ?? offset + 1) + count - 1;
    return { ...result, content: lines.slice(0, count).join("\n"), endLine, nextOffset: endLine };
  }

  override grep(...args: Parameters<StateBackend["grep"]>): ReturnType<StateBackend["grep"]> {
    const [pattern, path, glob, maxCount] = args;
    const result = super.grep(pattern, path, glob, Math.min(maxCount ?? 20, 20));
    if (Buffer.byteLength(JSON.stringify(result)) > WORKING_FILE_LIMITS.readBytes) return { error: "Search exceeds 8 KiB; narrow the pattern or query the source tool." };
    return result;
  }
}
