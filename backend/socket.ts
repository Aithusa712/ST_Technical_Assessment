import { Server } from "socket.io";
import type { Server as HttpServer } from "http";


let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, { cors: { origin: "*" } });
  return io;
};

export const emitRowsChanged = () => io.emit("rows:changed");

export const activity = (text: string) => io.emit("activity", { text, at: Date.now() });
