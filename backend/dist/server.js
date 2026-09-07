"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const socket_1 = require("./socket");
const upload_1 = __importDefault(require("./routes/upload"));
const rows_1 = __importDefault(require("./routes/rows"));
const conflicts_1 = __importDefault(require("./routes/conflicts"));
const MONGO_URI = "mongodb://mongo:27017/csvdata";
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.text({ type: ["text/csv", "text/plain"], limit: "25mb" }));
app.use("/api/upload", upload_1.default);
app.use("/api/rows", rows_1.default);
app.use("/api/conflicts", conflicts_1.default);
const httpServer = (0, http_1.createServer)(app);
(0, socket_1.initSocket)(httpServer);
mongoose_1.default
    .connect(MONGO_URI)
    .then(() => httpServer.listen(5000, () => console.log(`http://localhost:5000`)))
    .catch((e) => {
    console.error("Mongo connection failed:", e.message);
    process.exit(1);
});
