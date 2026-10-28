import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { migrateTestDb } from "./db";

describe("test database", () => {
  beforeAll(migrateTestDb);
  it("runs the real migrations in memory", async () => {
    const [u] = await db.insert(schema.users).values({ displayName: "T" }).returning();
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
