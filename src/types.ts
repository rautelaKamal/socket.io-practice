import type { Message, User } from "./store";

// The CONTRACT for this real-time API: every event, in both directions, with its data.
// Like a REST endpoint table, but for events. TypeScript checks both sides against it.

export type ChatErrorBody = { code: string; message: string };

// An ack is the server's reply to one event: the "double tick".
export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: ChatErrorBody };
export type Ack<T> = (res: AckResponse<T>) => void;

// Client -> server. Payloads are `unknown` on purpose: they come from strangers,
// so we validate them with Zod before trusting anything. The ack is optional,
// because a client might not send one (never assume, never crash).
export interface ClientToServerEvents {
  "room:join": (payload: unknown, ack?: Ack<{ messages: Message[] }>) => void;
  "message:send": (payload: unknown, ack?: Ack<{ message: Message }>) => void;
  typing: (payload: unknown) => void;
}

// Server -> client.
export interface ServerToClientEvents {
  "message:new": (message: Message) => void;
  typing: (info: { roomId: string; userName: string }) => void;
}

export interface InterServerEvents {}

// What the server remembers about each connection (this is the "state" in stateful).
export interface SocketData {
  user: User;
  recentSends: number[]; // timestamps, for rate limiting
}
