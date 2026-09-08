import { Router, Request, Response } from "express";
import { parse } from "csv-parse/sync";
import { Row, type RowData } from "../models";
import { emitRowsChanged, activity } from "../socket";

const router = Router();

const REQUIRED_COLUMNS = ["postId", "id", "name", "email", "body"];
const COMPARABLE_FIELDS = ["postId", "name", "email", "body"] as const;

type ConflictEntry = {
  rowId: number;
  incoming: RowData;
  changes: { field: string; oldValue: string; newValue: string }[];
};

/** Which fields differ between the stored row and the incoming one. */
const diff = (a: any, b: any) =>
  COMPARABLE_FIELDS.filter((f) => String(a[f] ?? "") !== String(b[f] ?? "")).map((f) => ({
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

  const missing = REQUIRED_COLUMNS.filter((c) => !(c in records[0]));
  if (missing.length)
    return res.status(400).json({ error: `Missing column(s): ${missing.join(", ")}` });

  const docs: RowData[] = [];
  const errors: string[] = [];
  const seen = new Set<number>();

  records.forEach((r, i) => {
    const line = i + 2;
    const rowId = Number((r.id ?? "").trim());
    const postId = Number((r.postId ?? "").trim());
    const name = (r.name ?? "").trim();
    const email = (r.email ?? "").trim();
    const body = (r.body ?? "").trim();

    if (!Number.isInteger(rowId) || !Number.isInteger(postId))
      return errors.push(`Line ${line}: id and postId must be whole numbers.`);
    if (seen.has(rowId))
      return errors.push(`Line ${line}: id ${rowId} appears twice in this file.`);
    if (!name || !body) return errors.push(`Line ${line}: name and body can't be blank.`);
    if (!/^\S+@\S+\.\S+$/.test(email)) return errors.push(`Line ${line}: invalid email.`);

    seen.add(rowId);
    docs.push({ rowId, postId, name, email, body });
  });

  if (errors.length)
    return res.status(422).json({ error: "Fix these rows and upload again.", errors });

  const existing = await Row.find({ rowId: { $in: [...seen] } }).lean();
  const byId = new Map(existing.map((d) => [d.rowId, d]));

  const inserts: RowData[] = [];
  const conflicts: ConflictEntry[] = [];
  let unchanged = 0;

  for (const doc of docs) {
    const current = byId.get(doc.rowId);
    if (!current) {
      inserts.push(doc);
      continue;
    }
    const changes = diff(current, doc);
    if (!changes.length) unchanged++;
    else conflicts.push({ rowId: doc.rowId, incoming: doc, changes });
  }

  const added = inserts.length ? await Row.insertMany(inserts, { ordered: false }) : [];

  if (added.length) {
    emitRowsChanged();
    activity(`${added.length} new row${added.length > 1 ? "s" : ""} added`);
  }
  if (conflicts.length) {
    activity(`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} need review`);
  }
  if (!added.length && !conflicts.length) activity("Upload had no changes");

  // Conflicts are never persisted — they're only ever held by the uploading
  // tab's own response, so there's nothing server-side to scope or clean up.
  res.status(201).json({ added: added.length, unchanged, conflicts });
});

export default router;
