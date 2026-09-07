"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const models_1 = require("../models");
const socket_1 = require("../socket");
const router = (0, express_1.Router)();
/** Overwrite the stored row with the version from the uploaded file. */
const applyIncoming = async (c) => {
    const { postId, name, email, body } = c.incoming;
    await models_1.Row.updateOne({ id: c.id }, { postId, name, email, body });
};
router.get("/", async (_req, res) => {
    res.json(await models_1.Conflict.find({ status: "pending" }).sort({ id: 1 }).lean());
});
/** Keep = use the new version. Delete = discard it, current row stands. */
router.post("/:id/resolve", async (req, res) => {
    const keep = req.query.keep;
    if (keep !== "new" && keep !== "current")
        return res.status(400).json({ error: "keep must be 'new' or 'current'." });
    // The status guard is what stops two sessions applying opposite choices.
    const c = await models_1.Conflict.findOneAndUpdate({ _id: req.params.id, status: "pending" }, { status: "resolved" }, { new: true });
    if (!c)
        return res.status(409).json({ error: "Another session already handled this one." });
    if (keep === "new") {
        await applyIncoming(c);
        (0, socket_1.emit)("rows:changed");
    }
    (0, socket_1.emit)("conflicts:changed");
    (0, socket_1.activity)(`id ${c.id}: ${keep === "new" ? "new version applied" : "new version discarded"}`);
    res.json({ ok: true });
});
/** Keep all: apply every incoming version. */
router.post("/keep-all", async (_req, res) => {
    const pending = await models_1.Conflict.find({ status: "pending" }).lean();
    if (!pending.length)
        return res.json({ ok: true, resolved: 0 });
    for (const c of pending)
        await applyIncoming(c);
    await models_1.Conflict.updateMany({ status: "pending" }, { status: "resolved" });
    (0, socket_1.emit)("rows:changed");
    (0, socket_1.emit)("conflicts:changed");
    (0, socket_1.activity)(`${pending.length} conflict${pending.length > 1 ? "s" : ""} applied`);
    res.json({ ok: true, resolved: pending.length });
});
/** Cancel: close the review without applying anything. Data is untouched. */
router.post("/cancel", async (_req, res) => {
    const { modifiedCount } = await models_1.Conflict.updateMany({ status: "pending" }, { status: "resolved" });
    if (!modifiedCount)
        return res.json({ ok: true, cancelled: 0 });
    (0, socket_1.emit)("conflicts:changed");
    (0, socket_1.activity)("Conflict review cancelled — nothing changed");
    res.json({ ok: true, cancelled: modifiedCount });
});
exports.default = router;
