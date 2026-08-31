import type { Finding, GraphStateType } from "../state.js";

const SECTIONS: Array<{
  title: string;
  key: "correctnessFindings" | "securityFindings" | "styleFindings";
}> = [
  { title: "Correctness", key: "correctnessFindings" },
  { title: "Security", key: "securityFindings" },
  { title: "Style", key: "styleFindings" },
];

export function mergeFindings(state: GraphStateType): Partial<GraphStateType> {
  const summary = SECTIONS.map(({ title, key }) => formatSection(title, state[key])).join(
    "\n\n",
  );
  return { summary };
}

function formatSection(title: string, findings: Finding[]): string {
  if (findings.length === 0) {
    return `## ${title}\n\nNo issues found.`;
  }
  const items = findings.map((f) => `- **[${f.severity}]** ${f.description}`).join("\n");
  return `## ${title}\n\n${items}`;
}
