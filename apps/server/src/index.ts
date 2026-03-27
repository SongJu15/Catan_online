import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { generateBoard } from "./board";
import {
  ROOM_CREATE, ROOM_JOIN, ROOM_ERROR,
  PLAYER_READY, GAME_START, GAME_ERROR,
  STATE_SYNC,
  ACTION_PLACE_SETTLEMENT, ACTION_PLACE_ROAD,
  ACTION_ROLL_DICE, ACTION_END_TURN,
  ACTION_BUILD_SETTLEMENT, ACTION_BUILD_CITY, ACTION_BUILD_ROAD,
  ACTION_BUY_DEV_CARD, ACTION_PLAY_DEV_CARD,
  ACTION_BANK_TRADE,
  ACTION_MOVE_ROBBER, ACTION_DISCARD,
  emptyResources, totalResources, hasEnoughResources, deductResources, addResources,
  SETTLEMENT_COST, CITY_COST, ROAD_COST, DEV_CARD_COST, DEV_CARD_DECK,
} from "@catan/shared";
import type {
  GameState, PlayerSummary, PlayerPrivate, PlayerResources,
  Board, Vertex, Edge, Hex,
  SetupInfo, RobberInfo, RoadBuildingInfo,
  DevCard, DevCardType, ResourceType,
  StateSyncPayload,
  RoomCreateReq, RoomJoinReq,
  PlaceSettlementReq, PlaceRoadReq,
  BuildSettlementReq, BuildCityReq, BuildRoadReq,
  BuyDevCardReq, PlayDevCardReq,
  BankTradeReq, MoveRobberReq, DiscardReq,
} from "@catan/shared";
import {
  ACTION_TRADE_OFFER,
  ACTION_TRADE_ACCEPT,
  ACTION_TRADE_REJECT,
  ACTION_TRADE_CONFIRM,
  ACTION_TRADE_CANCEL,
  type TradeOfferReq,
  type TradeAcceptReq,
  type TradeRejectReq,
  type TradeConfirmReq,
  type TradeCancelReq,
} from "@catan/shared";

import {
  handleTradeOffer,
  handleTradeAccept,
  handleTradeReject,
  handleTradeConfirm,
  handleTradeCancel,
} from "./trade";

import type { ServerRoom, ServerPlayer } from "./types";


// ============================================================
// 全局房间 Map
// ============================================================
const rooms = new Map<string, ServerRoom>();

// ============================================================
// 工具：生成随机 ID
// ============================================================
function genId(len = 6): string {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase();
}

// ============================================================
// 工具：洗牌
// ============================================================
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// 玩家颜色池
// ============================================================
const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

// ============================================================
// 构建 PlayerSummary（公开信息）
// ============================================================
function buildSummary(p: ServerPlayer): PlayerSummary {
  // 胜利点 = 定居点 + 城市×2 + 称号 + 胜利点发展卡（已打出的）
  // 注意：胜利点卡在手牌中就生效，但对外不公开（只有自己知道）
  // 这里 victoryPoints 是公开分（不含手牌中的胜利点卡）
  const publicVP =
    p.settlements +
    p.cities * 2 +
    (p.hasLargestArmy ? 2 : 0) +
    (p.hasLongestRoad ? 2 : 0);
  return {
    playerId: p.playerId,
    name: p.name,
    color: p.color,
    isReady: p.isReady,
    victoryPoints: publicVP,
    totalCards: totalResources(p.resources),
    settlements: p.settlements,
    cities: p.cities,
    roads: p.roads,
    knightsPlayed: p.knightsPlayed,
    hasLargestArmy: p.hasLargestArmy,
    hasLongestRoad: p.hasLongestRoad,
    devCardCount: p.devCards.length,
    isOnline: p.isOnline,
  };
}

// ============================================================
// 构建 PlayerPrivate（私有信息）
// ============================================================
function buildPrivate(p: ServerPlayer): PlayerPrivate {
  return {
    playerId: p.playerId,
    resources: { ...p.resources },
    devCards: p.devCards.map(c => ({ ...c })),
  };
}

// ============================================================
// 构建 GameState（公开状态）
// ============================================================
function buildGameState(room: ServerRoom): GameState {
  return {
    roomId: room.roomId,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    currentPlayerId: room.players[room.currentPlayerIndex]?.playerId ?? "",
    players: room.players.map(buildSummary),
    board: room.board,
    setupInfo: room.setupInfo,
    diceResult: room.diceResult,
    hasRolled: room.hasRolled,
    winner: room.winner,
    robberInfo: room.robberInfo,
    robberHexId: room.robberHexId,
    roadBuildingInfo: room.roadBuildingInfo,
    yearOfPlentyPending: room.yearOfPlentyPending,
    monopolyPending: room.monopolyPending,
    turnNumber: room.turnNumber,
    tradeOffer: room.tradeOffer,
  };
}

// ============================================================
// 广播状态给房间所有人
// ============================================================
function broadcastState(io: Server, room: ServerRoom) {
  const state = buildGameState(room);
  for (const p of room.players) {
    const you = buildPrivate(p);
    const payload: StateSyncPayload = { roomId: room.roomId, you, state };
    io.to(p.socketId).emit(STATE_SYNC, payload);
  }
}

