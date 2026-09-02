import { describe, it, expect, vi } from "vitest";
import type { Config } from "./config.js";

const mockOpenAiConstructor = vi.fn();
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: mockOpenAiConstructor,
}));

const { createChatModel } = await import("./llm.js");

function config(overrides: Partial<Config> = {}): Config {
  return {
    githubToken: "gh-token",
    githubWebhookSecret: "whsec",
    openaiApiKey: "oa-key",
    port: 3000,
    ...overrides,
  };
}

describe("createChatModel", () => {
  it("builds a ChatOpenAI model with the configured API key", () => {
    createChatModel(config({ openaiApiKey: "oa-key" }));
    expect(mockOpenAiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "oa-key" }),
    );
  });
});
