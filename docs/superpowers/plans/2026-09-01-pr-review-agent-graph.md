# PR Review Agent Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript service that automatically reviews new/updated GitHub pull requests via a LangGraph agent graph (three parallel LLM reviewer nodes) and posts one summary comment.

**Architecture:** An Express webhook endpoint validates a GitHub `pull_request` event and invokes a compiled LangGraph `StateGraph`: `fetch_diff` → fan out to `review_correctness` / `review_security` / `review_style` (parallel) → `merge_findings` → `post_comment`. Each reviewer node calls a LangChain chat model with structured (zod) output; `merge_findings` is a pure function; GitHub I/O goes through `@octokit/rest`.

**Tech Stack:** TypeScript (Node.js >=20, ESM/NodeNext), Express, `@langchain/langgraph`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`, `@octokit/rest`, `zod`, `vitest`, `supertest`, `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-01-pr-review-agent-graph-design.md`

## Global Constraints

- TypeScript on Node.js >=20, package manager npm, ESM modules (`"type": "module"`, NodeNext resolution, relative imports use `.js` extensions).
- Graph built with `@langchain/langgraph` (`StateGraph`, `Annotation`, `START`, `END`); LLM abstractions via `@langchain/core`.
- LLM provider is selectable at runtime via `LLM_PROVIDER` env var (`anthropic` | `openai`) — no other providers.
- GitHub auth is a single Personal Access Token (`GITHUB_TOKEN`) — no GitHub App.
- PR feedback is exactly one issue comment (`octokit.issues.createComment`) — no inline/line-anchored review comments.
- No deduplication or LLM-based merging across reviewers — findings are grouped by category as-is in `merge_findings`.
- No retry/backoff on LLM or GitHub API failures. A failed graph run is caught, logged with `console.error`, and produces no PR comment.
- No persistence/database, no dedup of repeated webhook deliveries beyond what GitHub itself provides.
- No end-to-end tests against real GitHub/LLM APIs — tests use mocks/stubs only; manual verification is documented in the README (ngrok + a real test PR).

---

### Task 1: Project scaffolding and config module

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/config.ts`
- Test: `src/config.test.ts`

