import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { buildTestApp } from "./app";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./db";
import { Row } from "../models";

const app = buildTestApp();

const seedRow = (overrides: Partial<{ rowId: number; postId: number; name: string; email: string; body: string }>) => ({
  rowId: 1,
  postId: 1,
  name: "Alice Example",
  email: "alice@example.com",
  body: "hello world",
  ...overrides,
});

describe("GET /api/rows", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 60000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe("pagination defaults", () => {
    it("returns page 1, limit 25 worth of items when no query params are given", async () => {
      await Row.create(seedRow({ rowId: 1 }));
      const res = await request(app).get("/api/rows");

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.items).toHaveLength(1);
    });

    it("returns pages=1 (not 0) when the collection is empty", async () => {
      const res = await request(app).get("/api/rows");

      expect(res.body.total).toBe(0);
      expect(res.body.pages).toBe(1);
      expect(res.body.items).toEqual([]);
    });
  });

  describe("param coercion", () => {
    it("falls back to defaults for non-numeric page/limit", async () => {
      await Row.create(seedRow({ rowId: 1 }));
      const res = await request(app).get("/api/rows").query({ page: "abc", limit: "xyz" });

      expect(res.body.page).toBe(1);
      expect(res.body.items).toHaveLength(1);
    });

    it("clamps a negative page to 1", async () => {
      await Row.create(seedRow({ rowId: 1 }));
      const negative = await request(app).get("/api/rows").query({ page: "-3" });
      const zero = await request(app).get("/api/rows").query({ page: "0" });

      expect(negative.body.page).toBe(1);
      expect(zero.body.page).toBe(1);
    });

    it("clamps a negative limit to 1", async () => {
      for (let i = 1; i <= 3; i++) await Row.create(seedRow({ rowId: i, email: `u${i}@example.com` }));
      const res = await request(app).get("/api/rows").query({ limit: "-5" });

      expect(res.body.items).toHaveLength(1);
    });

    it("falls back a zero limit to the default (0 is falsy, so || 25 wins before Math.max runs)", async () => {
      for (let i = 1; i <= 3; i++) await Row.create(seedRow({ rowId: i, email: `u${i}@example.com` }));
      const res = await request(app).get("/api/rows").query({ limit: "0" });

      expect(res.body.items).toHaveLength(3);
    });

    it("truncates decimal page/limit via parseInt", async () => {
      for (let i = 1; i <= 5; i++) await Row.create(seedRow({ rowId: i, email: `u${i}@example.com` }));
      const res = await request(app).get("/api/rows").query({ limit: "2.9" });

      expect(res.body.items).toHaveLength(2);
    });

    it("returns empty items but correct total/pages for a page beyond the range", async () => {
      await Row.create(seedRow({ rowId: 1 }));
      const res = await request(app).get("/api/rows").query({ page: "5", limit: "10" });

      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(1);
      expect(res.body.pages).toBe(1);
    });
  });

  describe("search filter (q)", () => {
    beforeEach(async () => {
      await Row.create([
        seedRow({ rowId: 1, name: "Jane Doe", email: "jane@foo.com", body: "loves cats" }),
        seedRow({ rowId: 2, name: "John Smith", email: "john@bar.com", body: "loves dogs" }),
      ]);
    });

    it("applies no filter for an empty q", async () => {
      const res = await request(app).get("/api/rows").query({ q: "" });
      expect(res.body.total).toBe(2);
    });

    it("applies no filter for a whitespace-only q", async () => {
      const res = await request(app).get("/api/rows").query({ q: "   " });
      expect(res.body.total).toBe(2);
    });

    it("matches name case-insensitively and partially", async () => {
      const res = await request(app).get("/api/rows").query({ q: "jane" });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].rowId).toBe(1);
    });

    it("matches email case-insensitively and partially", async () => {
      const res = await request(app).get("/api/rows").query({ q: "BAR.COM" });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].rowId).toBe(2);
    });

    it("matches body case-insensitively and partially", async () => {
      const res = await request(app).get("/api/rows").query({ q: "DOGS" });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].rowId).toBe(2);
    });

    it("characterizes current behavior for a regex-special q (unescaped $regex)", async () => {
      // q is passed straight into $regex with no escaping, so an unbalanced
      // group like "(" is an invalid pattern as far as Mongo is concerned.
      const res = await request(app).get("/api/rows").query({ q: "(" });
      expect(res.status).toBe(500);
    });
  });

  describe("pagination math and sorting", () => {
    beforeEach(async () => {
      const rows = Array.from({ length: 30 }, (_, i) => seedRow({ rowId: i + 1, email: `u${i + 1}@example.com` }));
      await Row.create(rows);
    });

    it("slices correctly across pages", async () => {
      const page1 = await request(app).get("/api/rows").query({ page: 1, limit: 10 });
      const page2 = await request(app).get("/api/rows").query({ page: 2, limit: 10 });
      const page3 = await request(app).get("/api/rows").query({ page: 3, limit: 10 });

      expect(page1.body.items.map((r: any) => r.rowId)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
      expect(page2.body.items.map((r: any) => r.rowId)).toEqual(Array.from({ length: 10 }, (_, i) => i + 11));
      expect(page3.body.items.map((r: any) => r.rowId)).toEqual(Array.from({ length: 10 }, (_, i) => i + 21));
      expect(page1.body.pages).toBe(3);
    });

    it("always sorts by rowId ascending regardless of insertion order", async () => {
      await clearTestDb();
      await Row.create([seedRow({ rowId: 3 }), seedRow({ rowId: 1, email: "a@a.com" }), seedRow({ rowId: 2, email: "b@b.com" })]);

      const res = await request(app).get("/api/rows").query({ limit: 10 });
      expect(res.body.items.map((r: any) => r.rowId)).toEqual([1, 2, 3]);
    });
  });
});
