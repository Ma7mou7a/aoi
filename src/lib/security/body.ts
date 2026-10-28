import type { z } from "zod";

/** Default request-body limit for API routes; block submissions with all their trials get more. */
export const DEFAULT_MAX_BYTES = 16 * 1024;

export class BodyError extends Error {
  constructor(public status: 400 | 413, message: string) {
    super(message);
  }
}

/**
 * Read a JSON request body with a hard size limit (checked while streaming, so a missing or lying
 * Content-Length doesn't help), then validate it with a Zod schema. Throws BodyError (400/413).
 */
export async function readJson<S extends z.ZodTypeAny>(req: Request, schema: S, opts: { maxBytes?: number; message?: string } = {}): Promise<z.output<S>> {
  const max = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) throw new BodyError(413, "That request is too large.");

  let text = "";
  if (req.body) {
    const reader = req.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new BodyError(413, "That request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }

  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new BodyError(400, opts.message ?? "The request body isn't valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new BodyError(400, opts.message ?? parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return parsed.data;
}
