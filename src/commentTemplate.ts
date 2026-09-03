import { readFileSync } from "node:fs";

export function loadCommentTemplate(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read comment template at "${path}": ${reason}`);
  }
}
