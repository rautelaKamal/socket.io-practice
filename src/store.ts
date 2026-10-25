// The "records room" for chat. In-memory for now; a real app saves messages
// in a database so they survive restarts and can be fetched by any server.

export type User = { id: string; name: string };

export type Message = {
  id: number; // increases by 1 per room: this is the BOOKMARK for catch-up
  roomId: string;
  userId: string;
  userName: string;
  text: string;
  sentAt: string;
};

export const users = new Map<string, User>([
  ["u1", { id: "u1", name: "Kamal" }],
  ["u2", { id: "u2", name: "Rohit" }],
  ["u3", { id: "u3", name: "Meera" }],
]);

// Stand-in for real login (Week 8): token -> userId
export const tokens = new Map<string, string>([
  ["token-kamal", "u1"],
  ["token-rohit", "u2"],
  ["token-meera", "u3"],
]);

// Only these rooms exist. Joining anything else is rejected.
export const ROOMS = new Set(["general", "floor-2"]);

const MAX_KEPT_PER_ROOM = 200;
const messagesByRoom = new Map<string, Message[]>();
const lastIdByRoom = new Map<string, number>();

export function addMessage(roomId: string, user: User, text: string): Message {
  const id = (lastIdByRoom.get(roomId) ?? 0) + 1;
  lastIdByRoom.set(roomId, id);

  const message: Message = {
    id,
    roomId,
    userId: user.id, // from the login, never from the client
    userName: user.name, // same
    text,
    sentAt: new Date().toISOString(), // server's clock, not the client's
  };

  const list = messagesByRoom.get(roomId) ?? [];
  list.push(message);
  if (list.length > MAX_KEPT_PER_ROOM) list.shift(); // keep memory bounded
  messagesByRoom.set(roomId, list);
  return message;
}

// First join: the last `recent` messages.
// Re-join after a disconnect: everything AFTER the bookmark, so nothing is missed.
export function messagesAfter(roomId: string, lastSeenId?: number, recent = 50): Message[] {
  const list = messagesByRoom.get(roomId) ?? [];
  if (lastSeenId === undefined) return list.slice(-recent);
  return list.filter((m) => m.id > lastSeenId);
}
