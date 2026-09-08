import mongoose, { Schema } from "mongoose";

export type RowData = {
  rowId: number;
  postId: number;
  name: string;
  email: string;
  body: string;
};

const rowSchema = new Schema<RowData>(
  {
    rowId: { type: Number, required: true, unique: true },
    postId: { type: Number, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    body: { type: String, required: true },
  },
  { timestamps: true }
);

export const Row = mongoose.model("Row", rowSchema);