**Interfaces:**
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): Config` where
  ```ts
  export type LlmProvider = "anthropic" | "openai";
  export interface Config {
    githubToken: string;
    githubWebhookSecret: string;
    llmProvider: LlmProvider;
    anthropicApiKey?: string;
    openaiApiKey?: string;
    port: number;
  }
  ```
  This `Config` type and `loadConfig` are consumed by Tasks 2, 3, and 11.

- [ ] **Step 1: Create scaffolding files**

`package.json`:
```json
{
  "name": "pr-review-graph-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@langchain/anthropic": "^0.3.0",
    "@langchain/core": "^0.3.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/openai": "^0.3.0",
    "@octokit/rest": "^21.0.0",
    "express": "^4.19.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.0",
    "supertest": "^7.0.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

`.gitignore`:
```
node_modules
dist
.env
```

`.env.example`:
```
GITHUB_TOKEN=
GITHUB_WEBHOOK_SECRET=
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
PORT=3000
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs succeed, `package-lock.json` is created.

- [ ] **Step 3: Write the failing test**

`src/config.test.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `Cannot find module './config.js'` (or similar resolution error), since `src/config.ts` doesn't exist yet.

- [ ] **Step 5: Write minimal implementation**

`src/config.ts`:
```ts
export type LlmProvider = "anthropic" | "openai";

export interface Config {
  githubToken: string;
  githubWebhookSecret: string;
  llmProvider: LlmProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  port: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const githubToken = requireEnv(env, "GITHUB_TOKEN");
  const githubWebhookSecret = requireEnv(env, "GITHUB_WEBHOOK_SECRET");
  const llmProviderRaw = requireEnv(env, "LLM_PROVIDER");

  if (llmProviderRaw !== "anthropic" && llmProviderRaw !== "openai") {
    throw new Error(
      `LLM_PROVIDER must be "anthropic" or "openai", got "${llmProviderRaw}"`,
    );
  }
  const llmProvider: LlmProvider = llmProviderRaw;

  const anthropicApiKey = env.ANTHROPIC_API_KEY;
  const openaiApiKey = env.OPENAI_API_KEY;

  if (llmProvider === "anthropic" && !anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
    );
  }
  if (llmProvider === "openai" && !openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required when LLM_PROVIDER=openai");
  }

  const port = env.PORT ? Number(env.PORT) : 3000;

  return {
    githubToken,
    githubWebhookSecret,
    llmProvider,
    anthropicApiKey,
    openaiApiKey,
    port,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
```

- [ ] **Step 6: Run tests and build to verify they pass**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (5 tests).

Run: `npm run build`
Expected: exits 0 with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example src/config.ts src/config.test.ts
git commit -m "feat: scaffold project and add config loader"
```

---

### Task 2: GitHub client factory

**Files:**
- Create: `src/github.ts`
- Test: `src/github.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 1 (`src/config.ts`).
- Produces: `createOctokit(config: Pick<Config, "githubToken">): Octokit`, consumed by Tasks 9 and 11.

- [ ] **Step 1: Write the failing test**

`src/github.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

const octokitConstructor = vi.fn();
vi.mock("@octokit/rest", () => ({
  Octokit: octokitConstructor,
}));

const { createOctokit } = await import("./github.js");

describe("createOctokit", () => {
  it("constructs an Octokit client authenticated with the given token", () => {
    createOctokit({ githubToken: "gh-token" });
    expect(octokitConstructor).toHaveBeenCalledWith({ auth: "gh-token" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/github.test.ts`
Expected: FAIL — `Cannot find module './github.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/github.ts`:
```ts
import { Octokit } from "@octokit/rest";
import type { Config } from "./config.js";

export function createOctokit(config: Pick<Config, "githubToken">): Octokit {
  return new Octokit({ auth: config.githubToken });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/github.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/github.ts src/github.test.ts
git commit -m "feat: add GitHub client factory"
```

---

### Task 3: LLM client factory

**Files:**
- Create: `src/llm.ts`
- Test: `src/llm.test.ts`

**Interfaces:**
- Consumes: `Config` from Task 1.
- Produces: `createChatModel(config: Config): BaseChatModel`, consumed by Task 11.

- [ ] **Step 1: Write the failing test**

`src/llm.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import type { Config } from "./config.js";

const anthropicConstructor = vi.fn();
const openaiConstructor = vi.fn();
vi.mock("@langchain/anthropic", () => ({
  ChatAnthropic: anthropicConstructor,
}));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: openaiConstructor,
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
    expect(anthropicConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "ak-key" }),
    );
    expect(openaiConstructor).not.toHaveBeenCalled();
  });

  it("builds a ChatOpenAI model when llmProvider is openai", () => {
    createChatModel(
      config({ llmProvider: "openai", anthropicApiKey: undefined, openaiApiKey: "oa-key" }),
    );
    expect(openaiConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "oa-key" }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/llm.test.ts`
Expected: FAIL — `Cannot find module './llm.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/llm.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/llm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/llm.ts src/llm.test.ts
git commit -m "feat: add LLM client factory selectable by provider"
```

---

### Task 4: Webhook signature verification

**Files:**
- Create: `src/webhook/verifySignature.ts`
- Test: `src/webhook/verifySignature.test.ts`

**Interfaces:**
- Produces: `verifySignature(payload: string, signatureHeader: string | undefined, secret: string): boolean`, consumed by Task 10.

- [ ] **Step 1: Write the failing test**

`src/webhook/verifySignature.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySignature } from "./verifySignature.js";

function sign(payload: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifySignature", () => {
  const secret = "whsec";
  const payload = '{"action":"opened"}';

  it("returns true for a valid signature", () => {
    expect(verifySignature(payload, sign(payload, secret), secret)).toBe(true);
  });

  it("returns false for a signature computed with the wrong secret", () => {
    expect(verifySignature(payload, sign(payload, "wrong-secret"), secret)).toBe(false);
  });

  it("returns false for a tampered payload", () => {
    const signature = sign(payload, secret);
    expect(verifySignature('{"action":"closed"}', signature, secret)).toBe(false);
  });

  it("returns false when the signature header is missing", () => {
    expect(verifySignature(payload, undefined, secret)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/webhook/verifySignature.test.ts`
Expected: FAIL — `Cannot find module './verifySignature.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/webhook/verifySignature.ts`:
```ts
import crypto from "node:crypto";

export function verifySignature(
  payload: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) {
    return false;
  }
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/webhook/verifySignature.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/webhook/verifySignature.ts src/webhook/verifySignature.test.ts
git commit -m "feat: add webhook signature verification"
```

---

### Task 5: Graph state and fetch_diff node

**Files:**
- Create: `src/graph/state.ts`
- Create: `src/graph/nodes/fetchDiff.ts`
- Test: `src/graph/nodes/fetchDiff.test.ts`

**Interfaces:**
- Produces (`state.ts`):
  ```ts
  export interface Finding {
    description: string;
    severity: "low" | "medium" | "high";
  }
  export const GraphState = Annotation.Root({ /* ... */ });
  export type GraphStateType = typeof GraphState.State;
  ```
  `GraphState` and `GraphStateType` are consumed by Tasks 6, 7, 8, 9.
- Produces (`fetchDiff.ts`): `createFetchDiffNode(octokit: Octokit): (state: GraphStateType) => Promise<Partial<GraphStateType>>`, consumed by Task 9.

- [ ] **Step 1: Write `state.ts` (no test — type/schema definition only)**

`src/graph/state.ts`:
```ts
import { Annotation } from "@langchain/langgraph";

export interface Finding {
  description: string;
  severity: "low" | "medium" | "high";
}

export const GraphState = Annotation.Root({
  owner: Annotation<string>(),
  repo: Annotation<string>(),
  prNumber: Annotation<number>(),
  diff: Annotation<string>({
    default: () => "",
    reducer: (_current, update) => update,
  }),
  correctnessFindings: Annotation<Finding[]>({
    default: () => [],
    reducer: (_current, update) => update,
  }),
  securityFindings: Annotation<Finding[]>({
    default: () => [],
    reducer: (_current, update) => update,
  }),
  styleFindings: Annotation<Finding[]>({
    default: () => [],
    reducer: (_current, update) => update,
  }),
  summary: Annotation<string>({
    default: () => "",
    reducer: (_current, update) => update,
  }),
});

export type GraphStateType = typeof GraphState.State;
```

- [ ] **Step 2: Write the failing test for `fetchDiff`**

`src/graph/nodes/fetchDiff.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createFetchDiffNode } from "./fetchDiff.js";
import type { GraphStateType } from "../state.js";

function baseState(): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "",
  };
}

describe("createFetchDiffNode", () => {
  it("fetches the PR diff and writes it to state", async () => {
    const get = vi.fn().mockResolvedValue({ data: "diff --git a/x b/x" });
    const octokit = { pulls: { get } } as unknown as Parameters<typeof createFetchDiffNode>[0];

    const node = createFetchDiffNode(octokit);
    const result = await node(baseState());

    expect(get).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      pull_number: 42,
      mediaType: { format: "diff" },
    });
    expect(result).toEqual({ diff: "diff --git a/x b/x" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/graph/nodes/fetchDiff.test.ts`
Expected: FAIL — `Cannot find module './fetchDiff.js'`.

- [ ] **Step 4: Write minimal implementation**

`src/graph/nodes/fetchDiff.ts`:
```ts
import type { Octokit } from "@octokit/rest";
import type { GraphStateType } from "../state.js";

export function createFetchDiffNode(octokit: Octokit) {
  return async function fetchDiff(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    const response = await octokit.pulls.get({
      owner: state.owner,
      repo: state.repo,
      pull_number: state.prNumber,
      mediaType: { format: "diff" },
    });
    return { diff: response.data as unknown as string };
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/graph/nodes/fetchDiff.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/graph/state.ts src/graph/nodes/fetchDiff.ts src/graph/nodes/fetchDiff.test.ts
git commit -m "feat: add graph state and fetch_diff node"
```

---

### Task 6: Reviewer node factory and prompts

**Files:**
- Create: `src/graph/nodes/reviewers/prompts.ts`
- Create: `src/graph/nodes/reviewers/createReviewerNode.ts`
- Test: `src/graph/nodes/reviewers/createReviewerNode.test.ts`

**Interfaces:**
- Consumes: `GraphStateType`, `Finding` from Task 5 (`src/graph/state.ts`).
- Produces:
  ```ts
  export type FindingsStateKey = "correctnessFindings" | "securityFindings" | "styleFindings";
  export function createReviewerNode(
    model: BaseChatModel,
    systemPrompt: string,
    stateKey: FindingsStateKey,
  ): (state: GraphStateType) => Promise<Partial<GraphStateType>>;
  ```
  and `CORRECTNESS_PROMPT`, `SECURITY_PROMPT`, `STYLE_PROMPT` string constants. Both consumed by Task 9.

- [ ] **Step 1: Write `prompts.ts` (no test — plain string constants)**

`src/graph/nodes/reviewers/prompts.ts`:
```ts
export const CORRECTNESS_PROMPT =
  "You are a senior software engineer reviewing a pull request diff for " +
  "correctness issues: bugs, logic errors, unhandled edge cases, incorrect " +
  "error handling. List only correctness issues found in the diff below. " +
  "If there are none, return an empty findings array.";

export const SECURITY_PROMPT =
  "You are a security engineer reviewing a pull request diff for security " +
  "issues: injection vulnerabilities, secrets committed in code, unsafe " +
  "deserialization, missing authorization checks, and similar. List only " +
  "security issues found in the diff below. If there are none, return an " +
  "empty findings array.";

export const STYLE_PROMPT =
  "You are a code style reviewer reviewing a pull request diff for style " +
  "and readability issues: naming, formatting, unnecessary complexity, " +
  "misleading or missing comments. List only style issues found in the " +
  "diff below. If there are none, return an empty findings array.";
```

- [ ] **Step 2: Write the failing test for `createReviewerNode`**

`src/graph/nodes/reviewers/createReviewerNode.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createReviewerNode } from "./createReviewerNode.js";
import type { GraphStateType } from "../../state.js";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

function baseState(): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "diff --git a/x b/x",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "",
  };
}

describe("createReviewerNode", () => {
  it("invokes the structured model with the system prompt and diff, writing results to the given state key", async () => {
    const invoke = vi.fn().mockResolvedValue({
      findings: [{ description: "SQL built via string concatenation", severity: "high" }],
    });
    const withStructuredOutput = vi.fn().mockReturnValue({ invoke });
    const fakeModel = { withStructuredOutput } as unknown as BaseChatModel;

    const node = createReviewerNode(fakeModel, "SECURITY PROMPT TEXT", "securityFindings");
    const result = await node(baseState());

    expect(withStructuredOutput).toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith([
      { role: "system", content: "SECURITY PROMPT TEXT" },
      { role: "user", content: "diff --git a/x b/x" },
    ]);
    expect(result).toEqual({
      securityFindings: [{ description: "SQL built via string concatenation", severity: "high" }],
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/graph/nodes/reviewers/createReviewerNode.test.ts`
Expected: FAIL — `Cannot find module './createReviewerNode.js'`.

- [ ] **Step 4: Write minimal implementation**

`src/graph/nodes/reviewers/createReviewerNode.ts`:
```ts
import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Finding, GraphStateType } from "../../state.js";

const findingSchema = z.object({
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export const findingsSchema = z.object({
  findings: z.array(findingSchema),
});

export type FindingsStateKey =
  | "correctnessFindings"
  | "securityFindings"
  | "styleFindings";

export function createReviewerNode(
  model: BaseChatModel,
  systemPrompt: string,
  stateKey: FindingsStateKey,
) {
  const structuredModel = model.withStructuredOutput(findingsSchema);

  return async function reviewerNode(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    const result = (await structuredModel.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: state.diff },
    ])) as { findings: Finding[] };

    return { [stateKey]: result.findings } as Partial<GraphStateType>;
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/graph/nodes/reviewers/createReviewerNode.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/graph/nodes/reviewers/prompts.ts src/graph/nodes/reviewers/createReviewerNode.ts src/graph/nodes/reviewers/createReviewerNode.test.ts
git commit -m "feat: add reviewer node factory and category prompts"
```

---

### Task 7: merge_findings node

**Files:**
- Create: `src/graph/nodes/mergeFindings.ts`
- Test: `src/graph/nodes/mergeFindings.test.ts`

**Interfaces:**
- Consumes: `GraphStateType`, `Finding` from Task 5.
- Produces: `mergeFindings(state: GraphStateType): Partial<GraphStateType>`, consumed by Task 9.

- [ ] **Step 1: Write the failing test**

`src/graph/nodes/mergeFindings.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mergeFindings } from "./mergeFindings.js";
import type { GraphStateType } from "../state.js";

function baseState(overrides: Partial<GraphStateType> = {}): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "",
    ...overrides,
  };
}

describe("mergeFindings", () => {
  it("reports 'No issues found.' for each empty category", () => {
    const result = mergeFindings(baseState());
    expect(result.summary).toBe(
      "## Correctness\n\nNo issues found.\n\n" +
        "## Security\n\nNo issues found.\n\n" +
        "## Style\n\nNo issues found.",
    );
  });

  it("lists findings with severity for populated categories", () => {
    const result = mergeFindings(
      baseState({
        correctnessFindings: [{ description: "off-by-one in loop", severity: "medium" }],
        securityFindings: [{ description: "hardcoded API key", severity: "high" }],
      }),
    );
    expect(result.summary).toBe(
      "## Correctness\n\n- **[medium]** off-by-one in loop\n\n" +
        "## Security\n\n- **[high]** hardcoded API key\n\n" +
        "## Style\n\nNo issues found.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/nodes/mergeFindings.test.ts`
Expected: FAIL — `Cannot find module './mergeFindings.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/graph/nodes/mergeFindings.ts`:
```ts
import type { Finding, GraphStateType } from "../state.js";

const SECTIONS: Array<{
  title: string;
  key: "correctnessFindings" | "securityFindings" | "styleFindings";
}> = [
  { title: "Correctness", key: "correctnessFindings" },
  { title: "Security", key: "securityFindings" },
  { title: "Style", key: "styleFindings" },
];

export function mergeFindings(state: GraphStateType): Partial<GraphStateType> {
  const summary = SECTIONS.map(({ title, key }) => formatSection(title, state[key])).join(
    "\n\n",
  );
  return { summary };
}

function formatSection(title: string, findings: Finding[]): string {
  if (findings.length === 0) {
    return `## ${title}\n\nNo issues found.`;
  }
  const items = findings.map((f) => `- **[${f.severity}]** ${f.description}`).join("\n");
  return `## ${title}\n\n${items}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/nodes/mergeFindings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/graph/nodes/mergeFindings.ts src/graph/nodes/mergeFindings.test.ts
git commit -m "feat: add merge_findings node"
```

