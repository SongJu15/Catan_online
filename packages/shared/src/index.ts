// ============================================================
// 事件常量
// ============================================================
export const ROOM_CREATE = "room_create";
export const ROOM_JOIN = "room_join";
export const ROOM_ERROR = "room_error";
export const PLAYER_READY = "player_ready";
export const GAME_START = "game_start";
export const GAME_ERROR = "game_error";
export const STATE_SYNC = "state_sync";
export const ACTION_PLACE_SETTLEMENT = "action_place_settlement";
export const ACTION_PLACE_ROAD = "action_place_road";
export const ACTION_ROLL_DICE = "action_roll_dice";
export const ACTION_END_TURN = "action_end_turn";
export const ACTION_BUILD_SETTLEMENT = "action_build_settlement";
export const ACTION_BUILD_CITY = "action_build_city";
export const ACTION_BUILD_ROAD = "action_build_road";
export const ACTION_BUY_DEV_CARD = "action_buy_dev_card";
export const ACTION_PLAY_DEV_CARD = "action_play_dev_card";
export const ACTION_BANK_TRADE = "action_bank_trade";
export const ACTION_MOVE_ROBBER = "action_move_robber";
export const ACTION_DISCARD = "action_discard";
export const ACTION_ROB_PLAYER = "action_rob_player";

// ============================================================
// 资源类型
// ============================================================
export type ResourceType = "wood" | "brick" | "sheep" | "wheat" | "ore";
export type TerrainType = ResourceType | "desert";

// ============================================================
// 发展卡类型
// ============================================================
export type DevCardType =
  | "knight"        // 骑士
  | "victory_point" // 胜利点
  | "road_building" // 道路建设
  | "year_of_plenty"// 丰收年
  | "monopoly";     // 垄断

export interface DevCard {
  type: DevCardType;
  /** 购买时的回合号，用于判断是否可以本回合使用 */
  turnBought: number;
}

// ============================================================
// 六边形地块
// ============================================================
export interface Hex {
  id: string;
  x: number;
  y: number;
  terrain: TerrainType;
  diceNumber: number;
  vertexIds: string[];
  edgeIds: string[];
  hasRobber?: boolean;
}

// ============================================================
// 顶点（可以放置定居点/城市）
// ============================================================
export interface Vertex {
  id: string;
  x: number;
  y: number;
  ownerPlayerId?: string;
  building?: "settlement" | "city";
  adjacentVertexIds: string[];
  adjacentEdgeIds: string[];
  adjacentHexIds: string[];
}

// ============================================================
// 边（可以放置道路）
// ============================================================
export interface Edge {
  id: string;
  fromVertexId: string;
  toVertexId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ownerPlayerId?: string;
}

// ============================================================
// 棋盘
// ============================================================
export interface Board {
  hexes: Hex[];
  vertices: Vertex[];
  edges: Edge[];
}

// ============================================================
// 玩家资源手牌（仅自己可见）
// ============================================================
export interface PlayerResources {
  wood: number;
  brick: number;
  sheep: number;
  wheat: number;
  ore: number;
}

// ============================================================
// 玩家公开信息（所有人可见）
// ============================================================
export interface PlayerSummary {
  playerId: string;
  name: string;
  color: string;
  isReady: boolean;
  victoryPoints: number;
  totalCards: number;
  settlements: number;
  cities: number;
  roads: number;
  /** 已打出的骑士牌数量 */
  knightsPlayed: number;
  /** 是否持有最大军队称号 */
  hasLargestArmy: boolean;
  /** 是否持有最长道路称号 */
  hasLongestRoad: boolean;
  /** 公开的发展卡数量（不透露种类） */
  devCardCount: number;
}

// ============================================================
// 玩家私有信息（仅自己可见）
// ============================================================
export interface PlayerPrivate {
  playerId: string;
  resources: PlayerResources;
  /** 手牌中的发展卡列表 */
  devCards: DevCard[];
}

// ============================================================
// 初始放置阶段信息
// ============================================================
export interface SetupInfo {
  setupOrder: string[];
  placedPlayers: string[];
  pendingSettlementVertexId?: string;
}

// ============================================================
// 强盗阶段信息
// ============================================================
export interface RobberInfo {
  /** 需要丢牌的玩家列表（手牌 > 7 张） */
  mustDiscard: string[];
  /** 已完成丢牌的玩家列表 */
  discarded: string[];
  /** 是否已完成丢牌阶段，等待移动强盗 */
  waitingForMove: boolean;
}

// ============================================================
// 道路建设发展卡临时状态
// ============================================================
export interface RoadBuildingInfo {
  roadsLeft: number; // 还可以免费建几条路（最多2）
}

