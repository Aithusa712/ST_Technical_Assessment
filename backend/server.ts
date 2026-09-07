import mongoose from "mongoose";
// import { RowModel, ConflictModel, type Row } from "./model";
import express, { Request, Response } from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
// import { parse } from "csv-parse/sync";
 
const PORT = Number(process.env.PORT) || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/csvcollab";
 
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: ["text/csv", "text/plain"], limit: "25mb" }));
 
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });


mongoose
  .connect(MONGO_URI)
  .then(() => httpServer.listen(PORT, () => console.log(`http://localhost:${PORT}`)))
  .catch((e) => {
    console.error("Mongo connection failed:", e.message);
    process.exit(1);
  });