---

### Task 8: post_comment node

**Files:**
- Create: `src/graph/nodes/postComment.ts`
- Test: `src/graph/nodes/postComment.test.ts`

**Interfaces:**
- Consumes: `GraphStateType` from Task 5.
- Produces: `createPostCommentNode(octokit: Octokit): (state: GraphStateType) => Promise<Partial<GraphStateType>>`, consumed by Task 9.

- [ ] **Step 1: Write the failing test**

`src/graph/nodes/postComment.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createPostCommentNode } from "./postComment.js";
import type { GraphStateType } from "../state.js";

function baseState(): GraphStateType {
  return {
    owner: "acme",
    repo: "widgets",
    prNumber: 42,
    diff: "",
    correctnessFindings: [],
    securityFindings: [],
    styleFindings: [],
    summary: "## Correctness\n\nNo issues found.",
  };
}

describe("createPostCommentNode", () => {
  it("posts the summary as an issue comment on the PR", async () => {
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = {
      issues: { createComment },
    } as unknown as Parameters<typeof createPostCommentNode>[0];

    const node = createPostCommentNode(octokit);
    const result = await node(baseState());

    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      issue_number: 42,
      body: "## Correctness\n\nNo issues found.",
    });
    expect(result).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/nodes/postComment.test.ts`
