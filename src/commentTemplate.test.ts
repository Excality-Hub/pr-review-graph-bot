import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCommentTemplate } from "./commentTemplate.js";

describe("loadCommentTemplate", () => {
  it("returns the contents of the template file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "comment-template-"));
    const filePath = path.join(dir, "comment.md");
    writeFileSync(filePath, "{{correctness}}\n\n{{security}}\n\n{{style}}");

    expect(loadCommentTemplate(filePath)).toBe(
      "{{correctness}}\n\n{{security}}\n\n{{style}}",
    );
  });

  it("throws a clear error when the file does not exist", () => {
    expect(() => loadCommentTemplate("/no/such/path/comment.md")).toThrow(
      /Failed to read comment template at "\/no\/such\/path\/comment\.md"/,
    );
  });
});
