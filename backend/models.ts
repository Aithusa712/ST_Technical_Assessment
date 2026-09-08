import mongoose, { Schema } from "mongoose";

export type RowData = {
  id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
};

const rowSchema = new Schema<RowData>(
  {
    // The unique index is also what protects against two sessions uploading
    // the same new id at the same moment.
    id: { type: Number, required: true, unique: true },
    postId: { type: Number, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

export const Row = mongoose.model("Row", rowSchema);

const conflictSchema = new Schema(
  {
    reviewId: { type: String, required: true, index: true },
    id: { type: Number, required: true },
    existing: { type: Object, required: true },
    incoming: { type: Object, required: true },
    changes: [{ field: String, oldValue: String, newValue: String }],
    status: { type: String, enum: ["pending", "resolved"], default: "pending" },
  },
  { timestamps: true }
);

// Without sessionStorage-based recovery, an abandoned review (tab closed
// before resolving) has no way to be found or resolved again. Auto-expiring
// it after a day stops it from sitting as a permanently stuck, invisible row.
// Scoped to "pending" only, so resolved conflicts still persist as before.
conflictSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24, partialFilterExpression: { status: "pending" } }
);

export const Conflict = mongoose.model("Conflict", conflictSchema);
