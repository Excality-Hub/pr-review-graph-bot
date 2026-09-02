# PR Review Agent Graph Bot

A demo bot that automatically reviews new GitHub pull requests using a
[LangGraph](https://langchain-ai.github.io/langgraphjs/) agent graph: three
parallel LLM reviewer nodes (correctness, security, style) fan out from a
diff-fetch step, get merged into one summary, and are posted back as a
single PR comment.

```
fetch_diff -> review_correctness -+
           -> review_security     +-> merge_findings -> post_comment
           -> review_style       -+
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in the values (see table below).
3. `npm run dev` to start the server locally.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | yes | PAT with repo scope, used for reading diffs and posting comments |
| `GITHUB_WEBHOOK_SECRET` | yes | Shared secret configured on the GitHub webhook, used to verify signatures |
| `OPENAI_API_KEY` | yes | OpenAI API key |
| `PORT` | no (default 3000) | HTTP port for the Express server |
| `COMMENT_TEMPLATE_PATH` | no (default `templates/comment.md`) | Path to the Markdown template used to render the PR comment |

## Customizing the PR comment

The comment body is rendered from the Markdown file at
`COMMENT_TEMPLATE_PATH` (default: [`templates/comment.md`](templates/comment.md)).
The template supports three placeholders, each replaced with the
rendered findings for that category: `{{correctness}}`, `{{security}}`,
`{{style}}`. Anything else in the file — headers, footers, section
order — is passed through as-is, so you can point `COMMENT_TEMPLATE_PATH`
at your own file to customize the comment's look without touching code.

## Manual demo

1. Start the server: `npm run dev`.
2. Expose it publicly: `ngrok http 3000`.
3. On a test GitHub repo, add a webhook: Settings -> Webhooks -> Add
   webhook. Payload URL is `<ngrok-url>/webhook/github`, content type
   `application/json`, secret matches `GITHUB_WEBHOOK_SECRET`, and it's
   subscribed to "Pull requests" events.
4. Open a pull request on that repo. Within a few seconds the bot posts a
   comment with Correctness / Security / Style sections.

## Testing

`npm test` runs the unit test suite (Vitest). All GitHub and LLM calls are
mocked — there is no end-to-end test against real APIs.

## Scope

This is a demo, not a production bot:
- One summary comment per review, no inline/line-anchored comments.
- No deduplication of overlapping findings across reviewers.
- No retries on LLM/GitHub API failures — a failed run is logged and
  produces no comment.
- GitHub auth is a personal access token, not a GitHub App.
