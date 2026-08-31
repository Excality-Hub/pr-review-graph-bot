import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Finding, GraphStateType } from "../../state.js";

const findingSchema = z.object({
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export const findingsSchema = z.object({
  findings: z.array(findingSchema),
});

export type FindingsStateKey =
  | "correctnessFindings"
  | "securityFindings"
  | "styleFindings";

export function createReviewerNode(
  model: BaseChatModel,
  systemPrompt: string,
  stateKey: FindingsStateKey,
) {
  const structuredModel = model.withStructuredOutput(findingsSchema);

  return async function reviewerNode(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    const result = (await structuredModel.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: state.diff },
    ])) as { findings: Finding[] };

    return { [stateKey]: result.findings ?? [] } as Partial<GraphStateType>;
  };
}
