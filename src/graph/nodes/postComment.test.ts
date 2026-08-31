import { describe, it, expect, vi } from "vitest";
import { createPostCommentNode } from "./postComment.js";
import type { GraphStateType } from "../state.js";

function baseState(): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "## Correctness\n\nNo issues found.",
  };
}

describe("createPostCommentNode", () => {
  it("posts the summary as an issue comment on the PR", async () => {
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = {
      issues: { createComment },
    } as unknown as Parameters<typeof createPostCommentNode>[0];

    const node = createPostCommentNode(octokit);
    const result = await node(baseState());

    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      issue_number: 42,
      body: "## Correctness\n\nNo issues found.",
    });
    expect(result).toEqual({});
  });
});