// ============================================================
// 计算某玩家对某资源的真实交易比率
// 优先级：2:1专属港 > 3:1通用港 > 4:1默认
// ============================================================
function calcTradeRate(
  playerId: string,
  resource: ResourceType,
  board: Board
): number {
  let best = 4;

  for (const port of board.ports) {
    // 检查该港口的两个顶点，玩家是否在其中任意一个上有建筑
    const hasBuilding = port.vertexIds.some(vId => {
      const vertex = board.vertices.find(v => v.id === vId);
      return vertex?.ownerPlayerId === playerId;
    });

    if (!hasBuilding) continue;

    if (port.type === "any") {
      // 3:1 通用港
      best = Math.min(best, 3);
    } else if (port.type === resource) {
      // 2:1 专属港，直接返回最优
      return 2;
    }
  }

  return best;
}



// ============================================================
// 发送错误给单个 socket
// ============================================================
function sendError(socket: Socket, message: string, code?: string) {
  socket.emit(GAME_ERROR, { message, code });
}

// ============================================================
// 计算某玩家的最长连续道路长度
// ============================================================
function calcLongestRoad(playerId: string, board: Board): number {
  const edges = board.edges.filter(e => e.ownerPlayerId === playerId);
  if (edges.length === 0) return 0;

  // 构建邻接表：顶点 -> 该玩家拥有的相邻顶点
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    // 检查两端顶点是否被其他玩家的建筑阻断
    const vFrom = board.vertices.find(v => v.id === e.fromVertexId)!;
    const vTo = board.vertices.find(v => v.id === e.toVertexId)!;
    // 如果顶点有建筑且不是自己的，则该顶点阻断道路
    const fromBlocked = !!vFrom.ownerPlayerId && vFrom.ownerPlayerId !== playerId;
    const toBlocked = !!vTo.ownerPlayerId && vTo.ownerPlayerId !== playerId;

    if (!adj.has(e.fromVertexId)) adj.set(e.fromVertexId, new Set());
    if (!adj.has(e.toVertexId)) adj.set(e.toVertexId, new Set());
    if (!fromBlocked) adj.get(e.fromVertexId)!.add(e.toVertexId);
    if (!toBlocked) adj.get(e.toVertexId)!.add(e.fromVertexId);
  }

  // DFS 求最长路径（允许重复顶点但不允许重复边）
  let maxLen = 0;
  const edgeSet = new Set(edges.map(e => [e.fromVertexId, e.toVertexId].sort().join("_")));

  function dfs(cur: string, visited: Set<string>): number {
    let best = 0;
    const neighbors = adj.get(cur) ?? new Set();
    for (const nb of neighbors) {
      const eKey = [cur, nb].sort().join("_");
      if (!visited.has(eKey)) {
        visited.add(eKey);
        const len = 1 + dfs(nb, visited);
        if (len > best) best = len;
        visited.delete(eKey);
      }
    }
    return best;
  }

  for (const startV of adj.keys()) {
    const len = dfs(startV, new Set());
    if (len > maxLen) maxLen = len;
  }
  return maxLen;
}

// ============================================================
// 更新最长道路称号
// ============================================================
function updateLongestRoad(room: ServerRoom) {
  if (!room.board) return;
  const lengths = room.players.map(p => ({
    playerId: p.playerId,
    len: calcLongestRoad(p.playerId, room.board!),
  }));

  // 找当前持有者
  const holder = room.players.find(p => p.hasLongestRoad);
  const holderLen = holder ? lengths.find(l => l.playerId === holder.playerId)!.len : 0;

  // 找最长的
  const maxLen = Math.max(...lengths.map(l => l.len));
  if (maxLen < 5) return; // 至少5条才能获得

  // 如果有人超过当前持有者，转移称号
  const candidates = lengths.filter(l => l.len === maxLen);
  if (candidates.length === 1 && candidates[0].len > holderLen) {
    // 转移称号
    room.players.forEach(p => { p.hasLongestRoad = false; });
    const winner = room.players.find(p => p.playerId === candidates[0].playerId)!;
    winner.hasLongestRoad = true;
  } else if (!holder && candidates.length >= 1) {
    // 首次授予（平局不授予）
    if (candidates.length === 1) {
      const winner = room.players.find(p => p.playerId === candidates[0].playerId)!;
      winner.hasLongestRoad = true;
    }
  }
}

// ============================================================
// 更新最大军队称号
// ============================================================
function updateLargestArmy(room: ServerRoom) {
  const holder = room.players.find(p => p.hasLargestArmy);
  const holderKnights = holder?.knightsPlayed ?? 0;

  for (const p of room.players) {
    if (p.playerId === holder?.playerId) continue;
    if (p.knightsPlayed >= 3 && p.knightsPlayed > holderKnights) {
      room.players.forEach(pp => { pp.hasLargestArmy = false; });
      p.hasLargestArmy = true;
      break;
    }
  }
}

