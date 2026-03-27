// ================================================================
// types.ts — 服务端内部类型定义
// 与 @catan/shared 的区别：这里是服务端私有结构，不对外暴露
// ================================================================

import type {
  GameState, Board, PlayerResources,
  SetupInfo, RobberInfo, RoadBuildingInfo,
  DevCard, DevCardType, TradeOffer,
} from "@catan/shared";

// ----------------------------------------------------------------
// 服务端内部玩家结构（含私有信息）
// ----------------------------------------------------------------
export interface ServerPlayer {
  playerId: string;
  socketId: string;
  name: string;
  color: string;
  isReady: boolean;
  // 私有资源（不对外广播）
  resources: PlayerResources;
  // 发展卡手牌（私有）
  devCards: DevCard[];
  // 已打出的骑士数
  knightsPlayed: number;
  // 称号
  hasLargestArmy: boolean;
  hasLongestRoad: boolean;
  // 建筑数量（公开）
  settlements: number;
  cities: number;
  roads: number;
  // 断线重连相关
  isOnline: boolean;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

// ----------------------------------------------------------------
// 服务端内部房间结构
// ----------------------------------------------------------------
export interface ServerRoom {
  roomId: string;
  hostPlayerId: string;
  phase: GameState["phase"];
  players: ServerPlayer[];
  board: Board | null;
  setupInfo: SetupInfo | null;
  diceResult: [number, number] | null;
  hasRolled: boolean;
  winner: string | null;
  // 强盗
  robberInfo: RobberInfo | null;
  robberHexId: string | null;
  // 发展卡牌堆
  devCardDeck: DevCardType[];
  // 道路建设卡状态
  roadBuildingInfo: RoadBuildingInfo | null;
  // 丰收年 / 垄断 待处理
  yearOfPlentyPending: boolean;
  monopolyPending: boolean;
  // 回合号
  turnNumber: number;
  // 当前玩家索引
  currentPlayerIndex: number;
  // 玩家间交易（null 表示当前无进行中的交易）
  tradeOffer: TradeOffer | null;
}