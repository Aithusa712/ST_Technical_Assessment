import { Router, Request, Response } from "express";
import { Row } from "../models";
import { emitRowsChanged, activity } from "../socket";

const router = Router();

type Incoming = { postId: number; name: string; email: string; body: string };

// Apply one row's incoming version. Nothing is persisted beforehand, so
router.post("/resolve", async (req: Request, res: Response) => {
  const { rowId, incoming } = req.body as { rowId?: number; incoming?: Incoming };
  if (typeof rowId !== "number" || !incoming)
    return res.status(400).json({ error: "rowId and incoming are required." });

  const { postId, name, email, body } = incoming;
  await Row.updateOne({ rowId }, { postId, name, email, body });

  emitRowsChanged();
  activity(`id ${rowId}: new version applied`);
  res.json({ ok: true });
});

// Apply every conflict's incoming version in one request.
router.post("/keep-all", async (req: Request, res: Response) => {
  const { conflicts } = req.body as { conflicts?: { rowId: number; incoming: Incoming }[] };
  if (!Array.isArray(conflicts) || !conflicts.length) return res.json({ ok: true, resolved: 0 });

  for (const c of conflicts) {
    const { postId, name, email, body } = c.incoming;
    await Row.updateOne({ rowId: c.rowId }, { postId, name, email, body });
  }

  emitRowsChanged();
  activity(`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} applied`);
  res.json({ ok: true, resolved: conflicts.length });
});

export default router;
