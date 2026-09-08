import { Router, Request, Response } from "express";
import { Row, Conflict } from "../models";
import { emit, activity } from "../socket";

const router = Router();

const applyIncoming = async (c: any) => {
  const { postId, name, email, body } = c.incoming;
  await Row.updateOne({ id: c.id }, { postId, name, email, body });
};

/** Scoped to one review — never lists another session's conflicts. */
router.get("/", async (req: Request, res: Response) => {
  const reviewId = String(req.query.reviewId ?? "");
  if (!reviewId) return res.status(400).json({ error: "reviewId is required" });

  res.json(await Conflict.find({ reviewId, status: "pending" }).sort({ id: 1 }).lean());
});

/** Keep = use the new version. Delete = discard it, current row stands. */
router.post("/:id/resolve", async (req: Request, res: Response) => {
  const keep = req.query.keep;
  if (keep !== "new" && keep !== "current")
    return res.status(400).json({ error: "keep must be 'new' or 'current'." });

  // The status guard is what stops two sessions applying opposite choices.
  const c = await Conflict.findOneAndUpdate(
    { _id: req.params.id, status: "pending" },
    { status: "resolved" },
    { new: true }
  );
  if (!c) return res.status(409).json({ error: "Another session already handled this one." });

  if (keep === "new") {
    await applyIncoming(c);
    emit("rows:changed");
  }
  activity(`id ${c.id}: ${keep === "new" ? "new version applied" : "new version discarded"}`);
  res.json({ ok: true });
});

/** Keep all: apply every incoming version in this review. */
router.post("/keep-all", async (req: Request, res: Response) => {
  const reviewId = String(req.query.reviewId ?? "");
  if (!reviewId) return res.status(400).json({ error: "reviewId is required" });

  const pending = await Conflict.find({ reviewId, status: "pending" }).lean();
  if (!pending.length) return res.json({ ok: true, resolved: 0 });

  for (const c of pending) await applyIncoming(c);
  await Conflict.updateMany({ reviewId, status: "pending" }, { status: "resolved" });

  emit("rows:changed");
  activity(`${pending.length} conflict${pending.length > 1 ? "s" : ""} applied`);
  res.json({ ok: true, resolved: pending.length });
});

/** Cancel: close the review without applying anything. Data is untouched. */
router.post("/cancel", async (req: Request, res: Response) => {
  const reviewId = String(req.query.reviewId ?? "");
  if (!reviewId) return res.status(400).json({ error: "reviewId is required" });

  const { modifiedCount } = await Conflict.updateMany(
    { reviewId, status: "pending" },
    { status: "resolved" }
  );
  if (!modifiedCount) return res.json({ ok: true, cancelled: 0 });

  activity("Conflict review cancelled — nothing changed");
  res.json({ ok: true, cancelled: modifiedCount });
});

export default router;
