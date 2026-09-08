import { Router, Request, Response } from "express";
import { Row } from "../models";

const router = Router();

/** Paginated, optionally-searched view over the stored rows. */
router.get("/", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.max(1, parseInt(String(req.query.limit ?? "25"), 10) || 25);
  const q = String(req.query.q ?? "").trim();

  const filter = q
    ? {
        $or: [
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { body: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  const total = await Row.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / limit));

  const items = await Row.find(filter)
    .sort({ rowId: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  res.json({ items, total, page, pages });
});

export default router;