Expected: FAIL — `Cannot find module './postComment.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/graph/nodes/postComment.ts`:
```ts
import type { Octokit } from "@octokit/rest";
import type { GraphStateType } from "../state.js";

export function createPostCommentNode(octokit: Octokit) {
  return async function postComment(
    state: GraphStateType,
  ): Promise<Partial<GraphStateType>> {
    await octokit.issues.createComment({
      owner: state.owner,
      repo: state.repo,
      issue_number: state.prNumber,
      body: state.summary,
    });
    return {};
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/nodes/postComment.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/graph/nodes/postComment.ts src/graph/nodes/postComment.test.ts
git commit -m "feat: add post_comment node"
```

---

### Task 9: Graph assembly

**Files:**
- Create: `src/graph/index.ts`
- Test: `src/graph/index.test.ts`

**Interfaces:**
- Consumes: `GraphState`, `GraphStateType` (Task 5); `createFetchDiffNode` (Task 5); `createReviewerNode`, `CORRECTNESS_PROMPT`, `SECURITY_PROMPT`, `STYLE_PROMPT` (Task 6); `mergeFindings` (Task 7); `createPostCommentNode` (Task 8).
- Produces:
  ```ts
  export function buildGraph(octokit: Octokit, model: BaseChatModel): CompiledGraph;
  export function runReview(
    octokit: Octokit,
    model: BaseChatModel,
    params: { owner: string; repo: string; prNumber: number },
  ): Promise<void>;
  ```
  `runReview` is consumed by Task 10.

