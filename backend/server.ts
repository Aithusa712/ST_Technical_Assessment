import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { createServer } from "http";
import { initSocket } from "./socket";
import uploadRouter from "./routes/upload";
import rowsRouter from "./routes/rows";
import conflictsRouter from "./routes/conflicts";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://mongo:27017/csvdata";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "25mb" }));

app.use("/api/upload", uploadRouter);
app.use("/api/rows", rowsRouter);
app.use("/api/conflicts", conflictsRouter);

const httpServer = createServer(app);
initSocket(httpServer); 

mongoose
  .connect(MONGO_URI)
  .then(() => httpServer.listen(5000, () => console.log(`http://localhost:5000`)))
  .catch((e) => {
    console.error("Mongo connection failed:", e.message);
    process.exit(1);
  });
