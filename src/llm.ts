import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Config } from "./config.js";

export function createChatModel(config: Config): BaseChatModel {
  return new ChatOpenAI({
    apiKey: config.openaiApiKey,
    model: "gpt-4o",
  });
}
