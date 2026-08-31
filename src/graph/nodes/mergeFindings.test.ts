import { describe, it, expect } from "vitest";
import { mergeFindings } from "./mergeFindings.js";
import type { GraphStateType } from "../state.js";

function baseState(overrides: Partial<GraphStateType> = {}): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "",
    ...overrides,
  };
}

describe("mergeFindings", () => {
  it("reports 'No issues found.' for each empty category", () => {
    const result = mergeFindings(baseState());
    expect(result.summary).toBe(
      "## Correctness\n\nNo issues found.\n\n" +
        "## Security\n\nNo issues found.\n\n" +
        "## Style\n\nNo issues found.",
    );
  });

  it("lists findings with severity for populated categories", () => {
    const result = mergeFindings(
      baseState({
        correctnessFindings: [{ description: "off-by-one in loop", severity: "medium" }],
        securityFindings: [{ description: "hardcoded API key", severity: "high" }],
      }),
    );
    expect(result.summary).toBe(
      "## Correctness\n\n- **[medium]** off-by-one in loop\n\n" +
        "## Security\n\n- **[high]** hardcoded API key\n\n" +
        "## Style\n\nNo issues found.",
    );
  });
});