- [ ] **Step 1: Write the failing test**

`src/graph/index.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runReview } from "./index.js";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

describe("runReview", () => {
  it("runs fetch_diff, all three reviewers, merge_findings, and post_comment in order", async () => {
    const get = vi.fn().mockResolvedValue({ data: "diff --git a/x b/x" });
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = {
      pulls: { get },
      issues: { createComment },
    } as unknown as Octokit;

    const invoke = vi.fn().mockResolvedValue({
      findings: [{ description: "issue found", severity: "low" }],
    });
    const withStructuredOutput = vi.fn().mockReturnValue({ invoke });
    const model = { withStructuredOutput } as unknown as BaseChatModel;

    await runReview(octokit, model, { owner: "acme", repo: "widgets", prNumber: 42 });

    expect(get).toHaveBeenCalledTimes(1);
    expect(withStructuredOutput).toHaveBeenCalledTimes(3);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(createComment).toHaveBeenCalledTimes(1);

    const body = createComment.mock.calls[0][0].body as string;
    expect(body).toContain("## Correctness");
    expect(body).toContain("## Security");
    expect(body).toContain("## Style");
    expect(body.match(/issue found/g)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/graph/index.test.ts`
Expected: FAIL — `Cannot find module './index.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/graph/index.ts`:
```ts
import { StateGraph, START, END } from "@langchain/langgraph";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { GraphState } from "./state.js";
import { createFetchDiffNode } from "./nodes/fetchDiff.js";
import { createReviewerNode } from "./nodes/reviewers/createReviewerNode.js";
import {
  CORRECTNESS_PROMPT,
  SECURITY_PROMPT,
  STYLE_PROMPT,
} from "./nodes/reviewers/prompts.js";
import { mergeFindings } from "./nodes/mergeFindings.js";
import { createPostCommentNode } from "./nodes/postComment.js";

export function buildGraph(octokit: Octokit, model: BaseChatModel) {
  return new StateGraph(GraphState)
    .addNode("fetch_diff", createFetchDiffNode(octokit))
    .addNode(
      "review_correctness",
      createReviewerNode(model, CORRECTNESS_PROMPT, "correctnessFindings"),
    )
    .addNode(
      "review_security",
      createReviewerNode(model, SECURITY_PROMPT, "securityFindings"),
    )
    .addNode("review_style", createReviewerNode(model, STYLE_PROMPT, "styleFindings"))
    .addNode("merge_findings", mergeFindings)
    .addNode("post_comment", createPostCommentNode(octokit))
    .addEdge(START, "fetch_diff")
    .addEdge("fetch_diff", "review_correctness")
    .addEdge("fetch_diff", "review_security")
    .addEdge("fetch_diff", "review_style")
    .addEdge("review_correctness", "merge_findings")
    .addEdge("review_security", "merge_findings")
    .addEdge("review_style", "merge_findings")
    .addEdge("merge_findings", "post_comment")
    .addEdge("post_comment", END)
    .compile();
}

export async function runReview(
  octokit: Octokit,
  model: BaseChatModel,
  params: { owner: string; repo: string; prNumber: number },
): Promise<void> {
  const graph = buildGraph(octokit, model);
  await graph.invoke(params);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/graph/index.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/graph/index.ts src/graph/index.test.ts
git commit -m "feat: assemble the PR review agent graph"
```

