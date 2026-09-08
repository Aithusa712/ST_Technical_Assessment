import { Router, Request, Response } from "express";
import { parse } from "csv-parse/sync";
import { randomUUID } from "crypto";
import { Row, Conflict, type RowData } from "../models";
import { emit, activity } from "../socket";

const router = Router();

const REQUIRED = ["postId", "id", "name", "email", "body"];
const FIELDS = ["postId", "name", "email", "body"] as const;

/** Which fields differ between the stored row and the incoming one. */
const diff = (a: any, b: any) =>
  FIELDS.filter((f) => String(a[f] ?? "") !== String(b[f] ?? "")).map((f) => ({
    field: f,
    oldValue: String(a[f] ?? ""),
    newValue: String(b[f] ?? ""),
  }));

router.post("/", async (req: Request, res: Response) => {
  const text = typeof req.body === "string" ? req.body : "";
  if (!text.trim()) return res.status(400).json({ error: "The file is empty." });

  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: (h: string[]) => h.map((s) => s.trim()),
      delimiter: [",", "\t"],
      skip_empty_lines: true,
      bom: true,
    });
  } catch {
    return res.status(400).json({ error: "That file isn't valid CSV." });
  }

  if (!records.length) return res.status(400).json({ error: "No data rows found." });

  const missing = REQUIRED.filter((c) => !(c in records[0]));
  if (missing.length)
    return res.status(400).json({ error: `Missing column(s): ${missing.join(", ")}` });

  const docs: RowData[] = [];
  const errors: string[] = [];
  const seen = new Set<number>();

  records.forEach((r, i) => {
    const line = i + 2; 
    const id = Number((r.id ?? "").trim());
    const postId = Number((r.postId ?? "").trim());
    const name = (r.name ?? "").trim();
    const email = (r.email ?? "").trim();
    const body = (r.body ?? "").trim();

    if (!Number.isInteger(id) || !Number.isInteger(postId))
      return errors.push(`Line ${line}: id and postId must be whole numbers.`);
    if (seen.has(id))
      return errors.push(`Line ${line}: id ${id} appears twice in this file.`);
    if (!name || !body) return errors.push(`Line ${line}: name and body can't be blank.`);
    if (!/^\S+@\S+\.\S+$/.test(email)) return errors.push(`Line ${line}: invalid email.`);

    seen.add(id);
    docs.push({ id, postId, name, email, body });
  });

  if (errors.length)
    return res.status(422).json({ error: "Fix these rows and upload again.", errors });

  const reviewId = randomUUID();
  const existing = await Row.find({ id: { $in: [...seen] } }).lean();
  const byId = new Map(existing.map((d) => [d.id, d]));

  const inserts: RowData[] = [];
  const conflicts: any[] = [];
  let unchanged = 0;

  for (const doc of docs) {
    const current = byId.get(doc.id);
    if (!current) {
      inserts.push(doc);
      continue;
    }
    const changes = diff(current, doc);
    if (!changes.length) unchanged++;
    else
      conflicts.push({
        reviewId,
        id: doc.id,
        existing: current,
        incoming: doc,
        changes,
      });
  }

  const added = inserts.length ? await Row.insertMany(inserts, { ordered: false }) : [];
  const flagged = conflicts.length ? await Conflict.insertMany(conflicts) : [];

  if (added.length) {
    emit("rows:changed");
    activity(`${added.length} new row${added.length > 1 ? "s" : ""} added`);
  }
  if (flagged.length) {
    activity(`${flagged.length} conflict${flagged.length > 1 ? "s" : ""} need review`);
  }
  if (!added.length && !flagged.length) activity("Upload had no changes");

  // Conflicts are handed back only to the session that caused them, not
  // broadcast — nobody else should see or be able to resolve someone else's upload.
  res.status(201).json({
    reviewId,
    added: added.length,
    unchanged,
    conflicts: flagged.map((c) => ({ _id: String(c._id), id: c.id, changes: c.changes })),
  });
});

export default router;
