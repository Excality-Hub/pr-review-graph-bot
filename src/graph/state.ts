import { Annotation } from "@langchain/langgraph";

export interface Finding {
  description: string;
  severity: "low" | "medium" | "high";
}

export const GraphState = Annotation.Root({
  owner: Annotation<string>(),
  repo: Annotation<string>(),
  prNumber: Annotation<number>(),
  diff: Annotation<string>({
    default: () => "",
    reducer: (_current, update) => update,
  }),
  correctnessFindings: Annotation<Finding[]>({
    default: () => [],
    reducer: (_current, update) => update,
  }),
  securityFindings: Annotation<Finding[]>({
    default: () => [],
    reducer: (_current, update) => update,
  }),
  styleFindings: Annotation<Finding[]>({
    default: () => [],
    reducer: (_current, update) => update,
  }),
  summary: Annotation<string>({
    default: () => "",
    reducer: (_current, update) => update,
  }),
});

export type GraphStateType = typeof GraphState.State;
