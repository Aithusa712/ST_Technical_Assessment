import express from "express";
import rowsRouter from "../routes/rows";
import uploadRouter from "../routes/upload";
import conflictsRouter from "../routes/conflicts";

/** Mirrors server.ts's middleware/mount order without touching mongoose.connect or app.listen. */
export function buildTestApp() {
  const app = express();
  app.use(express.json());
  app.use(express.text({ type: ["text/csv", "text/plain"], limit: "25mb" }));

  app.use("/api/upload", uploadRouter);
  app.use("/api/rows", rowsRouter);
  app.use("/api/conflicts", conflictsRouter);

  return app;
}
