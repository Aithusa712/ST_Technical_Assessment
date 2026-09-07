"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sync_1 = require("csv-parse/sync");
const crypto_1 = require("crypto");
const models_1 = require("../models");
const socket_1 = require("../socket");
const router = (0, express_1.Router)();
const REQUIRED = ["postId", "id", "name", "email", "body"];
const FIELDS = ["postId", "name", "email", "body"];
/** Which fields differ between the stored row and the incoming one. */
const diff = (a, b) => FIELDS.filter((f) => String(a[f] ?? "") !== String(b[f] ?? "")).map((f) => ({
    field: f,
    oldValue: String(a[f] ?? ""),
    newValue: String(b[f] ?? ""),
}));
router.post("/", async (req, res) => {
    const text = typeof req.body === "string" ? req.body : "";
    if (!text.trim())
        return res.status(400).json({ error: "The file is empty." });
    let records;
    try {
        records = (0, sync_1.parse)(text, {
            columns: (h) => h.map((s) => s.trim()),
            delimiter: [",", "\t"],
            skip_empty_lines: true,
            bom: true,
        });
    }
    catch {
        return res.status(400).json({ error: "That file isn't valid CSV." });
    }
    if (!records.length)
        return res.status(400).json({ error: "No data rows found." });
    const missing = REQUIRED.filter((c) => !(c in records[0]));
    if (missing.length)
        return res.status(400).json({ error: `Missing column(s): ${missing.join(", ")}` });
    const docs = [];
    const errors = [];
    const seen = new Set();
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
        if (!name || !body)
            return errors.push(`Line ${line}: name and body can't be blank.`);
        if (!/^\S+@\S+\.\S+$/.test(email))
            return errors.push(`Line ${line}: invalid email.`);
        seen.add(id);
        docs.push({ id, postId, name, email, body });
    });
    if (errors.length)
        return res.status(422).json({ error: "Fix these rows and upload again.", errors });
    const batchId = (0, crypto_1.randomUUID)();
    const existing = await models_1.Row.find({ id: { $in: [...seen] } }).lean();
    const byId = new Map(existing.map((d) => [d.id, d]));
    const inserts = [];
    const conflicts = [];
    let unchanged = 0;
    for (const doc of docs) {
        const current = byId.get(doc.id);
        if (!current) {
            inserts.push(doc);
            continue;
        }
        const changes = diff(current, doc);
        if (!changes.length)
            unchanged++;
        else
            conflicts.push({
                batchId,
                id: doc.id,
                existing: current,
                incoming: doc,
                changes,
            });
    }
    const added = inserts.length ? await models_1.Row.insertMany(inserts, { ordered: false }) : [];
    const flagged = conflicts.length ? await models_1.Conflict.insertMany(conflicts) : [];
    if (added.length) {
        (0, socket_1.emit)("rows:changed");
        (0, socket_1.activity)(`${added.length} new row${added.length > 1 ? "s" : ""} added`);
    }
    if (flagged.length) {
        (0, socket_1.emit)("conflicts:changed");
        (0, socket_1.activity)(`${flagged.length} conflict${flagged.length > 1 ? "s" : ""} need review`);
    }
    if (!added.length && !flagged.length)
        (0, socket_1.activity)("Upload had no changes");
    res.status(201).json({ batchId, added: added.length, unchanged, conflicts: flagged.length });
});
exports.default = router;
