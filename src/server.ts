import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import { authenticate } from "./auth";
import { registerChatHandlers, type ChatServer } from "./chat";

const PORT = Number(process.env.PORT ?? 3001);

// 1. A normal Express app: serves the web page and a health check over plain HTTP.
const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// 2. Create the raw HTTP server ourselves, instead of app.listen().
// Why: Socket.io must attach to it, because the WebSocket "Upgrade" request
// (the one answered with 101 Switching Protocols) arrives at this HTTP server.
const httpServer = createServer(app);

// 3. Socket.io on the same server and port. Same origin as the page, so no CORS setup.
const io: ChatServer = new Server(httpServer, {
  pingInterval: 25000, // heartbeat: ping every 25 s...
  pingTimeout: 20000, // ...and treat the connection as dead if no pong within 20 s
});

io.use(authenticate); // runs once per connection, before "connection"
io.on("connection", (socket) => registerChatHandlers(socket));

httpServer.listen(PORT, () => {
  console.log(`Chat on http://localhost:${PORT}`);
});

// --- Running more than one server? (Part 1's cross-server problem) ---
// Add the Redis adapter, and io.to(room).emit(...) reaches users on EVERY server:
//
//   import { createAdapter } from "@socket.io/redis-adapter";
//   import { createClient } from "redis";
//   const pub = createClient({ url: process.env.REDIS_URL });
//   const sub = pub.duplicate();
//   await Promise.all([pub.connect(), sub.connect()]);
//   io.adapter(createAdapter(pub, sub));
//
// The handlers in chat.ts don't change at all. That's the payoff of keeping them clean.
