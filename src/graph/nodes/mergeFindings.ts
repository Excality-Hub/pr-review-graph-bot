import type { Finding, GraphStateType } from "../state.js";

const SECTIONS: Array<{
  title: string;
  key: "correctnessFindings" | "securityFindings" | "styleFindings";
  name: "correctness" | "security" | "style";
}> = [
  { title: "Correctness", key: "correctnessFindings", name: "correctness" },
  { title: "Security", key: "securityFindings", name: "security" },
  { title: "Style", key: "styleFindings", name: "style" },
];

const PLACEHOLDER_PATTERN = /\{\{(correctness|security|style)\}\}/g;

export function createMergeFindingsNode(template: string) {
  return function mergeFindings(state: GraphStateType): Partial<GraphStateType> {
    const sections = Object.fromEntries(
      SECTIONS.map(({ title, key, name }) => [name, formatSection(title, state[key])]),
    );
    const summary = template.replace(PLACEHOLDER_PATTERN, (_match, name) => sections[name]);
    return { summary };
  };
}

function formatSection(title: string, findings: Finding[]): string {
  if (findings.length === 0) {
    return `## ${title}\n\nNo issues found.`;
  }
  const items = findings.map((f) => `- **[${f.severity}]** ${f.description}`).join("\n");
  return `## ${title}\n\n${items}`;
}
