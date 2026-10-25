# Chat lab: real-time hostel chat with Socket.io

```
npm install
npm run dev      # http://localhost:3001  (open in two browser tabs, log in as different people)
npm test         # in a second terminal, while the server runs: 13 automated checks
```

## Event table (the contract, like an endpoint table)

| Direction | Event | Payload | Reply (ack) | Errors |
| --- | --- | --- | --- | --- |
| client -> server | `room:join` | `{roomId, lastSeenId?}` | `{messages}` | VALIDATION_ERROR, ROOM_NOT_FOUND |
| client -> server | `message:send` | `{roomId, text}` | `{message}` | VALIDATION_ERROR, NOT_IN_ROOM, RATE_LIMITED |
| client -> server | `typing` | `{roomId}` | none (volatile) | ignored |
| server -> client | `message:new` | message | | |
| server -> client | `typing` | `{roomId, userName}` | | |
| handshake | `auth: {token}` | | connect or `connect_error` | UNAUTHENTICATED |

## Files (read in this order)

store.ts -> types.ts -> auth.ts -> chat.ts -> server.ts -> public/index.html -> test/chat.test.ts
