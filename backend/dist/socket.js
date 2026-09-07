"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activity = exports.emit = exports.initSocket = void 0;
const socket_io_1 = require("socket.io");
let io;
const initSocket = (httpServer) => {
    io = new socket_io_1.Server(httpServer, { cors: { origin: "*" } });
    io.on("connection", (s) => s.emit("activity", { text: "Connected", at: Date.now() }));
    return io;
};
exports.initSocket = initSocket;
const emit = (event) => io.emit(event);
exports.emit = emit;
const activity = (text) => io.emit("activity", { text, at: Date.now() });
exports.activity = activity;
