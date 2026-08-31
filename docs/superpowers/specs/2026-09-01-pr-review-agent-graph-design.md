# PR Review Agent Graph — Design

Status: approved
Date: 2026-09-01

## Purpose

Demonstrate an "agent graph" (as opposed to a single agent) by building a
small bot that automatically reviews newly created/updated GitHub pull
requests using LangGraph. On a `pull_request` webhook event, the bot
fetches the PR diff, runs it through three parallel specialized LLM
reviewer nodes (correctness, security, style), merges their findings, and
posts a single summary comment back on the PR.

This is a demo/reference project, not a production bot: scope is kept
deliberately small (see Non-goals).

## Non-goals

- No inline/line-anchored review comments (a single issue comment only).
- No deduplication or LLM-based merging of overlapping findings across
  reviewers — findings are grouped by category as-is.
- No retry/backoff on LLM or GitHub API failures — a failed run is logged
  and the run ends; no "review failed" comment is posted.
- No GitHub App auth — a single Personal Access Token is used.
- No persistence/database — every event is processed statelessly; no
  dedup of repeated webhook deliveries beyond what GitHub itself does.
- No support for review of specific paths/languages differently — every
  reviewer sees the same full diff.

## Architecture

```
GitHub --pull_request webhook--> Express (/webhook/github)
                                        |
                                        v
                                  verify signature
                                        |
                                        v
                                  filter action (opened/synchronize)
                                        |
                                        v
                               invoke compiled LangGraph
                                        |
                                        v
                                   fetch_diff
                                        |
                       +----------------+----------------+
                       |                |                |
                       v                v                v
              review_correctness  review_security   review_style
                       |                |                |
                       +----------------+----------------+
                                        |
                                        v
                                 merge_findings
                                        |
                                        v
                                 post_comment
```

The three reviewer nodes run as parallel branches fanning out from
`fetch_diff` and fanning back into `merge_findings`, which is LangGraph's
standard parallel-node pattern (each branch writes to its own key in
shared state; the graph waits for all three before proceeding).

## Tech stack

- TypeScript, Node.js (>=20), npm.
- `@langchain/langgraph`, `@langchain/core` for the graph and LLM
  abstractions.
- `@langchain/anthropic` and `@langchain/openai`, selected at runtime via
  `LLM_PROVIDER` env var (`anthropic` | `openai`).
- `@octokit/rest` for GitHub API calls (fetching diffs, posting comments).
- `express` for the webhook HTTP server.
- `zod` for structured LLM output schemas.
- `vitest` for tests.

## Components

- **`src/server.ts`** — Express app with `POST /webhook/github`:
  - Verifies `X-Hub-Signature-256` (HMAC-SHA256 over the raw body) against
    `GITHUB_WEBHOOK_SECRET`. Responds 401 on mismatch.
  - Parses the event; if `x-github-event` is not `pull_request`, or the
    payload's `action` is not `opened`/`synchronize`, responds 200 and
    does nothing further.
  - Otherwise responds 202 immediately, then invokes the compiled graph
    asynchronously (fire-and-forget with a `.catch(console.error)`) so
    GitHub's webhook delivery doesn't time out waiting on LLM calls.

- **`src/graph/state.ts`** — LangGraph `Annotation.Root` state definition:
  ```ts
  {
    owner: string;
    repo: string;
    prNumber: number;
    diff: string;
    correctnessFindings: Finding[];
    securityFindings: Finding[];
    styleFindings: Finding[];
  }
  ```
  where `Finding = { description: string; severity: "low" | "medium" | "high" }`.

- **`src/graph/nodes/fetchDiff.ts`** — calls
  `octokit.pulls.get({ owner, repo, pull_number, mediaType: { format: "diff" } })`
  and writes the raw diff text into state.

- **`src/graph/nodes/reviewers/correctness.ts`,
  `security.ts`, `style.ts`** — identical shape, distinct system prompt
  per category. Each:
  - Takes `diff` from state.
  - Calls the configured chat model with `.withStructuredOutput(findingsSchema)`
    where `findingsSchema = z.object({ findings: z.array(findingSchema) })`.
  - Writes the resulting findings array to its own state key
    (`correctnessFindings` / `securityFindings` / `styleFindings`).

