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

const csv = (rows: string[], header = "id,postId,name,email,body") => [header, ...rows].join("\n");

const post = (body: string) =>
  request(app).post("/api/upload").set("Content-Type", "text/csv").send(body);

describe("POST /api/upload", () => {
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

  describe("request body validation", () => {
    it("400s on a missing body", async () => {
      const res = await request(app).post("/api/upload").set("Content-Type", "text/csv");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("The file is empty.");
    });

    it("400s on a whitespace-only body", async () => {
      const res = await post("   \n  ");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("The file is empty.");
    });

    it("400s on malformed CSV", async () => {
      const res = await post('id,postId,name,email,body\n1,1,"unterminated,a@b.com,body');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("That file isn't valid CSV.");
    });

    it("400s when there are zero data rows", async () => {
      const res = await post("id,postId,name,email,body");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No data rows found.");
    });

    it("400s listing a single missing required column", async () => {
      const res = await post(csv(["1,1,Alice,a@b.com"], "id,postId,name,email"));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing column(s): body");
    });

    it("400s listing multiple missing required columns", async () => {
      const res = await post(csv(["1,Alice,a@b.com"], "id,name,email"));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing column(s): postId, body");
    });
  });

  describe("per-row 422 validation", () => {
    it("flags a non-integer id", async () => {
      const res = await post(csv(["abc,1,Alice,a@b.com,hi"]));
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatch(/whole numbers/);
    });

    it("flags a non-integer postId", async () => {
      const res = await post(csv(["1,1.5,Alice,a@b.com,hi"]));
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatch(/whole numbers/);
    });

    it("flags a duplicate id within the same file", async () => {
      const res = await post(csv(["1,1,Alice,a@b.com,hi", "1,1,Bob,b@b.com,yo"]));
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatch(/appears twice/);
    });

    it("flags a blank name", async () => {
      const res = await post(csv(["1,1,,a@b.com,hi"]));
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatch(/can't be blank/);
    });

    it("flags a blank body", async () => {
      const res = await post(csv(["1,1,Alice,a@b.com,"]));
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatch(/can't be blank/);
    });

    it("flags an invalid email", async () => {
      const res = await post(csv(["1,1,Alice,not-an-email,hi"]));
      expect(res.status).toBe(422);
      expect(res.body.errors[0]).toMatch(/invalid email/);
    });

    it("collects multiple bad rows into one response", async () => {
      const res = await post(csv(["abc,1,Alice,a@b.com,hi", "2,1,,b@b.com,yo"]));
      expect(res.status).toBe(422);
      expect(res.body.errors).toHaveLength(2);
      expect(res.body.error).toBe("Fix these rows and upload again.");
    });

    it("does not write anything to the DB when validation fails", async () => {
      await post(csv(["abc,1,Alice,a@b.com,hi"]));
      expect(await Row.countDocuments()).toBe(0);
    });
  });

  describe("parsing mechanics", () => {
    it("trims header and value whitespace", async () => {
      const res = await post(csv([" 1 , 1 , Alice , a@b.com , hi "], " id , postId , name , email , body "));
      expect(res.status).toBe(201);
      const row = await Row.findOne({ rowId: 1 }).lean();
      expect(row?.name).toBe("Alice");
    });

    it("parses a comma-delimited file", async () => {
      const res = await post(csv(["1,1,Alice,a@b.com,hi"]));
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(1);
    });

    it("parses a tab-delimited file", async () => {
      const body = ["id\tpostId\tname\temail\tbody", "1\t1\tAlice\ta@b.com\thi"].join("\n");
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(1);
    });

    it("parses a UTF-8 BOM-prefixed file", async () => {
      const body = "﻿" + csv(["1,1,Alice,a@b.com,hi"]);
      const res = await post(body);
      expect(res.status).toBe(201);
      expect(res.body.added).toBe(1);
    });
  });

  describe("diff / insert / conflict logic", () => {
    it("inserts a row with a new id", async () => {
      const res = await post(csv(["1,1,Alice,a@b.com,hi"]));
      expect(res.body.added).toBe(1);
      expect(res.body.unchanged).toBe(0);
      expect(res.body.conflicts).toHaveLength(0);
      expect(await Row.countDocuments()).toBe(1);
    });

    it("counts an identical existing row as unchanged, no conflict created", async () => {
      await Row.create({ rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" });
      const res = await post(csv(["1,1,Alice,a@b.com,hi"]));

      expect(res.body.added).toBe(0);
      expect(res.body.unchanged).toBe(1);
      expect(res.body.conflicts).toHaveLength(0);
    });

    it("flags a conflict when a field differs, with the correct changes array and incoming payload", async () => {
      await Row.create({ rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" });
      const res = await post(csv(["1,1,Alice,a2@b.com,hi"]));

      expect(res.body.added).toBe(0);
      expect(res.body.unchanged).toBe(0);
      expect(res.body.conflicts).toHaveLength(1);
      expect(res.body.conflicts[0].rowId).toBe(1);
      expect(res.body.conflicts[0].changes).toEqual([{ field: "email", oldValue: "a@b.com", newValue: "a2@b.com" }]);
      expect(res.body.conflicts[0].incoming).toEqual({
        rowId: 1,
        postId: 1,
        name: "Alice",
        email: "a2@b.com",
        body: "hi",
      });

      // the row itself must NOT be mutated until the conflict is resolved
      const row = await Row.findOne({ rowId: 1 }).lean();
      expect(row?.email).toBe("a@b.com");
    });

    it("handles a mixed batch of insert + conflict + unchanged together", async () => {
      await Row.create([
        { rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" },
        { rowId: 2, postId: 1, name: "Bob", email: "b@b.com", body: "yo" },
      ]);

      const res = await post(
        csv([
          "1,1,Alice,a@b.com,hi", // unchanged
          "2,1,Bob,b2@b.com,yo", // conflict (email differs)
          "3,1,Carl,c@b.com,sup", // new insert
        ])
      );

      expect(res.body.added).toBe(1);
      expect(res.body.unchanged).toBe(1);
      expect(res.body.conflicts).toHaveLength(1);
      expect(res.body.conflicts[0].rowId).toBe(2);
      expect(await Row.countDocuments({ rowId: 3 })).toBe(1);
    });
  });

  describe("response shape", () => {
    it("conflict entries expose exactly rowId/incoming/changes, no server-generated id", async () => {
      await Row.create({ rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" });
      const res = await post(csv(["1,1,Alice,a2@b.com,hi"]));

      const conflict = res.body.conflicts[0];
      expect(Object.keys(conflict).sort()).toEqual(["changes", "incoming", "rowId"]);
    });

    it("response has no reviewId or batchId field at all", async () => {
      const res = await post(csv(["1,1,Alice,a@b.com,hi"]));
      expect(res.body.reviewId).toBeUndefined();
      expect(res.body.batchId).toBeUndefined();
    });
  });

  describe("side effects", () => {
    it("emits rows:changed and reports the added count when rows are added", async () => {
      await post(csv(["1,1,Alice,a@b.com,hi", "2,1,Bob,b@b.com,yo"]));
      expect(emitRowsChanged).toHaveBeenCalledWith();
      expect(activity).toHaveBeenCalledWith("2 new rows added");
    });

    it("uses singular wording for a single added row", async () => {
      await post(csv(["1,1,Alice,a@b.com,hi"]));
      expect(activity).toHaveBeenCalledWith("1 new row added");
    });

    it("does not emit when nothing was added", async () => {
      await Row.create({ rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" });
      await post(csv(["1,1,Alice,a@b.com,hi"]));
      expect(emitRowsChanged).not.toHaveBeenCalled();
    });

    it("reports conflicts independently of added, with plural wording", async () => {
      await Row.create([
        { rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" },
        { rowId: 2, postId: 1, name: "Bob", email: "b@b.com", body: "yo" },
      ]);
      await post(csv(["1,1,Alice,a2@b.com,hi", "2,1,Bob,b2@b.com,yo"]));
      expect(activity).toHaveBeenCalledWith("2 conflicts need review");
    });

    it("reports 'Upload had no changes' when nothing added and nothing flagged", async () => {
      await Row.create({ rowId: 1, postId: 1, name: "Alice", email: "a@b.com", body: "hi" });
      await post(csv(["1,1,Alice,a@b.com,hi"]));
      expect(activity).toHaveBeenCalledWith("Upload had no changes");
      expect(emitRowsChanged).not.toHaveBeenCalled();
    });
  });
});