---

### Task 10: Webhook server

**Files:**
- Create: `src/server.ts`
- Test: `src/server.test.ts`

**Interfaces:**
- Consumes: `verifySignature` (Task 4), `runReview` (Task 9).
- Produces: `createApp(octokit: Octokit, model: BaseChatModel, webhookSecret: string): express.Express`, consumed by Task 11.

- [ ] **Step 1: Write the failing test**

`src/server.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import request from "supertest";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

const runReview = vi.fn().mockResolvedValue(undefined);
vi.mock("./graph/index.js", () => ({ runReview }));

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
    runReview.mockClear();
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
    expect(runReview).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(runReview).toHaveBeenCalledTimes(1));
    expect(runReview).toHaveBeenCalledWith(octokit, model, {
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
    expect(runReview).not.toHaveBeenCalled();
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
    expect(runReview).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server.test.ts`
Expected: FAIL — `Cannot find module './server.js'`.

- [ ] **Step 3: Write minimal implementation**

`src/server.ts`:
```ts
import express from "express";
import type { Octokit } from "@octokit/rest";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { verifySignature } from "./webhook/verifySignature.js";
import { runReview } from "./graph/index.js";

const RELEVANT_ACTIONS = new Set(["opened", "synchronize"]);

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
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf;
      },
    }),
  );

  app.post("/webhook/github", (req: RequestWithRawBody, res) => {
    const rawBody = req.rawBody ?? Buffer.from("");
    const signature = req.header("x-hub-signature-256");

    if (!verifySignature(rawBody.toString("utf8"), signature, webhookSecret)) {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/server.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server.ts src/server.test.ts
git commit -m "feat: add GitHub webhook server"
```

