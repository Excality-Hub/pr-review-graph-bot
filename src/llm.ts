import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Config } from "./config.js";

export function createChatModel(config: Config): BaseChatModel {
  if (config.llmProvider === "anthropic") {
    return new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: "claude-3-5-sonnet-latest",
    });
  }
  return new ChatOpenAI({
    apiKey: config.openaiApiKey,
    model: "gpt-4o",
  });
}
