import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server, Socket } from "socket.io";
import { type ServerOptions } from "socket.io";
import {
  ROOM_CREATE,
  ROOM_JOIN,
  STATE_SYNC,
  ROOM_ERROR,
  GAME_START,
  GAME_ERROR,
  ACTION_PLACE_SETTLEMENT,
  ACTION_PLACE_ROAD,
  type PlayerSummary,
  type RoomCreateReq,
  type RoomJoinReq,
  type GameState,
  type StateSyncPayload,
  type RoomErrorPayload,
  type GameErrorPayload,
  type SetupInfo,
  type Board,
  type PlaceSettlementReq,
  type PlaceRoadReq,
} from "@catan/shared";
import { generateBoard } from "./board";

// ============================================================
// Room 内部类型
// ============================================================
type Room = {
  roomId: string;
  phase: GameState["phase"];
  players: PlayerSummary[];
  board: Board | null;
  setupInfo: SetupInfo | null;
};

// ============================================================
// Express + Socket.IO 初始化
// ============================================================
const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://127.0.0.1:5500", "http://localhost:5500"] }));
app.use(express.json());

app.get("/health", (_req: import("express").Request, res: import("express").Response) => {
  res.json({ ok: true, service: "server" });
});

const httpServer = createServer(app);
const ioOptions: Partial<ServerOptions> = {
  cors: {
    origin: ["http://localhost:5173", "http://127.0.0.1:5500", "http://localhost:5500"],
    methods: ["GET", "POST"],
  } as any,
};

const io = new Server(httpServer, ioOptions);
const rooms = new Map<string, Room>();

// ============================================================
// 工具函数
// ============================================================
function sanitizeName(raw: string | undefined): string {
  return (raw ?? "").trim().slice(0, 20);
}

function generateRoomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < 100; i++) {
    let id = "";
    for (let j = 0; j < 6; j++) id += chars[Math.floor(Math.random() * chars.length)];
    if (!rooms.has(id)) return id;
  }
  throw new Error("Failed to generate unique room id");
}

function emitError(socket: Socket, message: string) {
  socket.emit(ROOM_ERROR, { message } satisfies RoomErrorPayload);
}

function emitGameError(socket: Socket, message: string, code?: string) {
  socket.emit(GAME_ERROR, { message, code } satisfies GameErrorPayload);
}

function toPublicRoomState(room: Room): GameState {
  return {
    roomId: room.roomId,
    phase: room.phase,
    hostPlayerId: room.players[0]?.playerId ?? "",
    currentPlayerId: getCurrentPlayerId(room),
    players: room.players.map((p) => ({ playerId: p.playerId, name: p.name, color: p.color })),
    board: room.board,
    setupInfo: room.setupInfo,
  };
}

/** 根据当前阶段和 setupInfo 计算当前应该行动的玩家 */
function getCurrentPlayerId(room: Room): string {
  if (room.phase === "lobby" || room.phase === "playing") {
    return room.players[0]?.playerId ?? "";
  }
  if (!room.setupInfo) return room.players[0]?.playerId ?? "";
  const { setupOrder, placedPlayers } = room.setupInfo;
  // placedPlayers 记录已完成「村庄+道路」的步骤数
  // 当前轮到的是 setupOrder[placedPlayers.length]
  return setupOrder[placedPlayers.length] ?? "";
}

function emitRoomState(room: Room, currentSocket: Socket) {
  const state = toPublicRoomState(room);
  currentSocket.to(room.roomId).emit(STATE_SYNC, {
    roomId: room.roomId,
    you: { playerId: "" },
    state,
  } satisfies StateSyncPayload);
  currentSocket.emit(STATE_SYNC, {
    roomId: room.roomId,
    you: { playerId: currentSocket.id },
    state,
  } satisfies StateSyncPayload);
}

function emitRoomStateToAll(room: Room) {
  const state = toPublicRoomState(room);
  io.to(room.roomId).emit(STATE_SYNC, {
    roomId: room.roomId,
    you: { playerId: "" },
    state,
  } satisfies StateSyncPayload);
}

