import "server-only";
import { FilesystemBackend } from "deepagents";

export class ReadOnlySkillsBackend extends FilesystemBackend {
  override write: FilesystemBackend["write"] = async () => ({ error: "Skills are read-only" });
  override edit: FilesystemBackend["edit"] = async () => ({ error: "Skills are read-only" });
  override delete: FilesystemBackend["delete"] = async () => ({ error: "Skills are read-only" });
  override async uploadFiles(files: Array<[string, Uint8Array]>) {
    return files.map(([path]) => ({ path, error: "permission_denied" as const }));
  }
}