// ============================================================
// 游戏状态（公开部分）
// ============================================================
export interface GameState {
  roomId: string;
  phase: "lobby" | "setup_settlement" | "setup_road" | "playing" | "ended";
  hostPlayerId: string;
  currentPlayerId: string;
  players: PlayerSummary[];
  board: Board | null;
  setupInfo: SetupInfo | null;
  diceResult?: [number, number] | null;
  hasRolled?: boolean;
  winner?: string | null;
  /** 强盗阶段信息（骰到7点时存在） */
  robberInfo?: RobberInfo | null;
  /** 强盗当前所在的 hexId */
  robberHexId?: string | null;
  /** 道路建设卡激活状态 */
  roadBuildingInfo?: RoadBuildingInfo | null;
  /** 丰收年卡激活状态（等待玩家选择2种资源） */
  yearOfPlentyPending?: boolean;
  /** 垄断卡激活状态（等待玩家选择资源种类） */
  monopolyPending?: boolean;
  /** 当前回合号（用于发展卡购买后下回合才能用） */
  turnNumber?: number;
}

// ============================================================
// Socket 事件 Payload
// ============================================================
export interface RoomCreateReq {
  name: string;
}

export interface RoomJoinReq {
  roomId: string;
  name: string;
}

export interface RoomErrorPayload {
  message: string;
}

export interface GameErrorPayload {
  message: string;
  code?: string;
}

export interface StateSyncPayload {
  roomId: string;
  you: PlayerPrivate;
  state: GameState;
}

export interface PlaceSettlementReq {
  roomId: string;
  vertexId: string;
}

export interface PlaceRoadReq {
  roomId: string;
  edgeId: string;
}

export interface PlayerReadyReq {
  roomId: string;
  ready: boolean;
}

export interface RollDiceReq {
  roomId: string;
}

export interface EndTurnReq {
  roomId: string;
}

export interface BuildSettlementReq {
  roomId: string;
  vertexId: string;
}

export interface BuildCityReq {
  roomId: string;
  vertexId: string;
}

export interface BuildRoadReq {
  roomId: string;
  edgeId: string;
}

/** 购买发展卡 */
export interface BuyDevCardReq {
  roomId: string;
}

/** 使用发展卡 */
export interface PlayDevCardReq {
  roomId: string;
  cardType: DevCardType;
  /** 垄断卡：选择的资源种类 */
  monopolyResource?: ResourceType;
  /** 丰收年卡：选择的两种资源 */
  yearOfPlentyResources?: [ResourceType, ResourceType];
}

/** 银行交易 */
export interface BankTradeReq {
  roomId: string;
  /** 给出的资源（4张同种） */
  give: ResourceType;
  /** 换取的资源 */
  receive: ResourceType;
}

/** 移动强盗 */
export interface MoveRobberReq {
  roomId: string;
  hexId: string;
  /** 要抢劫的玩家 ID（可选，该地块上有其他玩家时必填） */
  robPlayerId?: string;
}

/** 丢弃资源（骰到7点手牌>7时） */
export interface DiscardReq {
  roomId: string;
  resources: PlayerResources;
}

// ============================================================
// 建造费用
// ============================================================
export const SETTLEMENT_COST: PlayerResources = { wood: 1, brick: 1, sheep: 1, wheat: 1, ore: 0 };
export const CITY_COST: PlayerResources       = { wood: 0, brick: 0, sheep: 0, wheat: 2, ore: 3 };
export const ROAD_COST: PlayerResources       = { wood: 1, brick: 1, sheep: 0, wheat: 0, ore: 0 };
export const DEV_CARD_COST: PlayerResources   = { wood: 0, brick: 0, sheep: 1, wheat: 1, ore: 1 };

/** 标准发展卡牌堆组成 */
export const DEV_CARD_DECK: DevCardType[] = [
  ...Array(14).fill("knight"),
  ...Array(5).fill("victory_point"),
  ...Array(2).fill("road_building"),
  ...Array(2).fill("year_of_plenty"),
  ...Array(2).fill("monopoly"),
];

// ============================================================
// 工具函数
// ============================================================
export function emptyResources(): PlayerResources {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}

export function totalResources(r: PlayerResources): number {
  return r.wood + r.brick + r.sheep + r.wheat + r.ore;
}

export function hasEnoughResources(have: PlayerResources, cost: PlayerResources): boolean {
  return (Object.keys(cost) as (keyof PlayerResources)[]).every(k => have[k] >= cost[k]);
}

export function deductResources(have: PlayerResources, cost: PlayerResources): PlayerResources {
  const result = { ...have };
  (Object.keys(cost) as (keyof PlayerResources)[]).forEach(k => { result[k] -= cost[k]; });
  return result;
}

export function addResources(have: PlayerResources, add: PlayerResources): PlayerResources {
  const result = { ...have };
  (Object.keys(add) as (keyof PlayerResources)[]).forEach(k => { result[k] += add[k]; });
  return result;
}