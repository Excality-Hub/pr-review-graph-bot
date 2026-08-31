import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const baseEnv = {
    GITHUB_TOKEN: "gh-token",
    GITHUB_WEBHOOK_SECRET: "whsec",
    LLM_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "ak-key",
  };

  it("throws when GITHUB_TOKEN is missing", () => {
    const { GITHUB_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(
      "Missing required environment variable: GITHUB_TOKEN",
    );
  });

  it("throws when LLM_PROVIDER is not anthropic or openai", () => {
    expect(() => loadConfig({ ...baseEnv, LLM_PROVIDER: "cohere" })).toThrow(
      'LLM_PROVIDER must be "anthropic" or "openai", got "cohere"',
    );
  });

  it("throws when LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is missing", () => {
    const { ANTHROPIC_API_KEY, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
    );
  });

  it("returns a config with default port 3000", () => {
    const config = loadConfig(baseEnv);
    expect(config).toEqual({
      githubToken: "gh-token",
      githubWebhookSecret: "whsec",
      llmProvider: "anthropic",
      anthropicApiKey: "ak-key",
      openaiApiKey: undefined,
      port: 3000,
    });
  });

  it("parses a custom PORT", () => {
    const config = loadConfig({ ...baseEnv, PORT: "8080" });
    expect(config.port).toBe(8080);
  });
});
