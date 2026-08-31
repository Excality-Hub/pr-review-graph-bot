import { describe, it, expect, vi } from "vitest";
import { runReview } from "./index.js";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

describe("runReview", () => {
  it("runs fetch_diff, all three reviewers, merge_findings, and post_comment in order", async () => {
    const get = vi.fn().mockResolvedValue({ data: "diff --git a/x b/x" });
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = {
      pulls: { get },
      issues: { createComment },
    } as unknown as Octokit;

    const invoke = vi.fn().mockResolvedValue({
      findings: [{ description: "issue found", severity: "low" }],
    });
    const withStructuredOutput = vi.fn().mockReturnValue({ invoke });
    const model = { withStructuredOutput } as unknown as BaseChatModel;

    await runReview(octokit, model, { owner: "acme", repo: "widgets", prNumber: 42 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(withStructuredOutput).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(createComment).toHaveBeenCalledTimes(1);

    const body = createComment.mock.calls[0][0].body as string;
    expect(body).toContain("## Correctness");
    expect(body).toContain("## Security");
    expect(body).toContain("## Style");
    expect(body.match(/issue found/g)).toHaveLength(3);
  });
});
