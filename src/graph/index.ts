import { StateGraph, START, END } from "@langchain/langgraph";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState } from "./state.js";
import { createFetchDiffNode } from "./nodes/fetchDiff.js";
import { createReviewerNode } from "./nodes/reviewers/createReviewerNode.js";
import {
  CORRECTNESS_PROMPT,
  SECURITY_PROMPT,
  STYLE_PROMPT,
} from "./nodes/reviewers/prompts.js";
import { createMergeFindingsNode } from "./nodes/mergeFindings.js";
import { createPostCommentNode } from "./nodes/postComment.js";

export function buildGraph(octokit: Octokit, model: BaseChatModel, commentTemplate: string) {
  return new StateGraph(GraphState)
    .addNode("fetch_diff", createFetchDiffNode(octokit))
    .addNode(
      "review_correctness",
      createReviewerNode(model, CORRECTNESS_PROMPT, "correctnessFindings"),
    )
    .addNode(
      "review_security",
      createReviewerNode(model, SECURITY_PROMPT, "securityFindings"),
    )
    .addNode("review_style", createReviewerNode(model, STYLE_PROMPT, "styleFindings"))
    .addNode("merge_findings", createMergeFindingsNode(commentTemplate))
    .addNode("post_comment", createPostCommentNode(octokit))
    .addEdge(START, "fetch_diff")
    .addEdge("fetch_diff", "review_correctness")
    .addEdge("fetch_diff", "review_security")
    .addEdge("fetch_diff", "review_style")
    .addEdge("review_correctness", "merge_findings")
    .addEdge("review_security", "merge_findings")
    .addEdge("review_style", "merge_findings")
    .addEdge("merge_findings", "post_comment")
    .addEdge("post_comment", END)
    .compile();
}

export async function runReview(
  octokit: Octokit,
  model: BaseChatModel,
  commentTemplate: string,
  params: { owner: string; repo: string; prNumber: number },
): Promise<void> {
  const graph = buildGraph(octokit, model, commentTemplate);
  await graph.invoke(params);
}
