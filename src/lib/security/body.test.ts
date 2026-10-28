import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BodyError, readJson } from "./body";

const schema = z.object({ name: z.string().max(10) });
const post = (body: string, headers: Record<string, string> = {}) => new Request("http://x/api", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });

describe("readJson: size-limited, schema-validated request bodies", () => {
  it("parses and validates", async () => {
    expect(await readJson(post('{"name":"Bao"}'), schema)).toEqual({ name: "Bao" });
  });

  it("rejects bodies over the limit with 413, even without a content-length", async () => {
    const big = JSON.stringify({ name: "x".repeat(5000) });
    await expect(readJson(post(big), schema, { maxBytes: 1000 })).rejects.toMatchObject({ status: 413 });
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const chunked = new Request("http://x/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readJson(chunked, schema, { maxBytes: 1000 })).rejects.toMatchObject({ status: 413 });
  });

  it("rejects a declared content-length over the limit before reading", async () => {
    await expect(readJson(post("{}", { "content-length": "999999" }), schema, { maxBytes: 1000 })).rejects.toBeInstanceOf(BodyError);
  });

  it("rejects malformed JSON and schema violations with 400", async () => {
    await expect(readJson(post("{nope"), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post('{"name":"far too long a name"}'), schema)).rejects.toMatchObject({ status: 400 });
    await expect(readJson(post('{"name":"ok"}'), schema.strict())).resolves.toEqual({ name: "ok" });
  });

  it("uses a friendly message when given", async () => {
    await expect(readJson(post("{}"), schema, { message: "Pick a name." })).rejects.toThrow("Pick a name.");
  });
});
