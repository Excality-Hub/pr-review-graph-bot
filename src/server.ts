import express from "express";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { verifySignature } from "./webhook/verifySignature.js";
import { runReview } from "./graph/index.js";

const RELEVANT_ACTIONS = new Set(["opened"]);

interface RequestWithRawBody extends express.Request {
  rawBody?: Buffer;
}

export function createApp(
  octokit: Octokit,
  model: BaseChatModel,
  webhookSecret: string,
): express.Express {
  const app = express();
  app.use(
    express.json({
      limit: "5mb",
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf;
      },
    }),
  );

  app.post("/webhook/github", (req: RequestWithRawBody, res) => {
    const rawBody = req.rawBody ?? Buffer.from("");
    const signature = req.header("x-hub-signature-256");

    if (!verifySignature(rawBody, signature, webhookSecret)) {
      res.status(401).send("invalid signature");
      return;
    }

    const eventName = req.header("x-github-event");
    const action = req.body?.action;

    if (eventName !== "pull_request" || !RELEVANT_ACTIONS.has(action)) {
      res.status(200).send("ignored");
      return;
    }

    const owner = req.body.repository.owner.login as string;
    const repo = req.body.repository.name as string;
    const prNumber = req.body.pull_request.number as number;

    res.status(202).send("accepted");

    runReview(octokit, model, { owner, repo, prNumber }).catch((error: unknown) => {
      console.error(`Review failed for ${owner}/${repo}#${prNumber}:`, error);
    });
  });

  return app;
}
