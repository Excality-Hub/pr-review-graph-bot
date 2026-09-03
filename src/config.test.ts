import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  const baseEnv = {
    GITHUB_TOKEN: "gh-token",
    GITHUB_WEBHOOK_SECRET: "whsec",
    OPENAI_API_KEY: "oa-key",
  };

  it("throws when GITHUB_TOKEN is missing", () => {
    const { GITHUB_TOKEN, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(
      "Missing required environment variable: GITHUB_TOKEN",
    );
  });

  it("throws when GITHUB_WEBHOOK_SECRET is missing", () => {
    const { GITHUB_WEBHOOK_SECRET, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(
      "Missing required environment variable: GITHUB_WEBHOOK_SECRET",
    );
  });

  it("throws when OPENAI_API_KEY is missing", () => {
    const { OPENAI_API_KEY, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(
      "Missing required environment variable: OPENAI_API_KEY",
    );
  });

  it("returns a config with default port 3000 and default comment template path", () => {
    const config = loadConfig(baseEnv);
    expect(config).toEqual({
      githubToken: "gh-token",
      githubWebhookSecret: "whsec",
      openaiApiKey: "oa-key",
      port: 3000,
      commentTemplatePath: "templates/comment.md",
    });
  });

  it("uses a custom COMMENT_TEMPLATE_PATH when set", () => {
    const config = loadConfig({ ...baseEnv, COMMENT_TEMPLATE_PATH: "custom/comment.md" });
    expect(config.commentTemplatePath).toBe("custom/comment.md");
  });

  it("parses a custom PORT", () => {
    const config = loadConfig({ ...baseEnv, PORT: "8080" });
    expect(config.port).toBe(8080);
  });

  it("throws when PORT is not a valid positive integer", () => {
    expect(() => loadConfig({ ...baseEnv, PORT: "abc" })).toThrow(
      'PORT must be a positive integer, got "abc"',
    );
  });
});
