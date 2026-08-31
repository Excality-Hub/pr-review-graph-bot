import type { Octokit } from "@octokit/rest";
import type { GraphStateType } from "../state.js";

export function createPostCommentNode(octokit: Octokit) {
  return async function postComment(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    await octokit.issues.createComment({
      owner: state.owner,
      repo: state.repo,
      issue_number: state.prNumber,
      body: state.summary,
    });
    return {};
  };
}
