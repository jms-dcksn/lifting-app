import { describe, expect, it } from "vitest";
import { WorkingFilesBackend, WORKING_FILE_LIMITS } from "./working-files";
import type { FileData } from "deepagents";

const file = (content: string): FileData => ({ content, mimeType: "text/plain", created_at: "2026-11-11", modified_at: "2026-11-11" });

describe("thread working files", () => {
  it("counts UTF-8 bytes, permits replacement and rejects excess without changing evidence", () => {
    const files = { "/workspace/evidence.txt": file("original") };
    const backend = new WorkingFilesBackend({ state: { files } });
    expect(backend.write("/workspace/evidence.txt", "é".repeat(65_536)).error).toBeUndefined();
    expect(backend.write("/workspace/evidence.txt", "é".repeat(65_537)).error).toContain("128 KiB");
    expect(backend.edit("/workspace/evidence.txt", "original", "x".repeat(131_073)).error).toContain("128 KiB");
    expect(backend.edit("/workspace/evidence.txt", "original", "updated").filesUpdate?.["/workspace/evidence.txt"]?.content).toBe("updated");
    expect(files["/workspace/evidence.txt"].content).toBe("original");
    expect(backend.edit("/workspace/evidence.txt", "missing", "new").error).toContain("not found");
  });

  it("enforces count and total size for writes, edits and batch uploads", () => {
    const full = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`/workspace/${i}.txt`, file("proof")]));
    const backend = new WorkingFilesBackend({ state: { files: full } });
    expect(backend.write("/workspace/new.txt", "x").error).toContain("32 files");
    expect(backend.write("/workspace/0.txt", "new").error).toBeUndefined();
    expect(backend.uploadFiles([["/workspace/new.txt", new Uint8Array(10)]])[0]?.error).toBe("permission_denied");
    const atBytes = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`/${i}.txt`, file("x".repeat(WORKING_FILE_LIMITS.fileBytes))]));
    const large = new WorkingFilesBackend({ state: { files: atBytes } });
    expect(large.write("/new.txt", "x").error).toContain("1 MiB");
    expect(large.uploadFiles([["/new.txt", new Uint8Array(1)]])[0]?.error).toBe("permission_denied");
    expect(large.write("/0.txt", "smaller").error).toBeUndefined();
    const empty = new WorkingFilesBackend({ state: { files: {} } });
    const batch = Array.from({ length: 9 }, (_, i): [string, Uint8Array] => [`/${i}.txt`, new Uint8Array(WORKING_FILE_LIMITS.fileBytes)]);
    expect(empty.uploadFiles(batch).every(result => result.error)).toBe(true);
    expect(empty.glob("**/*").files).toEqual([]);
    expect(empty.uploadFiles([["/invalid.txt", new Uint8Array(50_000).fill(255)]])[0]?.error).toBe("permission_denied");
    const append = backend.uploadFiles([["/workspace/0.txt", new TextEncoder().encode("proof\nappended")]]);
    expect(append[0]?.error).toBeNull();
    expect(append.filesUpdate?.["/workspace/0.txt"]?.content).toBe("proof\nappended");
  });

  it.each([false, true])("pages long UTF-8 JSON without changing stored content (legacy=%s)", legacy => {
    const content = JSON.stringify({ report: "é😀".repeat(3000), end: "last evidence" });
    const stored: FileData = legacy
      ? { content: [content], created_at: "2026-11-11", modified_at: "2026-11-11" }
      : file(content);
    const backend = new WorkingFilesBackend({ state: { files: { "/long.json": stored } } });
    let offset = 0;
    let recovered = "";
    for (let page = 0; page < 30; page++) {
      const result = backend.read("/long.json", offset, 100);
      expect(result.error).toBeUndefined();
      expect(Buffer.byteLength(String(result.content))).toBeLessThanOrEqual(8192);
      recovered += String(result.content).replaceAll("\n", "");
      if (result.nextOffset == null) break;
      expect(result.nextOffset).toBeGreaterThan(offset);
      offset = result.nextOffset;
    }
    expect(recovered).toBe(content);
    expect(backend.readRaw("/long.json").data?.content).toEqual(stored.content);
  });

  it("bounds reads by lines and bytes with a usable continuation offset", () => {
    const content = Array.from({ length: 300 }, (_, i) => `${i}: ${"é".repeat(30)}`).join("\n");
    const backend = new WorkingFilesBackend({ state: { files: { "/proof.txt": file(content), "/long.txt": file("x".repeat(9000)) } } });
    const first = backend.read("/proof.txt", 0, 10000);
    expect(typeof first.content).toBe("string");
    expect(first.nextOffset).toBeGreaterThan(0);
    expect(first.nextOffset).toBeLessThan(200);
    expect(Buffer.byteLength(String(first.content))).toBeLessThanOrEqual(8192);
    const second = backend.read("/proof.txt", first.nextOffset, 10000);
    expect(second.startLine).toBe((first.nextOffset ?? 0) + 1);
    expect(backend.read("/long.txt").nextOffset).toBeGreaterThan(0);
    expect(backend.read("/missing.txt").error).toContain("not found");
    expect(backend.grep("é", "/", null, 10000).matches).toHaveLength(20);
    expect(backend.grep("x", "/long.txt").error).toContain("8 KiB");
  });
});
