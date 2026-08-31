import type { Octokit } from "@octokit/rest";
import type { GraphStateType } from "../state.js";

export function createFetchDiffNode(octokit: Octokit) {
  return async function fetchDiff(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    const response = await octokit.pulls.get({
      owner: state.owner,
      repo: state.repo,
      pull_number: state.prNumber,
      mediaType: { format: "diff" },
    });
    return { diff: response.data as unknown as string };
  };
}
