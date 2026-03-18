import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import {
  ROOM_CREATE,
  ROOM_JOIN,
  STATE_SYNC,
  ROOM_ERROR,
  type PlayerSummary,
  type RoomCreateReq,
  type RoomJoinReq,
  type RoomState,
  type StateSyncPayload,
  type RoomErrorPayload,
} from "@catan/shared";

type Room = {
  roomId: string;
  phase: "lobby";
  players: PlayerSummary[];
};

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5500", "http://localhost:5500"], }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "server" });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5500", "http://localhost:5500"],
    methods: ["GET", "POST"],
  },
});

const rooms = new Map<string, Room>();

function sanitizeName(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 20);
}

function toPublicRoomState(room: Room): RoomState {
  return {
    roomId: room.roomId,
    phase: room.phase,
    players: room.players.map((p) => ({ playerId: p.playerId, name: p.name })),
  };
}

function emitRoomState(room: Room, currentSocket: Socket) {
  const state = toPublicRoomState(room);

  // 发给房间里的其他人
  currentSocket.to(room.roomId).emit(STATE_SYNC, {
    roomId: room.roomId,
    you: { playerId: "" },
    state,
  } satisfies StateSyncPayload);

  // 单独发给当前请求者，确保 you.playerId 正确
  currentSocket.emit(STATE_SYNC, {
    roomId: room.roomId,
    you: { playerId: currentSocket.id },
    state,
  } satisfies StateSyncPayload);
}

function generateRoomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 100; i++) {
    let id = "";
    for (let j = 0; j < 6; j++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!rooms.has(id)) return id;
  }
  throw new Error("Failed to generate unique room id");
}

function emitError(socket: Socket, message: string) {
  socket.emit(ROOM_ERROR, { message } satisfies RoomErrorPayload);
}

io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  socket.on(ROOM_CREATE, (payload: RoomCreateReq) => {
    const name = sanitizeName(payload?.name);
    if (!name) {
      emitError(socket, "Name is required");
      return;
    }

    const roomId = generateRoomId();
    const room: Room = {
      roomId,
      phase: "lobby",
      players: [{ playerId: socket.id, name }],
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    console.log(`[create] room=${roomId} players=${room.players.length}`);
    emitRoomState(room, socket);
  });

  socket.on(ROOM_JOIN, (payload: RoomJoinReq) => {
    const roomId = (payload?.roomId ?? "").trim().toUpperCase();
    const name = sanitizeName(payload?.name);

    if (!name) {
      emitError(socket, "Name is required");
      return;
    }
    if (!roomId) {
      emitError(socket, "Room ID is required");
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      emitError(socket, "Room not found");
      return;
    }

    const exists = room.players.some((p) => p.playerId === socket.id);
    if (!exists) {
      room.players.push({ playerId: socket.id, name });
    }

    socket.join(roomId);

    console.log(`[join] room=${roomId} players=${room.players.length}`);
    emitRoomState(room, socket);
  });

  socket.on("disconnect", (reason) => {
    console.log("socket disconnected:", socket.id, reason);

    for (const [roomId, room] of rooms.entries()) {
      const before = room.players.length;
      room.players = room.players.filter((p) => p.playerId !== socket.id);

      if (room.players.length !== before) {
        if (room.players.length === 0) {
          rooms.delete(roomId);
          console.log(`[cleanup] remove empty room=${roomId}`);
        } else {
          console.log(`[leave] room=${roomId} players=${room.players.length}`);
          io.to(roomId).emit(STATE_SYNC, {
            roomId,
            you: { playerId: "" },
            state: toPublicRoomState(room),
          } satisfies StateSyncPayload);
        }
      }
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});
