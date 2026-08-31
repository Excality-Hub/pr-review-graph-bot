import { describe, it, expect, vi } from "vitest";
import { createFetchDiffNode } from "./fetchDiff.js";
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
    summary: "",
  };
}

describe("createFetchDiffNode", () => {
  it("fetches the PR diff and writes it to state", async () => {
    const get = vi.fn().mockResolvedValue({ data: "diff --git a/x b/x" });
    const octokit = { pulls: { get } } as unknown as Parameters<typeof createFetchDiffNode>[0];

    const node = createFetchDiffNode(octokit);
    const result = await node(baseState());

    expect(get).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      pull_number: 42,
      mediaType: { format: "diff" },
    });
    expect(result).toEqual({ diff: "diff --git a/x b/x" });
  });
});
