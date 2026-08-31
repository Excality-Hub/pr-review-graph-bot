import { Octokit } from "@octokit/rest";
import type { Config } from "./config.js";

export function createOctokit(config: Pick<Config, "githubToken">): Octokit {
  return new Octokit({ auth: config.githubToken });
}
