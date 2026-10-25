// Automated check of every rule. Start the server first (npm run dev), then: npm test
import { io, type Socket } from "socket.io-client";

const URL = process.env.URL ?? "http://localhost:3001";
let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${name}${detail ? " | " + detail : ""}`);
  if (!condition) failures++;
}

function connect(token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(URL, {
      auth: token ? { token } : {},
      reconnection: false,
      transports: ["websocket"],
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });
}

type Reply = { ok: boolean; data?: any; error?: { code: string } };
const send = (s: Socket, event: string, payload: unknown): Promise<Reply> =>
  s.timeout(2000).emitWithAck(event, payload);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 1. No token -> rejected during the handshake
  try {
    await connect();
    check("no token is rejected", false);
  } catch (err) {
    check("no token is rejected", (err as Error).message === "UNAUTHENTICATED", (err as Error).message);
  }

  const kamal = await connect("token-kamal");
  const rohit = await connect("token-rohit");
  const kamalInbox: any[] = [];
  const rohitInbox: any[] = [];
  kamal.on("message:new", (m) => kamalInbox.push(m));
  rohit.on("message:new", (m) => rohitInbox.push(m));

  // 2. Sending before joining -> NOT_IN_ROOM
  let r = await send(rohit, "message:send", { roomId: "general", text: "hi" });
  check("send before join is refused", r.error?.code === "NOT_IN_ROOM", r.error?.code);

  // 3. Unknown room
  r = await send(kamal, "room:join", { roomId: "secret-room" });
  check("unknown room is refused", r.error?.code === "ROOM_NOT_FOUND", r.error?.code);

  // 4. Both join
  r = await send(kamal, "room:join", { roomId: "general" });
  check("kamal joins", r.ok);
  r = await send(rohit, "room:join", { roomId: "general" });
  check("rohit joins", r.ok);

  // 5. Empty text and spoofed fields are rejected
  r = await send(kamal, "message:send", { roomId: "general", text: "   " });
  check("empty message is refused", r.error?.code === "VALIDATION_ERROR", r.error?.code);
  r = await send(kamal, "message:send", { roomId: "general", text: "hi", userName: "Admin" });
  check("spoofed userName is refused", r.error?.code === "VALIDATION_ERROR", r.error?.code);

  // 6. Kamal sends; Rohit receives it; Kamal gets an ack, not an echo
  r = await send(kamal, "message:send", { roomId: "general", text: "hello" });
  check("kamal's send is acknowledged", r.ok && r.data.message.id === 1, JSON.stringify(r.data?.message));
  await wait(100);
  check("rohit receives it", rohitInbox.length === 1 && rohitInbox[0].userName === "Kamal");
  check("kamal gets no echo of his own message", kamalInbox.length === 0);

  // 7. Rohit drops off; Kamal sends 2 more; Rohit reconnects with his bookmark
  rohit.disconnect();
  await send(kamal, "message:send", { roomId: "general", text: "you there?" });
  await send(kamal, "message:send", { roomId: "general", text: "anyone?" });
  const rohitAgain = await connect("token-rohit");
  r = await send(rohitAgain, "room:join", { roomId: "general", lastSeenId: 1 });
  const ids = (r.data?.messages ?? []).map((m: any) => m.id);
  check("reconnect catches up exactly the missed messages", JSON.stringify(ids) === "[2,3]", JSON.stringify(ids));

  // 8. Rate limiting: the 6th message within 5 seconds is refused
  const meera = await connect("token-meera");
  await send(meera, "room:join", { roomId: "floor-2" });
  const codes: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const res = await send(meera, "message:send", { roomId: "floor-2", text: `msg ${i}` });
    codes.push(res.ok ? "ok" : (res.error?.code ?? "?"));
  }
  check("6th message in 5 s is rate limited", codes[5] === "RATE_LIMITED", codes.join(","));

  // 9. Messages don't leak between rooms
  check("general never saw floor-2 messages", rohitInbox.every((m) => m.roomId === "general"));

  kamal.disconnect();
  rohitAgain.disconnect();
  meera.disconnect();
  console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
