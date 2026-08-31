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
