import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { b64uToBuffer, bufferToB64u } from "./passkeyClient";

describe("passkey client encoding", () => {
  it("matches the server's base64url, so the challenge the browser signs is the one we issued", () => {
    for (let i = 0; i < 50; i++) {
      const bytes = randomBytes(1 + i);
      const serverSide = bytes.toString("base64url");
      expect(bufferToB64u(b64uToBuffer(serverSide))).toBe(serverSide);
      expect(Buffer.from(b64uToBuffer(serverSide)).equals(bytes)).toBe(true);
    }
  });
});
