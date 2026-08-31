import { describe, it, expect, vi } from "vitest";
import { createReviewerNode } from "./createReviewerNode.js";
import type { GraphStateType } from "../../state.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

function baseState(): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "diff --git a/x b/x",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "",
  };
}

describe("createReviewerNode", () => {
  it("invokes the structured model with the system prompt and diff, writing results to the given state key", async () => {
    const invoke = vi.fn().mockResolvedValue({
      findings: [{ description: "SQL built via string concatenation", severity: "high" }],
    });
    const withStructuredOutput = vi.fn().mockReturnValue({ invoke });
    const fakeModel = { withStructuredOutput } as unknown as BaseChatModel;

    const node = createReviewerNode(fakeModel, "SECURITY PROMPT TEXT", "securityFindings");
    const result = await node(baseState());

    expect(withStructuredOutput).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith([
      { role: "system", content: "SECURITY PROMPT TEXT" },
      { role: "user", content: "diff --git a/x b/x" },
    ]);
    expect(result).toEqual({
      securityFindings: [{ description: "SQL built via string concatenation", severity: "high" }],
    });
  });
});
