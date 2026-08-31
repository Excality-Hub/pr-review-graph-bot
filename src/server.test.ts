import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const mockRunReview = vi.fn().mockResolvedValue(undefined);
vi.mock("./graph/index.js", () => ({ runReview: mockRunReview }));

const { createApp } = await import("./server.js");

const SECRET = "whsec";

function sign(payload: string): string {
  return "sha256=" + crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

function pullRequestPayload(action: string) {
  return {
    action,
    number: 42,
    pull_request: { number: 42 },
    repository: { name: "widgets", owner: { login: "acme" } },
  };
}

describe("webhook server", () => {
  const octokit = {} as Octokit;
  const model = {} as BaseChatModel;

  beforeEach(() => {
    mockRunReview.mockClear();
  });

  it("returns 401 and does not run a review when the signature is invalid", async () => {
    const app = createApp(octokit, model, SECRET);
    const body = JSON.stringify(pullRequestPayload("opened"));

    const response = await request(app)
      .post("/webhook/github")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", "sha256=invalid")
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(401);
    expect(mockRunReview).not.toHaveBeenCalled();
  });

  it("returns 202 and runs a review for an 'opened' pull_request event", async () => {
    const app = createApp(octokit, model, SECRET);
    const body = JSON.stringify(pullRequestPayload("opened"));

    const response = await request(app)
      .post("/webhook/github")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", sign(body))
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(mockRunReview).toHaveBeenCalledTimes(1));
    expect(mockRunReview).toHaveBeenCalledWith(octokit, model, {
      owner: "acme",
      repo: "widgets",
      prNumber: 42,
    });
  });

  it("returns 200 and does not run a review for a 'closed' pull_request event", async () => {
    const app = createApp(octokit, model, SECRET);
    const body = JSON.stringify(pullRequestPayload("closed"));

    const response = await request(app)
      .post("/webhook/github")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", sign(body))
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(200);
    expect(mockRunReview).not.toHaveBeenCalled();
  });

  it("returns 200 and does not run a review for a non-pull_request event", async () => {
    const app = createApp(octokit, model, SECRET);
    const body = JSON.stringify({ action: "opened" });

    const response = await request(app)
      .post("/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(body))
      .set("Content-Type", "application/json")
      .send(body);

    expect(response.status).toBe(200);
    expect(mockRunReview).not.toHaveBeenCalled();
  });
});
