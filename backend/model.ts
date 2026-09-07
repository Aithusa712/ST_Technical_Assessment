import  { Schema, model } from "mongoose";

type Row = {
  Id: number;
  postId: number;
  name: string;
  email: string;
  body: string;
};
 
const rowSchema = new Schema<Row>(
  {
    Id: { type: Number, required: true, unique: true },
    postId: { type: Number, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);
rowSchema.index({ name: "text", email: "text", body: "text" });
 
const conflictSchema = new Schema(
  {
    commentId: { type: Number, required: true },
    existing: { type: Object, required: true },
    incoming: { type: Object, required: true },
    changes: [{ field: String, oldValue: String, newValue: String }],
    status: { type: String, enum: ["pending", "resolved"], default: "pending" },
  },
  { timestamps: true }
);


export const RowModel = model<Row>("Row", rowSchema);
export const ConflictModel = model("Conflict", conflictSchema);
