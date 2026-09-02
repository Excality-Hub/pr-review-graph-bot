import { describe, it, expect } from "vitest";
import { createMergeFindingsNode } from "./mergeFindings.js";
import type { GraphStateType } from "../state.js";

const DEFAULT_TEMPLATE = "{{correctness}}\n\n{{security}}\n\n{{style}}";

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

describe("createMergeFindingsNode", () => {
  it("reports 'No issues found.' for each empty category", () => {
    const mergeFindings = createMergeFindingsNode(DEFAULT_TEMPLATE);
    const result = mergeFindings(baseState());
    expect(result.summary).toBe(
      "## Correctness\n\nNo issues found.\n\n" +
        "## Security\n\nNo issues found.\n\n" +
        "## Style\n\nNo issues found.",
    );
  });

  it("lists findings with severity for populated categories", () => {
    const mergeFindings = createMergeFindingsNode(DEFAULT_TEMPLATE);
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

  it("does not re-substitute placeholder syntax that appears inside finding text", () => {
    const mergeFindings = createMergeFindingsNode(DEFAULT_TEMPLATE);
    const result = mergeFindings(
      baseState({
        correctnessFindings: [
          { description: "leftover template syntax {{security}}", severity: "low" },
        ],
        securityFindings: [{ description: "hardcoded API key", severity: "high" }],
      }),
    );
    expect(result.summary).toBe(
      "## Correctness\n\n- **[low]** leftover template syntax {{security}}\n\n" +
        "## Security\n\n- **[high]** hardcoded API key\n\n" +
        "## Style\n\nNo issues found.",
    );
  });

  it("renders sections into a custom template", () => {
    const mergeFindings = createMergeFindingsNode(
      "# PR Review\n\n{{correctness}}\n\n{{security}}\n\n{{style}}\n\n---\nend",
    );
    const result = mergeFindings(baseState());
    expect(result.summary).toBe(
      "# PR Review\n\n" +
        "## Correctness\n\nNo issues found.\n\n" +
        "## Security\n\nNo issues found.\n\n" +
        "## Style\n\nNo issues found.\n\n---\nend",
    );
  });
});
