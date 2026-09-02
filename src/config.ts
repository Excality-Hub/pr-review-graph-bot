export interface Config {
  githubToken: string;
  githubWebhookSecret: string;
  openaiApiKey: string;
  port: number;
  commentTemplatePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const githubToken = requireEnv(env, "GITHUB_TOKEN");
  const githubWebhookSecret = requireEnv(env, "GITHUB_WEBHOOK_SECRET");
  const openaiApiKey = requireEnv(env, "OPENAI_API_KEY");

  const port = env.PORT ? Number(env.PORT) : 3000;

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${env.PORT}"`);
  }

  const commentTemplatePath = env.COMMENT_TEMPLATE_PATH || "templates/comment.md";

  return {
    githubToken,
    githubWebhookSecret,
    openaiApiKey,
    port,
    commentTemplatePath,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