/** 找到该 socket 所在的房间 */
function findRoomBySocket(socketId: string): Room | undefined {
  return [...rooms.values()].find((r) => r.players.some((p) => p.playerId === socketId));
}

// ============================================================
// Setup 阶段：生成蛇形顺序
// 例：玩家 [A,B,C] → setupOrder = [A,B,C,C,B,A]
// ============================================================
function buildSnakeOrder(players: PlayerSummary[]): string[] {
  const ids = players.map((p) => p.playerId);
  return [...ids, ...[...ids].reverse()];
}

// ============================================================
// 距离规则检查：目标顶点的所有相邻顶点不能有建筑
// ============================================================
function checkDistanceRule(board: Board, vertexId: string): boolean {
  const vertex = board.vertices.find((v) => v.id === vertexId);
  if (!vertex) return false;
  for (const adjId of vertex.adjacentVertexIds) {
    const adj = board.vertices.find((v) => v.id === adjId);
    if (adj?.building) return false; // 距离不足
  }
  return true;
}

const PLAYER_COLORS: PlayerSummary["color"][] = ["red", "blue", "orange", "white"];

// ============================================================
// Socket 事件
// ============================================================
io.on("connection", (socket) => {
  console.log("socket connected:", socket.id);

  // ---- ROOM_CREATE ----
  socket.on(ROOM_CREATE, (payload: RoomCreateReq) => {
    const name = sanitizeName(payload?.name);
    if (!name) { emitError(socket, "Name is required"); return; }

    const roomId = generateRoomId();
    const room: Room = {
      roomId,
      phase: "lobby",
      players: [{ playerId: socket.id, name, color: PLAYER_COLORS[0] }],
      board: null,
      setupInfo: null,
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    console.log(`[create] room=${roomId} players=${room.players.length}`);
    emitRoomState(room, socket);
  });

  // ---- ROOM_JOIN ----
  socket.on(ROOM_JOIN, (payload: RoomJoinReq) => {
    const roomId = (payload?.roomId ?? "").trim().toUpperCase();
    const name = sanitizeName(payload?.name);

    if (!name) { emitError(socket, "Name is required"); return; }
    if (!roomId) { emitError(socket, "Room ID is required"); return; }

    const room = rooms.get(roomId);
    if (!room) { emitError(socket, "Room not found"); return; }
    if (room.phase !== "lobby") { emitError(socket, "Game already started"); return; }
    if (room.players.length >= 4) { emitError(socket, "Room is full (max 4 players)"); return; }

    const exists = room.players.some((p) => p.playerId === socket.id);
    if (!exists) {
      const color = PLAYER_COLORS[room.players.length % PLAYER_COLORS.length];
      room.players.push({ playerId: socket.id, name, color });
    }

    socket.join(roomId);
    console.log(`[join] room=${roomId} players=${room.players.length}`);
    emitRoomState(room, socket);
  });

  // ---- GAME_START ----
  socket.on(GAME_START, () => {
    const room = findRoomBySocket(socket.id);
    if (!room) { emitGameError(socket, "Room not found", "ROOM_NOT_FOUND"); return; }
    if (room.players[0]?.playerId !== socket.id) { emitGameError(socket, "Only the host can start the game", "NOT_HOST"); return; }
    if (room.players.length < 2) { emitGameError(socket, "Need at least 2 players to start", "NOT_ENOUGH_PLAYERS"); return; }
    if (room.phase !== "lobby") { emitGameError(socket, "Game already started", "ALREADY_STARTED"); return; }

    room.board = generateBoard();
    const setupOrder = buildSnakeOrder(room.players);
    room.setupInfo = { setupOrder, placedPlayers: [], pendingSettlementVertexId: undefined };
    room.phase = "setup_settlement";

    console.log(`[game_start] room=${room.roomId} order=${setupOrder.join(",")}`);
    emitRoomStateToAll(room);
  });

  // ---- ACTION_PLACE_SETTLEMENT ----
  socket.on(ACTION_PLACE_SETTLEMENT, (payload: PlaceSettlementReq) => {
    const room = findRoomBySocket(socket.id);
    if (!room) { emitGameError(socket, "Room not found", "ROOM_NOT_FOUND"); return; }
    if (room.phase !== "setup_settlement") { emitGameError(socket, "Not in settlement placement phase", "WRONG_PHASE"); return; }

    const currentPlayerId = getCurrentPlayerId(room);
    if (socket.id !== currentPlayerId) { emitGameError(socket, "It's not your turn", "NOT_YOUR_TURN"); return; }

    const { vertexId } = payload ?? {};
    if (!vertexId) { emitGameError(socket, "vertexId is required", "INVALID_PAYLOAD"); return; }

    const board = room.board!;
    const vertex = board.vertices.find((v) => v.id === vertexId);
    if (!vertex) { emitGameError(socket, "Invalid vertexId", "INVALID_VERTEX"); return; }
    if (vertex.ownerPlayerId) { emitGameError(socket, "Vertex already occupied", "VERTEX_OCCUPIED"); return; }
    if (!checkDistanceRule(board, vertexId)) { emitGameError(socket, "Too close to another settlement (distance rule)", "DISTANCE_RULE"); return; }

    // 放置定居点
    vertex.ownerPlayerId = socket.id;
    vertex.building = "settlement";
    room.setupInfo!.pendingSettlementVertexId = vertexId;

    // 切换到放道路阶段
    room.phase = "setup_road";

    console.log(`[place_settlement] room=${room.roomId} player=${socket.id} vertex=${vertexId}`);
    emitRoomStateToAll(room);
  });

  // ---- ACTION_PLACE_ROAD ----
  socket.on(ACTION_PLACE_ROAD, (payload: PlaceRoadReq) => {
    const room = findRoomBySocket(socket.id);
    if (!room) { emitGameError(socket, "Room not found", "ROOM_NOT_FOUND"); return; }
    if (room.phase !== "setup_road") { emitGameError(socket, "Not in road placement phase", "WRONG_PHASE"); return; }

    const currentPlayerId = getCurrentPlayerId(room);
    if (socket.id !== currentPlayerId) { emitGameError(socket, "It's not your turn", "NOT_YOUR_TURN"); return; }

    const { edgeId } = payload ?? {};
    if (!edgeId) { emitGameError(socket, "edgeId is required", "INVALID_PAYLOAD"); return; }

    const board = room.board!;
    const setupInfo = room.setupInfo!;

    const edge = board.edges.find((e) => e.id === edgeId);
    if (!edge) { emitGameError(socket, "Invalid edgeId", "INVALID_EDGE"); return; }
    if (edge.ownerPlayerId) { emitGameError(socket, "Edge already occupied", "EDGE_OCCUPIED"); return; }

    // 道路必须连接到刚放的定居点
    const pendingVertexId = setupInfo.pendingSettlementVertexId;
    if (edge.fromVertexId !== pendingVertexId && edge.toVertexId !== pendingVertexId) {
      emitGameError(socket, "Road must connect to your new settlement", "ROAD_NOT_CONNECTED");
      return;
    }

    // 放置道路
    edge.ownerPlayerId = socket.id;

    // 记录该玩家已完成本轮 setup
    setupInfo.placedPlayers.push(socket.id);
    setupInfo.pendingSettlementVertexId = undefined;

    console.log(`[place_road] room=${room.roomId} player=${socket.id} edge=${edgeId}`);

    // 判断 setup 是否全部完成
    if (setupInfo.placedPlayers.length >= setupInfo.setupOrder.length) {
      // 所有人都放完了，进入正式游戏阶段
      room.phase = "playing";
      room.setupInfo = null;
      console.log(`[setup_complete] room=${room.roomId} → playing`);
    } else {
      // 还有下一个玩家，切回 setup_settlement
      room.phase = "setup_settlement";
      const nextPlayerId = getCurrentPlayerId(room);
      console.log(`[next_setup] room=${room.roomId} next=${nextPlayerId}`);
    }

    emitRoomStateToAll(room);
  });

  // ---- DISCONNECT ----
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
          emitRoomStateToAll(room);
        }
      }
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`server running at http://localhost:${PORT}`);
});