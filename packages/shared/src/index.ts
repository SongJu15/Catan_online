// ============================================================
// 第一阶段事件名（保留不变）
// ============================================================
export const ROOM_CREATE = "ROOM_CREATE" as const;
export const ROOM_JOIN = "ROOM_JOIN" as const;
export const STATE_SYNC = "STATE_SYNC" as const;
export const ROOM_ERROR = "ROOM_ERROR" as const;

// ============================================================
// 第二阶段新增事件名
// ============================================================
export const GAME_START = "GAME_START" as const;
export const ACTION_PLACE_SETTLEMENT = "ACTION_PLACE_SETTLEMENT" as const;
export const ACTION_PLACE_ROAD = "ACTION_PLACE_ROAD" as const;
export const GAME_ERROR = "GAME_ERROR" as const;

// ============================================================
// 第一阶段类型（保留不变）
// ============================================================
export type RoomCreateReq = {
  name: string;
};

export type RoomJoinReq = {
  roomId: string;
  name: string;
};

export type RoomErrorPayload = {
  message: string;
};

// ============================================================
// 玩家信息（升级：加入 color 字段）
// ============================================================
export type PlayerSummary = {
  playerId: string;
  name: string;
  color: "red" | "blue" | "orange" | "white";
};

// ============================================================
// 棋盘数据结构（第二阶段新增）
// ============================================================
export type ResourceType =
  | "wood"
  | "brick"
  | "sheep"
  | "wheat"
  | "ore"
  | "desert";

export type Hex = {
  id: string;
  resourceType: ResourceType;
  diceNumber: number;
  vertexIds: string[];
  edgeIds: string[];
};

export type Vertex = {
  id: string;
  x: number;
  y: number;
  ownerPlayerId?: string;
  building?: "settlement" | "city";
  adjacentVertexIds: string[];
  adjacentEdgeIds: string[];
};

export type Edge = {
  id: string;
  fromVertexId: string;
  toVertexId: string;
  ownerPlayerId?: string;
};

export type Board = {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
};

// ============================================================
// 游戏阶段
// ============================================================
export type GamePhase =
  | "lobby"
  | "setup_settlement"
  | "setup_road"
  | "playing";

// ============================================================
// Setup 阶段追踪信息（第二阶段新增）
// ============================================================
export type SetupInfo = {
  setupOrder: string[];
  placedPlayers: string[];
  pendingSettlementVertexId?: string;
};

// ============================================================
// 房间/游戏状态（升级：RoomState -> GameState）
// ============================================================
export type GameState = {
  roomId: string;
  phase: GamePhase;
  hostPlayerId: string;
  currentPlayerId: string;
  players: PlayerSummary[];
  board: Board | null;
  setupInfo: SetupInfo | null;
};

// 保留 RoomState 作为别名，避免前端报错（兼容第一阶段）
export type RoomState = GameState;

// ============================================================
// 网络传输 Payload 类型
// ============================================================
export type StateSyncPayload = {
  roomId: string;
  you: { playerId: string };
  state: GameState;
};

// 第二阶段新增
export type GameStartReq = Record<string, never>;

export type PlaceSettlementReq = {
  vertexId: string;
};

export type PlaceRoadReq = {
  edgeId: string;
};

export type GameErrorPayload = {
  message: string;
  code?: string;
};
