import "dotenv/config";
import { loadConfig } from "./config.js";
import { createOctokit } from "./github.js";
import { createChatModel } from "./llm.js";
import { createApp } from "./server.js";
import { loadCommentTemplate } from "./commentTemplate.js";

const config = loadConfig();
const octokit = createOctokit(config);
const model = createChatModel(config);
const commentTemplate = loadCommentTemplate(config.commentTemplatePath);
const app = createApp(octokit, model, config.githubWebhookSecret, commentTemplate);

app.listen(config.port, () => {
  console.log(`PR review bot listening on port ${config.port}`);
});
