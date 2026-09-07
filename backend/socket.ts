import { Server } from "socket.io";
import type { Server as HttpServer } from "http";


let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, { cors: { origin: "*" } });
  io.on("connection", (s) => s.emit("activity", { text: "Connected", at: Date.now() }));
  return io;
};

export const emit = (event: "rows:changed") => io.emit(event);

export const activity = (text: string) => io.emit("activity", { text, at: Date.now() });