---

### Task 11: Entrypoint and README

**Files:**
- Create: `src/index.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `createOctokit` (Task 2), `createChatModel` (Task 3), `createApp` (Task 10).
- Produces: the running service (composition root — no unit test; verified by manual smoke run per the spec's testing scope).

- [ ] **Step 1: Write the entrypoint**

`src/index.ts`:
```ts
import { loadConfig } from "./config.js";
import { createOctokit } from "./github.js";
import { createChatModel } from "./llm.js";
import { createApp } from "./server.js";

const config = loadConfig();
const octokit = createOctokit(config);
const model = createChatModel(config);
const app = createApp(octokit, model, config.githubWebhookSecret);

app.listen(config.port, () => {
  console.log(`PR review bot listening on port ${config.port}`);
});
```

- [ ] **Step 2: Build and smoke-test the entrypoint**

Run: `npm run build`
Expected: exits 0 with no TypeScript errors.

Run: `GITHUB_TOKEN=x GITHUB_WEBHOOK_SECRET=y LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=z node dist/index.js`
Expected: prints `PR review bot listening on port 3000`. Stop it with Ctrl+C.

- [ ] **Step 3: Write the README**

`README.md`:
```markdown
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
| `LLM_PROVIDER` | yes | `anthropic` or `openai` |
| `ANTHROPIC_API_KEY` | if provider=anthropic | Anthropic API key |
| `OPENAI_API_KEY` | if provider=openai | OpenAI API key |
| `PORT` | no (default 3000) | HTTP port for the Express server |

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
```

- [ ] **Step 4: Commit**

```bash
git add src/index.ts README.md
git commit -m "feat: add entrypoint and README"
```

---

## Self-Review Notes

- **Spec coverage:** webhook signature verification (Task 4), fetch diff (Task 5), three parallel reviewer nodes with structured output (Task 6), grouped-not-deduped merge (Task 7), single summary comment (Task 8), full graph wiring with parallel fan-out/fan-in (Task 9), webhook routing/filtering/error logging (Task 10), env var table and manual ngrok demo flow (Task 11), config validation for all required env vars (Task 1). All spec sections are covered.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code and exact commands.
- **Type consistency:** `GraphStateType`, `Finding`, `FindingsStateKey`, `Config`, `LlmProvider` are defined once (Tasks 1 and 5) and imported with matching names/shapes in every later task that uses them.
