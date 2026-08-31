export type LlmProvider = "anthropic" | "openai";

export interface Config {
  githubToken: string;
  githubWebhookSecret: string;
  llmProvider: LlmProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const githubToken = requireEnv(env, "GITHUB_TOKEN");
  const githubWebhookSecret = requireEnv(env, "GITHUB_WEBHOOK_SECRET");
  const llmProviderRaw = requireEnv(env, "LLM_PROVIDER");

  if (llmProviderRaw !== "anthropic" && llmProviderRaw !== "openai") {
    throw new Error(
      `LLM_PROVIDER must be "anthropic" or "openai", got "${llmProviderRaw}"`,
    );
  }
  const llmProvider: LlmProvider = llmProviderRaw;

  const anthropicApiKey = env.ANTHROPIC_API_KEY;
  const openaiApiKey = env.OPENAI_API_KEY;

  if (llmProvider === "anthropic" && !anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
    );
  }
  if (llmProvider === "openai" && !openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }

  const port = env.PORT ? Number(env.PORT) : 3000;

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${env.PORT}"`);
  }

  return {
    githubToken,
    githubWebhookSecret,
    llmProvider,
    anthropicApiKey,
    openaiApiKey,
    port,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