// ============================================================
// 计算真实胜利点（含手牌中的胜利点卡）
// ============================================================
function calcRealVP(p: ServerPlayer): number {
  const vpCards = p.devCards.filter(c => c.type === "victory_point").length;
  return (
    p.settlements +
    p.cities * 2 +
    (p.hasLargestArmy ? 2 : 0) +
    (p.hasLongestRoad ? 2 : 0) +
    vpCards
  );
}

// ============================================================
// 检查胜利条件
// ============================================================
function checkWin(room: ServerRoom): boolean {
  for (const p of room.players) {
    if (calcRealVP(p) >= 10) {
      room.winner = p.playerId;
      room.phase = "ended";
      return true;
    }
  }
  return false;
}

// ============================================================
// 分发资源（掷骰后）
// ============================================================
function distributeResources(room: ServerRoom, total: number) {
  if (!room.board) return;
  const hexes = room.board.hexes.filter(
    h => h.diceNumber === total && !h.hasRobber
  );
  for (const hex of hexes) {
    for (const vId of hex.vertexIds) {
      const vertex = room.board.vertices.find(v => v.id === vId);
      if (!vertex?.ownerPlayerId) continue;
      const player = room.players.find(p => p.playerId === vertex.ownerPlayerId);
      if (!player) continue;
      const amount = vertex.building === "city" ? 2 : 1;
      const res = hex.terrain as ResourceType;
      player.resources[res] += amount;
    }
  }
}

// ============================================================
// 初始化强盗（骰到7点）
// ============================================================
function initRobber(room: ServerRoom) {
  const mustDiscard = room.players
    .filter(p => totalResources(p.resources) > 7)
    .map(p => p.playerId);
  room.robberInfo = {
    mustDiscard,
    discarded: [],
    waitingForMove: mustDiscard.length === 0,
  };
}

// ============================================================
// 移动强盗到初始位置（沙漠）
// ============================================================
function placeInitialRobber(room: ServerRoom) {
  if (!room.board) return;
  const desert = room.board.hexes.find(h => h.terrain === "desert");
  if (desert) {
    desert.hasRobber = true;
    room.robberHexId = desert.id;
  }
}

// ============================================================
// 验证定居点放置合法性（距离规则）
// ============================================================
function isValidSettlementPlacement(
  vertexId: string,
  board: Board,
  checkDistance = true
): boolean {
  const vertex = board.vertices.find(v => v.id === vertexId);
  if (!vertex) return false;
  if (vertex.ownerPlayerId) return false;
  if (!checkDistance) return true;
  // 距离规则：相邻顶点不能有建筑
  for (const adjId of vertex.adjacentVertexIds) {
    const adj = board.vertices.find(v => v.id === adjId);
    if (adj?.ownerPlayerId) return false;
  }
  return true;
}

// ============================================================
// 验证道路放置合法性
// ============================================================
function isValidRoadPlacement(
  edgeId: string,
  playerId: string,
  board: Board,
  isFreeSetup = false
): boolean {
  const edge = board.edges.find(e => e.id === edgeId);
  if (!edge) return false;
  if (edge.ownerPlayerId) return false;

  if (isFreeSetup) {
    // setup 阶段：必须连接到刚放的定居点
    return true; // 调用方已经限制了 edgeId 范围
  }

  // playing 阶段：必须连接到自己的建筑或道路
  const vFrom = board.vertices.find(v => v.id === edge.fromVertexId)!;
  const vTo = board.vertices.find(v => v.id === edge.toVertexId)!;

  const connectedToBuilding =
    (vFrom.ownerPlayerId === playerId) ||
    (vTo.ownerPlayerId === playerId);

  const connectedToRoad = board.edges.some(e => {
    if (e.id === edgeId || e.ownerPlayerId !== playerId) return false;
    return (
      e.fromVertexId === edge.fromVertexId ||
      e.fromVertexId === edge.toVertexId ||
      e.toVertexId === edge.fromVertexId ||
      e.toVertexId === edge.toVertexId
    );
  });

  return connectedToBuilding || connectedToRoad;
}

// ============================================================
// 获取 setup 阶段当前应该行动的玩家
// ============================================================
function getSetupCurrentPlayer(room: ServerRoom): string {
  const info = room.setupInfo!;
  const total = room.players.length;
  const placed = info.placedPlayers.length;
  // 蛇形顺序
  if (placed < total) {
    return info.setupOrder[placed];
  } else {
    return info.setupOrder[2 * total - 1 - placed];
  }
}

// ============================================================
// 推进 setup 阶段
// ============================================================
function advanceSetup(room: ServerRoom) {
  const info = room.setupInfo!;
  const total = room.players.length;
  const placed = info.placedPlayers.length;

  if (placed >= total * 2) {
    // setup 完成，进入 playing
    room.phase = "playing";
    room.setupInfo = null;
    room.currentPlayerIndex = 0;
    room.turnNumber = 1;
    return;
  }

  const nextPlayerId = placed < total
    ? info.setupOrder[placed]
    : info.setupOrder[2 * total - 1 - placed];

  room.currentPlayerIndex = room.players.findIndex(p => p.playerId === nextPlayerId);
  room.phase = "setup_settlement";
}

