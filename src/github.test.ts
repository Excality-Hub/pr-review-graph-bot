import { describe, it, expect, vi } from "vitest";

const mockOctokitConstructor = vi.fn();
vi.mock("@octokit/rest", () => ({
  Octokit: mockOctokitConstructor,
}));

const { createOctokit } = await import("./github.js");

describe("createOctokit", () => {
  it("constructs an Octokit client authenticated with the given token", () => {
    createOctokit({ githubToken: "gh-token" });
    expect(mockOctokitConstructor).toHaveBeenCalledWith({ auth: "gh-token" });
  });
});
