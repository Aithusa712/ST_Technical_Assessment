import express, { Request, Response } from "express";
import mongoose, { Schema } from "mongoose";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect("")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));


const dataSchema = new Schema({
  postId: {type: Number, required: true},
  ID: {type: Number, required: true},
  name: { type: String, required: true },
  email: { type: String, required: true },
  content: { type: String, required: true }
}, { timestamps: true });


const Data = mongoose.model("Data", dataSchema);

app.post("/api/dataUpload", async (req: Request, res: Response) => {

});

app.get("/api/dataRow", async (req: Request, res: Response) => {
  // const page = parseInt(req.query.page) || 1;
  // const limit = parseInt(req.query.limit) || 50;
  // const offset = (page - 1) * limit;
  const entries = await Data.find();

  res.json(entries);
});

app.get("/api/dataRow/:id", async (req: Request, res: Response) => {
  const data = await Data.findById(req.params.id);
  if (!data) return res.status(404).json({ error: "Not found" });
  res.json(data);
});

app.listen(5000);
