import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { ROOMS, addMessage, messagesAfter } from "./store";
import type {
  Ack,
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./types";

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// ---------- The real-time version of AppError + the error handler ----------

class ChatError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Wrap every handler: success -> ok ack; ChatError -> its code; anything else -> INTERNAL.
// Same idea as the one Express error handler: one place decides how failures look.
function guarded<T>(ack: Ack<T> | undefined, work: () => T) {
  const reply = typeof ack === "function" ? ack : () => {}; // client may not send an ack
  try {
    reply({ ok: true, data: work() });
  } catch (err) {
    if (err instanceof ChatError) {
      reply({ ok: false, error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err); // our bug: full details in the log only
    reply({ ok: false, error: { code: "INTERNAL", message: "Something went wrong" } });
  }
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new ChatError("VALIDATION_ERROR", "Invalid data");
  return result.data;
}

// ---------- What each event must look like ----------

const JoinPayload = z
  .object({
    roomId: z.string(),
    lastSeenId: z.number().int().nonnegative().optional(), // the bookmark, on reconnect
  })
  .strict();

// .strict(): a client can't sneak in "userName": "Admin" or a fake "sentAt".
const SendPayload = z
  .object({
    roomId: z.string(),
    text: z.string().trim().min(1).max(1000),
  })
  .strict();

const TypingPayload = z.object({ roomId: z.string() }).strict();

// ---------- Rate limiting: max 5 messages per 5 seconds per connection ----------

const WINDOW_MS = 5000;
const MAX_IN_WINDOW = 5;

function isRateLimited(data: SocketData): boolean {
  const now = Date.now();
  data.recentSends = data.recentSends.filter((t) => now - t < WINDOW_MS);
  if (data.recentSends.length >= MAX_IN_WINDOW) return true;
  data.recentSends.push(now);
  return false;
}

// ---------- The event handlers ----------

export function registerChatHandlers(socket: ChatSocket) {
  const { user } = socket.data;
  console.log(`${user.name} connected (${socket.id})`);

  // Join a room. Returns recent messages, or everything after `lastSeenId` on reconnect.
  socket.on("room:join", (payload, ack) =>
    guarded(ack, () => {
      const { roomId, lastSeenId } = parse(JoinPayload, payload);
      if (!ROOMS.has(roomId)) throw new ChatError("ROOM_NOT_FOUND", `No room ${roomId}`);

      void socket.join(roomId); // rooms live on the SERVER, per connection
      return { messages: messagesAfter(roomId, lastSeenId) };
    }),
  );

  // Send a message to a room.
  socket.on("message:send", (payload, ack) =>
    guarded(ack, () => {
      const { roomId, text } = parse(SendPayload, payload);

      // Desk 4: are you allowed? Only members of a room can post in it.
      if (!socket.rooms.has(roomId)) throw new ChatError("NOT_IN_ROOM", "Join the room first");
      if (isRateLimited(socket.data)) throw new ChatError("RATE_LIMITED", "Slow down");

      const message = addMessage(roomId, user, text); // 1. save first...
      socket.to(roomId).emit("message:new", message); // 2. ...then tell everyone ELSE
      return { message }; // 3. the sender learns it worked from the ack
    }),
  );

  // "Kamal is typing..." Losing one of these doesn't matter, so `volatile`:
  // if the receiver isn't ready, Socket.io simply drops it (UDP-style thinking, Lesson 2).
  socket.on("typing", (payload) =>
    guarded(undefined, () => {
      const { roomId } = parse(TypingPayload, payload);
      if (!socket.rooms.has(roomId)) return;
      socket.to(roomId).volatile.emit("typing", { roomId, userName: user.name });
    }),
  );

  socket.on("disconnect", (reason) => {
    console.log(`${user.name} disconnected: ${reason}`);
  });
}
