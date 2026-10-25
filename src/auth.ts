import type { ExtendedError, Socket } from "socket.io";
import { tokens, users } from "./store";
import type { ClientToServerEvents, InterServerEvents, ServerToClientEvents, SocketData } from "./types";

type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

// Desk 2 ("who are you?") for real-time.
// Runs ONCE, during the handshake, before the connection is accepted.
// After that, every event on this socket is known to come from this user.
export function authenticate(socket: ChatSocket, next: (err?: ExtendedError) => void) {
  const token: unknown = socket.handshake.auth.token;
  const userId = typeof token === "string" ? tokens.get(token) : undefined;
  const user = userId ? users.get(userId) : undefined;

  if (!user) {
    next(new Error("UNAUTHENTICATED")); // client receives a connect_error
    return;
  }

  socket.data.user = user;
  socket.data.recentSends = [];
  next();
}