// ============================================================
// 第二轮 setup 时给资源
// ============================================================
function giveSetupResources(room: ServerRoom, vertexId: string, playerId: string) {
  if (!room.board) return;
  const info = room.setupInfo!;
  const total = room.players.length;
  const placed = info.placedPlayers.length;
  // 第二轮（placed >= total）才给资源
  if (placed < total) return;

  const vertex = room.board.vertices.find(v => v.id === vertexId);
  if (!vertex) return;
  const player = room.players.find(p => p.playerId === playerId);
  if (!player) return;

  for (const hexId of vertex.adjacentHexIds) {
    const hex = room.board.hexes.find(h => h.id === hexId);
    if (!hex || hex.terrain === "desert") continue;
    player.resources[hex.terrain as ResourceType] += 1;
  }
}

// ============================================================
// HTTP + Socket.IO 服务器
// ============================================================
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket: Socket) => {
  console.log("🔌 连接:", socket.id);

  // ----------------------------------------------------------
  // 创建房间
  // ----------------------------------------------------------
  socket.on(ROOM_CREATE, (payload: RoomCreateReq, callback) => {
    const roomId = genId();
    const playerId = genId(8);
    const player: ServerPlayer = {
      playerId,
      socketId: socket.id,
      name: payload.name,
      color: COLORS[0],
      isReady: false,
      resources: emptyResources(),
      devCards: [],
      knightsPlayed: 0,
      hasLargestArmy: false,
      hasLongestRoad: false,
      settlements: 0,
      cities: 0,
      roads: 0,
      isOnline: true,
    };
    const room: ServerRoom = {
      roomId,
      hostPlayerId: playerId,
      phase: "lobby",
      players: [player],
      board: null,
      setupInfo: null,
      diceResult: null,
      hasRolled: false,
      winner: null,
      robberInfo: null,
      robberHexId: null,
      devCardDeck: shuffle([...DEV_CARD_DECK]),
      roadBuildingInfo: null,
      yearOfPlentyPending: false,
      monopolyPending: false,
      turnNumber: 0,
      currentPlayerIndex: 0,
      tradeOffer: null,
    };
    rooms.set(roomId, room);
    socket.join(roomId);

    const state = buildGameState(room);
    const you = buildPrivate(player);
    const resp: StateSyncPayload = { roomId, you, state };
    callback(resp);
  });

  // ----------------------------------------------------------
  // 加入房间
  // ----------------------------------------------------------
  socket.on(ROOM_JOIN, (payload: RoomJoinReq, callback) => {
    const room = rooms.get(payload.roomId);
    if (!room) { callback({ error: "房间不存在" }); return; }
    // ✅ 修复：游戏已开始时，检查是否是老玩家重连
    if (room.phase !== "lobby") { callback({ error: "游戏已开始" }); return; }
    if (room.phase !== "lobby") { callback({ error: "游戏已开始" }); return; }
    if (room.players.length >= 6) { callback({ error: "房间已满" }); return; }

    const playerId = genId(8);
    const player: ServerPlayer = {
      playerId,
      socketId: socket.id,
      name: payload.name,
      color: COLORS[room.players.length % COLORS.length],
      isReady: false,
      resources: emptyResources(),
      devCards: [],
      knightsPlayed: 0,
      hasLargestArmy: false,
      hasLongestRoad: false,
      settlements: 0,
      cities: 0,
      roads: 0,
      isOnline: true,
    };
    room.players.push(player);
    socket.join(payload.roomId);

    broadcastState(io, room);

    const state = buildGameState(room);
    const you = buildPrivate(player);
    callback({ roomId: payload.roomId, you, state });
  });

  // ----------------------------------------------------------
  // 玩家准备
  // ----------------------------------------------------------
  socket.on(PLAYER_READY, (payload: { roomId: string; ready: boolean }) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    player.isReady = payload.ready;
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // 开始游戏
  // ----------------------------------------------------------
  socket.on(GAME_START, (payload: { roomId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.playerId !== room.hostPlayerId) {
      sendError(socket, "只有房主可以开始游戏"); return;
    }
    if (room.players.length < 2) {
      sendError(socket, "至少需要2名玩家"); return;
    }
    const nonHost = room.players.filter(p => p.playerId !== room.hostPlayerId);
    if (!nonHost.every(p => p.isReady)) {
      sendError(socket, "还有玩家未准备"); return;
    }

    // 生成棋盘
    room.board = generateBoard();
    placeInitialRobber(room);

    // setup 蛇形顺序
    const order = shuffle(room.players.map(p => p.playerId));
    room.setupInfo = { setupOrder: order, placedPlayers: [] };
    room.phase = "setup_settlement";
    room.currentPlayerIndex = room.players.findIndex(p => p.playerId === order[0]);

    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // setup：放置定居点
  // ----------------------------------------------------------
  socket.on(ACTION_PLACE_SETTLEMENT, (payload: PlaceSettlementReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.board || !room.setupInfo) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "setup_settlement") {
      sendError(socket, "当前不是放置定居点阶段"); return;
    }
    if (!isValidSettlementPlacement(payload.vertexId, room.board)) {
      sendError(socket, "该位置不能放置定居点"); return;
    }

    const vertex = room.board.vertices.find(v => v.id === payload.vertexId)!;
    vertex.ownerPlayerId = player.playerId;
    vertex.building = "settlement";
    player.settlements += 1;

    // 第二轮给资源
    giveSetupResources(room, payload.vertexId, player.playerId);

    room.setupInfo.pendingSettlementVertexId = payload.vertexId;
    room.phase = "setup_road";

    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // setup：放置道路
  // ----------------------------------------------------------
  socket.on(ACTION_PLACE_ROAD, (payload: PlaceRoadReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.board || !room.setupInfo) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "setup_road") {
      sendError(socket, "当前不是放置道路阶段"); return;
    }

    const pendingVId = room.setupInfo.pendingSettlementVertexId;
    if (!pendingVId) { sendError(socket, "内部错误"); return; }

    // 道路必须连接到刚放的定居点
    const edge = room.board.edges.find(e => e.id === payload.edgeId);
    if (!edge) { sendError(socket, "边不存在"); return; }
    if (edge.ownerPlayerId) { sendError(socket, "该道路已被占用"); return; }
    if (edge.fromVertexId !== pendingVId && edge.toVertexId !== pendingVId) {
      sendError(socket, "道路必须连接到刚放的定居点"); return;
    }

    edge.ownerPlayerId = player.playerId;
    player.roads += 1;

    room.setupInfo.placedPlayers.push(player.playerId);
    room.setupInfo.pendingSettlementVertexId = undefined;

    updateLongestRoad(room);
    advanceSetup(room);
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：掷骰子
  // ----------------------------------------------------------
  socket.on(ACTION_ROLL_DICE, (payload: { roomId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (room.hasRolled) { sendError(socket, "本回合已经掷过骰子"); return; }

    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    const total = d1 + d2;
    room.diceResult = [d1, d2];
    room.hasRolled = true;

    if (total === 7) {
      initRobber(room);
    } else {
      distributeResources(room, total);
      room.robberInfo = null;
    }

    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：丢弃资源（骰到7点）
  // ----------------------------------------------------------
  socket.on(ACTION_DISCARD, (payload: DiscardReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.robberInfo) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const info = room.robberInfo;
    if (!info.mustDiscard.includes(player.playerId)) {
      sendError(socket, "你不需要丢牌"); return;
    }
    if (info.discarded.includes(player.playerId)) {
      sendError(socket, "你已经丢过牌了"); return;
    }

    const total = totalResources(player.resources);
    const discardTotal = totalResources(payload.resources);
    const required = Math.floor(total / 2);
    if (discardTotal !== required) {
      sendError(socket, `必须丢弃 ${required} 张资源`); return;
    }
    if (!hasEnoughResources(player.resources, payload.resources)) {
      sendError(socket, "资源不足"); return;
    }

    player.resources = deductResources(player.resources, payload.resources);
    info.discarded.push(player.playerId);

    // 检查是否所有人都丢完了
    if (info.mustDiscard.every(id => info.discarded.includes(id))) {
      info.waitingForMove = true;
    }

    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：移动强盗
  // ----------------------------------------------------------
  socket.on(ACTION_MOVE_ROBBER, (payload: MoveRobberReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.board) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }

    // 检查是否处于需要移动强盗的状态
    const needMove =
      (room.robberInfo?.waitingForMove) ||
      false; // 骑士牌也会触发，由 ACTION_PLAY_DEV_CARD 设置

    if (!needMove) {
      sendError(socket, "当前不需要移动强盗"); return;
    }
    if (payload.hexId === room.robberHexId) {
      sendError(socket, "强盗必须移动到不同的地块"); return;
    }

    // 移动强盗
    room.board.hexes.forEach(h => { h.hasRobber = false; });
    const targetHex = room.board.hexes.find(h => h.id === payload.hexId);
    if (!targetHex) { sendError(socket, "地块不存在"); return; }
    targetHex.hasRobber = true;
    room.robberHexId = payload.hexId;

    // 抢劫
    if (payload.robPlayerId) {
      const victim = room.players.find(p => p.playerId === payload.robPlayerId);
      if (victim && victim.playerId !== player.playerId) {
        const victimTotal = totalResources(victim.resources);
        if (victimTotal > 0) {
          // 随机取一张
          const allCards: ResourceType[] = [];
          (Object.keys(victim.resources) as ResourceType[]).forEach(k => {
            for (let i = 0; i < victim.resources[k]; i++) allCards.push(k);
          });
          const stolen = allCards[Math.floor(Math.random() * allCards.length)];
          victim.resources[stolen] -= 1;
          player.resources[stolen] += 1;
        }
      }
    }

    room.robberInfo = null;

    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：建造定居点
  // ----------------------------------------------------------
  socket.on(ACTION_BUILD_SETTLEMENT, (payload: BuildSettlementReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.board) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (!room.hasRolled) { sendError(socket, "请先掷骰子"); return; }
    if (room.robberInfo) { sendError(socket, "请先处理强盗"); return; }

    if (!hasEnoughResources(player.resources, SETTLEMENT_COST)) {
      sendError(socket, "资源不足"); return;
    }
    if (!isValidSettlementPlacement(payload.vertexId, room.board)) {
      sendError(socket, "该位置不能放置定居点"); return;
    }
    // 必须连接到自己的道路
    const vertex = room.board.vertices.find(v => v.id === payload.vertexId)!;
    const connectedRoad = room.board.edges.some(e =>
      e.ownerPlayerId === player.playerId &&
      (e.fromVertexId === payload.vertexId || e.toVertexId === payload.vertexId)
    );
    if (!connectedRoad) { sendError(socket, "定居点必须连接到自己的道路"); return; }

    vertex.ownerPlayerId = player.playerId;
    vertex.building = "settlement";
    player.settlements += 1;
    player.resources = deductResources(player.resources, SETTLEMENT_COST);

    updateLongestRoad(room);
    if (checkWin(room)) { broadcastState(io, room); return; }
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：升级城市
  // ----------------------------------------------------------
  socket.on(ACTION_BUILD_CITY, (payload: BuildCityReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.board) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (!room.hasRolled) { sendError(socket, "请先掷骰子"); return; }
    if (room.robberInfo) { sendError(socket, "请先处理强盗"); return; }

    if (!hasEnoughResources(player.resources, CITY_COST)) {
      sendError(socket, "资源不足"); return;
    }
    const vertex = room.board.vertices.find(v => v.id === payload.vertexId);
    if (!vertex || vertex.ownerPlayerId !== player.playerId || vertex.building !== "settlement") {
      sendError(socket, "只能升级自己的定居点"); return;
    }

    vertex.building = "city";
    player.settlements -= 1;
    player.cities += 1;
    player.resources = deductResources(player.resources, CITY_COST);

    if (checkWin(room)) { broadcastState(io, room); return; }
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：建造道路
  // ----------------------------------------------------------
  socket.on(ACTION_BUILD_ROAD, (payload: BuildRoadReq) => {
    const room = rooms.get(payload.roomId);
    if (!room || !room.board) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (room.robberInfo) { sendError(socket, "请先处理强盗"); return; }

    // 道路建设卡模式（免费建路）
    const isFreeRoad = !!room.roadBuildingInfo && room.roadBuildingInfo.roadsLeft > 0;

    if (!isFreeRoad) {
      if (!room.hasRolled) { sendError(socket, "请先掷骰子"); return; }
      if (!hasEnoughResources(player.resources, ROAD_COST)) {
        sendError(socket, "资源不足"); return;
      }
    }

    if (!isValidRoadPlacement(payload.edgeId, player.playerId, room.board)) {
      sendError(socket, "该位置不能放置道路"); return;
    }

    const edge = room.board.edges.find(e => e.id === payload.edgeId)!;
    edge.ownerPlayerId = player.playerId;
    player.roads += 1;

    if (isFreeRoad) {
      room.roadBuildingInfo!.roadsLeft -= 1;
      if (room.roadBuildingInfo!.roadsLeft <= 0) {
        room.roadBuildingInfo = null;
      }
    } else {
      player.resources = deductResources(player.resources, ROAD_COST);
    }

    updateLongestRoad(room);
    if (checkWin(room)) { broadcastState(io, room); return; }
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：购买发展卡
  // ----------------------------------------------------------
  socket.on(ACTION_BUY_DEV_CARD, (payload: BuyDevCardReq) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (!room.hasRolled) { sendError(socket, "请先掷骰子"); return; }
    if (room.robberInfo) { sendError(socket, "请先处理强盗"); return; }

    if (room.devCardDeck.length === 0) {
      sendError(socket, "发展卡已经用完了"); return;
    }
    if (!hasEnoughResources(player.resources, DEV_CARD_COST)) {
      sendError(socket, "资源不足（需要羊×1 麦×1 矿×1）"); return;
    }

    const cardType = room.devCardDeck.pop()!;
    const card: DevCard = { type: cardType, turnBought: room.turnNumber };
    player.devCards.push(card);
    player.resources = deductResources(player.resources, DEV_CARD_COST);

    // 胜利点卡立即计入（但不公开）
    if (checkWin(room)) { broadcastState(io, room); return; }
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：使用发展卡
  // ----------------------------------------------------------
  socket.on(ACTION_PLAY_DEV_CARD, (payload: PlayDevCardReq) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (room.robberInfo) { sendError(socket, "请先处理强盗"); return; }

    // 胜利点卡不能主动打出
    if (payload.cardType === "victory_point") {
      sendError(socket, "胜利点卡不能主动使用"); return;
    }

    // 找到手牌中对应的卡（下回合才能用）
    const cardIndex = player.devCards.findIndex(
      c => c.type === payload.cardType && c.turnBought < room.turnNumber
    );
    if (cardIndex === -1) {
      sendError(socket, "没有可用的该类发展卡（本回合购买的卡下回合才能使用）"); return;
    }

    // 移除手牌
    player.devCards.splice(cardIndex, 1);

    switch (payload.cardType) {
      // ---- 骑士 ----
      case "knight": {
        player.knightsPlayed += 1;
        updateLargestArmy(room);
        // 触发移动强盗
        room.robberInfo = { mustDiscard: [], discarded: [], waitingForMove: true };
        break;
      }

      // ---- 道路建设 ----
      case "road_building": {
        room.roadBuildingInfo = { roadsLeft: 2 };
        break;
      }

      // ---- 丰收年 ----
      case "year_of_plenty": {
        if (!payload.yearOfPlentyResources || payload.yearOfPlentyResources.length !== 2) {
          // 退回卡牌，等待前端再次发送带参数的请求
          player.devCards.push({ type: "year_of_plenty", turnBought: room.turnNumber - 1 });
          sendError(socket, "请选择2种资源"); return;
        }
        const [r1, r2] = payload.yearOfPlentyResources;
        player.resources[r1] += 1;
        player.resources[r2] += 1;
        break;
      }

      // ---- 垄断 ----
      case "monopoly": {
        if (!payload.monopolyResource) {
          player.devCards.push({ type: "monopoly", turnBought: room.turnNumber - 1 });
          sendError(socket, "请选择一种资源"); return;
        }
        const res = payload.monopolyResource;
        for (const p of room.players) {
          if (p.playerId === player.playerId) continue;
          const amount = p.resources[res];
          p.resources[res] = 0;
          player.resources[res] += amount;
        }
        break;
      }
    }

    if (checkWin(room)) { broadcastState(io, room); return; }
    broadcastState(io, room);
  });

  // ----------------------------------------------------------
  // playing：银行交易（4:1）
  // ----------------------------------------------------------
  socket.on(ACTION_BANK_TRADE, (payload: BankTradeReq) => {
  const room = rooms.get(payload.roomId);
  if (!room || !room.board) return;
  const player = room.players.find(p => p.socketId === socket.id);
  if (!player) return;
  if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
    sendError(socket, "还没到你的回合"); return;
  }
  if (room.phase !== "playing")  { sendError(socket, "当前不是游戏阶段"); return; }
  if (!room.hasRolled)           { sendError(socket, "请先掷骰子"); return; }
  if (room.robberInfo)           { sendError(socket, "请先处理强盗"); return; }
  if (payload.give === payload.receive) {
    sendError(socket, "给出和换取的资源不能相同"); return;
  }

  // ── 服务端自己计算真实 rate，不信任前端 ──────────────────
  const serverRate = calcTradeRate(player.playerId, payload.give, room.board);

  const cost = emptyResources();
  cost[payload.give] = serverRate;
  if (!hasEnoughResources(player.resources, cost)) {
    sendError(socket, `需要 ${serverRate} 张 ${payload.give} 才能进行交易`); return;
  }

  player.resources[payload.give] -= serverRate;
  player.resources[payload.receive] += 1;

  broadcastState(io, room);
});


  // ----------------------------------------------------------
  // playing：结束回合
  // ----------------------------------------------------------
  socket.on(ACTION_END_TURN, (payload: { roomId: string }) => {
    const room = rooms.get(payload.roomId);
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    if (player.playerId !== room.players[room.currentPlayerIndex].playerId) {
      sendError(socket, "还没到你的回合"); return;
    }
    if (room.phase !== "playing") { sendError(socket, "当前不是游戏阶段"); return; }
    if (!room.hasRolled) { sendError(socket, "请先掷骰子"); return; }
    if (room.robberInfo) { sendError(socket, "请先处理强盗"); return; }
    if (room.roadBuildingInfo) { sendError(socket, "请先完成道路建设"); return; }

    // 推进到下一个玩家
    room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.players.length;
    room.hasRolled = false;
    room.diceResult = null;
    room.turnNumber += 1;
    room.tradeOffer = null;   // ← 加这一行，清空未完成的交易

    broadcastState(io, room);
  });

  // ================================================================
  // 玩家交易事件
  // 流程：发起方 offer → 其他玩家 accept/reject → 发起方 confirm/cancel
  // ================================================================

  // 工具：把 ServerPlayer[] 转成 privates Map（供 trade.ts 使用）
  function buildPrivatesMap(players: ServerPlayer[]): Map<string, PlayerPrivate> {
    const map = new Map<string, PlayerPrivate>();
    for (const p of players) {
      map.set(p.playerId, {
        playerId: p.playerId,
        resources: { ...p.resources },
        devCards: p.devCards.map(c => ({ ...c })),
      });
    }
    return map;
  }

  // 工具：把 privates Map 的资源写回 ServerPlayer[]（trade 执行后同步）
  function syncPrivatesBack(
    players: ServerPlayer[],
    privates: Map<string, PlayerPrivate>
  ) {
    for (const p of players) {
      const priv = privates.get(p.playerId);
      if (priv) p.resources = priv.resources;
    }
  }

  // ----------------------------------------------------------------
  // 发起交易
  // ----------------------------------------------------------------
  socket.on(ACTION_TRADE_OFFER, (req: TradeOfferReq) => {
    const room = rooms.get(req.roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const privates = buildPrivatesMap(room.players);
    const result = handleTradeOffer(room, privates, player.playerId, req);
    if (!result.ok) return socket.emit(GAME_ERROR, { message: result.error });

    // tradeOffer 已写入 room，直接广播（其他玩家会看到交易面板）
    broadcastState(io, room);
  });

  // ----------------------------------------------------------------
  // 接受交易（表示愿意，但还未成交，需等发起方 confirm）
  // ----------------------------------------------------------------
  socket.on(ACTION_TRADE_ACCEPT, (req: TradeAcceptReq) => {
    const room = rooms.get(req.roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const privates = buildPrivatesMap(room.players);
    const result = handleTradeAccept(room, privates, player.playerId, req);
    if (!result.ok) return socket.emit(GAME_ERROR, { message: result.error });

    // 广播后，发起方能看到谁接受了
    broadcastState(io, room);
  });

  // ----------------------------------------------------------------
  // 拒绝交易
  // ----------------------------------------------------------------
  socket.on(ACTION_TRADE_REJECT, (req: TradeRejectReq) => {
    const room = rooms.get(req.roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const result = handleTradeReject(room, player.playerId, req);
    if (!result.ok) return socket.emit(GAME_ERROR, { message: result.error });

    broadcastState(io, room);
  });

  // ----------------------------------------------------------------
  // 确认成交（发起方选择与某个已接受的玩家正式交换资源）
  // ----------------------------------------------------------------
  socket.on(ACTION_TRADE_CONFIRM, (req: TradeConfirmReq) => {
    const room = rooms.get(req.roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    // 用可写的 privates Map 执行资源交换
    const privates = buildPrivatesMap(room.players);
    const result = handleTradeConfirm(room, privates, player.playerId, req);
    if (!result.ok) return socket.emit(GAME_ERROR, { message: result.error });

    // 把 privates 里修改后的资源写回 room.players
    syncPrivatesBack(room.players, privates);

    // 成交后 tradeOffer 已清空，资源已更新，广播新状态
    broadcastState(io, room);
  });

  // ----------------------------------------------------------------
  // 取消交易（发起方取消，tradeOffer 清空）
  // ----------------------------------------------------------------
  socket.on(ACTION_TRADE_CANCEL, (req: TradeCancelReq) => {
    const room = rooms.get(req.roomId);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const result = handleTradeCancel(room, player.playerId, req);
    if (!result.ok) return socket.emit(GAME_ERROR, { message: result.error });

    broadcastState(io, room);
  });


  // ----------------------------------------------------------
  // 断线处理
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // 断线处理（延迟删除 + 支持重连）
  // ----------------------------------------------------------
  socket.on("disconnect", () => {
    console.log("🔌 断开:", socket.id);

    for (const [roomId, room] of rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) continue;

      // ✅ 标记离线，不立即删除
      player.isOnline = false;
      broadcastState(io, room);  // 通知其他人该玩家离线了

      // ✅ 30秒后若未重连，真正删除
      player.disconnectTimer = setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;

        const idx = currentRoom.players.findIndex(p => p.playerId === player.playerId);
        if (idx === -1) return;  // 已经重连了，不删

        currentRoom.players.splice(idx, 1);
        console.log(`🗑️ 玩家 ${player.name} 超时未重连，已移除`);

        if (currentRoom.players.length === 0) {
          rooms.delete(roomId);
          console.log(`🗑️ 房间 ${roomId} 已清空删除`);
        } else {
          // ✅ 修复原来的 Bug：先删除再转移房主
          if (currentRoom.hostPlayerId === player.playerId) {
            const newHost =
              currentRoom.players.find(p => p.isOnline) ?? currentRoom.players[0];
            currentRoom.hostPlayerId = newHost.playerId;
            console.log(`👑 房主转移给: ${newHost.name}`);
          }
          if (currentRoom.currentPlayerIndex >= currentRoom.players.length) {
            currentRoom.currentPlayerIndex = 0;
            currentRoom.hasRolled = false;
          }
          broadcastState(io, currentRoom);
        }
      }, 30_000);  // 30秒超时

      break;
    }
  });

  // ----------------------------------------------------------
  // 重连处理
  // ----------------------------------------------------------
  socket.on("reconnect_player", (
    payload: { roomId: string; playerId: string },
    callback: (resp: StateSyncPayload | { error: string }) => void
  ) => {
    const room = rooms.get(payload.roomId);
    if (!room) {
      callback({ error: "房间不存在或已解散" });
      return;
    }

    const player = room.players.find(p => p.playerId === payload.playerId);
    if (!player) {
      callback({ error: "玩家不存在（可能已超时被移除）" });
      return;
    }

    // ✅ 取消删除定时器
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = undefined;
    }

    // ✅ 更新 socketId + 重新加入房间频道 + 标记在线
    player.socketId = socket.id;
    player.isOnline = true;
    socket.join(payload.roomId);
    console.log(`✅ 玩家 ${player.name} 重连成功，新 socketId: ${socket.id}`);

    // ✅ 把完整状态回传给重连的玩家
    const state = buildGameState(room);
    const you = buildPrivate(player);
    const resp: StateSyncPayload = { roomId: payload.roomId, you, state };
    callback(resp);

    // ✅ 广播给其他人：玩家回来了
    broadcastState(io, room);
  });
});

httpServer.listen(3001, () => {
  console.log("🚀 Server running on http://localhost:3001");
});