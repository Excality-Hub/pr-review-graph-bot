import { describe, it, expect, vi } from "vitest";
import type { Config } from "./config.js";

const mockAnthropicConstructor = vi.fn();
const mockOpenAiConstructor = vi.fn();
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: mockAnthropicConstructor,
}));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: mockOpenAiConstructor,
}));

const { createChatModel } = await import("./llm.js");

function config(overrides: Partial<Config> = {}): Config {
  return {
    githubToken: "gh-token",
    githubWebhookSecret: "whsec",
    llmProvider: "anthropic",
    anthropicApiKey: "ak-key",
    openaiApiKey: undefined,
    port: 3000,
    ...overrides,
  };
}

describe("createChatModel", () => {
  it("builds a ChatAnthropic model when llmProvider is anthropic", () => {
    createChatModel(config({ llmProvider: "anthropic", anthropicApiKey: "ak-key" }));
    expect(mockAnthropicConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "ak-key" }),
    );
    expect(mockOpenAiConstructor).not.toHaveBeenCalled();
  });

  it("builds a ChatOpenAI model when llmProvider is openai", () => {
    createChatModel(
      config({ llmProvider: "openai", anthropicApiKey: undefined, openaiApiKey: "oa-key" }),
    );
    expect(mockOpenAiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "oa-key" }),
    );
  });
});
