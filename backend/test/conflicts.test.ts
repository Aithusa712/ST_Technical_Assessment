import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../socket", () => ({
  emitRowsChanged: vi.fn(),
  activity: vi.fn(),
}));

import { emitRowsChanged, activity } from "../socket";
import { buildTestApp } from "./app";
import { connectTestDb, disconnectTestDb, clearTestDb } from "./db";
import { Row } from "../models";

const app = buildTestApp();

const seedRow = (overrides: Partial<{ rowId: number; postId: number; name: string; email: string; body: string }> = {}) =>
  Row.create({
    rowId: 1,
    postId: 1,
    name: "Alice",
    email: "a@b.com",
    body: "hi",
    ...overrides,
  });

const incomingFor = (rowId: number, overrides: Partial<{ postId: number; name: string; email: string; body: string }> = {}) => ({
  rowId,
  incoming: { postId: 1, name: "Alice", email: "a2@b.com", body: "hi", ...overrides },
});

describe("conflicts routes", () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 60000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    vi.clearAllMocks();
  });

  describe("POST /api/conflicts/resolve", () => {
    it("400s when rowId is missing", async () => {
      const res = await request(app)
        .post("/api/conflicts/resolve")
        .send({ incoming: { postId: 1, name: "Alice", email: "a2@b.com", body: "hi" } });
      expect(res.status).toBe(400);
    });

    it("400s when incoming is missing", async () => {
      const res = await request(app).post("/api/conflicts/resolve").send({ rowId: 1 });
      expect(res.status).toBe(400);
    });

    it("applies the incoming version to the matching Row", async () => {
      await seedRow();
      const { rowId, incoming } = incomingFor(1);

      const res = await request(app).post("/api/conflicts/resolve").send({ rowId, incoming });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect((await Row.findOne({ rowId: 1 }).lean())?.email).toBe("a2@b.com");
    });

    it("emits rows:changed and logs an activity line naming the rowId", async () => {
      await seedRow();
      const { rowId, incoming } = incomingFor(1);

      await request(app).post("/api/conflicts/resolve").send({ rowId, incoming });

      expect(emitRowsChanged).toHaveBeenCalledWith();
      expect(activity).toHaveBeenCalledWith(expect.stringContaining("id 1"));
      expect(activity).toHaveBeenCalledWith(expect.stringContaining("new version applied"));
    });

    it("re-applying the same resolve twice is harmless (no persisted state to guard)", async () => {
      await seedRow();
      const { rowId, incoming } = incomingFor(1);

      const first = await request(app).post("/api/conflicts/resolve").send({ rowId, incoming });
      const second = await request(app).post("/api/conflicts/resolve").send({ rowId, incoming });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect((await Row.findOne({ rowId: 1 }).lean())?.email).toBe("a2@b.com");
    });

    it("does not error when the rowId doesn't match any Row (updateOne is a no-op)", async () => {
      const res = await request(app)
        .post("/api/conflicts/resolve")
        .send(incomingFor(999));
      expect(res.status).toBe(200);
      expect(await Row.countDocuments()).toBe(0);
    });
  });

  describe("POST /api/conflicts/keep-all", () => {
    it("resolves 0 and skips emit/activity when conflicts is missing", async () => {
      const res = await request(app).post("/api/conflicts/keep-all").send({});
      expect(res.body).toEqual({ ok: true, resolved: 0 });
      expect(emitRowsChanged).not.toHaveBeenCalled();
      expect(activity).not.toHaveBeenCalled();
    });

    it("resolves 0 and skips emit/activity when conflicts is an empty array", async () => {
      const res = await request(app).post("/api/conflicts/keep-all").send({ conflicts: [] });
      expect(res.body).toEqual({ ok: true, resolved: 0 });
      expect(emitRowsChanged).not.toHaveBeenCalled();
    });

    it("applies every conflict's incoming version in one request", async () => {
      await seedRow({ rowId: 1, name: "Alice", email: "a@b.com" });
      await seedRow({ rowId: 2, name: "Bob", email: "b@b.com" });

      const res = await request(app)
        .post("/api/conflicts/keep-all")
        .send({
          conflicts: [
            { rowId: 1, incoming: { postId: 1, name: "Alice", email: "a2@b.com", body: "hi" } },
            { rowId: 2, incoming: { postId: 1, name: "Bob", email: "b2@b.com", body: "yo" } },
          ],
        });

      expect(res.body).toEqual({ ok: true, resolved: 2 });
      expect((await Row.findOne({ rowId: 1 }).lean())?.email).toBe("a2@b.com");
      expect((await Row.findOne({ rowId: 2 }).lean())?.email).toBe("b2@b.com");
      expect(emitRowsChanged).toHaveBeenCalledTimes(1);
      expect(activity).toHaveBeenCalledWith("2 conflicts applied");
    });

    it("uses singular wording for a single conflict", async () => {
      await seedRow();
      await request(app).post("/api/conflicts/keep-all").send({ conflicts: [incomingFor(1)] });
      expect(activity).toHaveBeenCalledWith("1 conflict applied");
    });
  });

  describe("no persisted conflict state exists", () => {
    it("GET /api/conflicts does not exist", async () => {
      const res = await request(app).get("/api/conflicts");
      expect(res.status).toBe(404);
    });

    it("POST /api/conflicts/cancel does not exist", async () => {
      const res = await request(app).post("/api/conflicts/cancel");
      expect(res.status).toBe(404);
    });
  });
});