- **`src/graph/nodes/mergeFindings.ts`** — pure function (no I/O): takes
  the three findings arrays from state and produces a single Markdown
  string with one section per category (`## Correctness`, `## Security`,
  `## Style`), each listing its findings (or "No issues found." if
  empty). Writes the Markdown into a new `summary` state key.

- **`src/graph/nodes/postComment.ts`** — calls
  `octokit.issues.createComment({ owner, repo, issue_number: prNumber, body: summary })`.

- **`src/graph/index.ts`** — builds the `StateGraph` with the above nodes
  and edges (`fetch_diff` → all three reviewers in parallel → `merge_findings`
  → `post_comment`), compiles it, and exports the compiled graph plus a
  `runReview({ owner, repo, prNumber })` helper that constructs an
  Octokit client and invokes the graph.

- **`src/llm.ts`** — `getChatModel()`: reads `LLM_PROVIDER` env var,
  returns an `@langchain/anthropic` or `@langchain/openai` chat model
  instance configured from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`. Throws
  a clear error if the selected provider's API key is missing.

- **`src/github.ts`** — `getOctokit()`: returns an Octokit client built
  from `GITHUB_TOKEN`.

- **`src/config.ts`** — centralizes reading/validating required env vars
  (`GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `LLM_PROVIDER`, and the
  corresponding provider API key), failing fast at startup if any are
  missing.

## Data flow & error handling

- Webhook signature invalid → 401, no processing.
- Event/action not relevant → 200, no processing, no graph invocation.
- Relevant event → 202 response, then graph runs asynchronously.
- Any node throwing (LLM call failure, GitHub API failure) fails the
  whole graph invocation for that run; the error is caught in the
  fire-and-forget handler in `server.ts` and logged via `console.error`
  with `owner/repo#prNumber` context. No comment is posted, no retry is
  attempted, no error is surfaced to GitHub (a failed run is silent from
  GitHub's perspective, visible only in server logs) — acceptable for a
  demo per Non-goals.
- Reviewer nodes are independent of each other (each only reads `diff`
  and writes its own key), so no coordination/race conditions between
  them; LangGraph handles waiting for all three before `merge_findings`
  runs.

## Testing

Vitest unit tests:

- **Webhook signature verification** — valid signature passes, invalid
  signature is rejected with 401, missing signature header is rejected.
- **`mergeFindings`** — pure function, tested directly with fixture
  finding arrays (empty lists, single-category findings, all three
  populated) asserting the resulting Markdown structure.
- **Graph wiring** — compile the graph with a stub chat model (returning
  fixed structured output per call) and a mocked Octokit client, invoke
  it with a fixture state, and assert: `fetch_diff` is called once, all
  three reviewer nodes run and their outputs land in the correct state
  keys, `merge_findings` combines them correctly, and `post_comment` is
  called once with the expected body. This exercises the actual
  LangGraph parallel fan-out/fan-in without hitting real APIs.

No end-to-end test against real GitHub/LLM APIs is in scope; the README
will document manual verification via ngrok + a real test PR.

## Configuration (env vars)

| Var | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | yes | PAT with repo scope, used for reading diffs and posting comments |
| `GITHUB_WEBHOOK_SECRET` | yes | Shared secret configured on the GitHub webhook, used to verify signatures |
| `LLM_PROVIDER` | yes | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | if provider=anthropic | Anthropic API key |
| `OPENAI_API_KEY` | if provider=openai | OpenAI API key |
| `PORT` | no (default 3000) | HTTP port for the Express server |

## Manual demo flow (documented in README, not code)

1. Set env vars, `npm install`, `npm run dev`.
2. Expose local server via `ngrok http 3000`.
3. Configure a GitHub webhook on a test repo pointing at the ngrok URL
   `/webhook/github`, content type `application/json`, secret matching
   `GITHUB_WEBHOOK_SECRET`, subscribed to "Pull requests" events.
4. Open a PR on that repo; observe the bot's comment appear.
