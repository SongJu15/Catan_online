// ================================================================
// trade.ts — 玩家间交易逻辑
// 流程：发起方 offer → 其他玩家 accept/reject → 发起方 confirm/cancel
// ================================================================

import type { ServerRoom } from "./types";// 服务端房间结构（非 shared）
import type {
  PlayerPrivate,
  TradeOffer,
  TradeOfferReq,
  TradeAcceptReq,
  TradeRejectReq,
  TradeConfirmReq,
  TradeCancelReq,
  PlayerResources,
} from "@catan/shared";

// 所有处理函数的统一返回类型
type Result = { ok: boolean; error?: string };

// ----------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------

/** 生成唯一交易 ID */
function genTradeId(): string {
  return `trade_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 判断 resources 是否满足 need 的需求 */
function hasEnough(resources: PlayerResources, need: PlayerResources): boolean {
  return (Object.keys(need) as (keyof PlayerResources)[]).every(
    k => (resources[k] ?? 0) >= (need[k] ?? 0)
  );
}

/** 资源相加：a + b */
function addRes(a: PlayerResources, b: PlayerResources): PlayerResources {
  const result = { ...a };
  (Object.keys(b) as (keyof PlayerResources)[]).forEach(k => {
    result[k] = (result[k] ?? 0) + (b[k] ?? 0);
  });
  return result;
}

/** 资源相减：a - b */
function subRes(a: PlayerResources, b: PlayerResources): PlayerResources {
  const result = { ...a };
  (Object.keys(b) as (keyof PlayerResources)[]).forEach(k => {
    result[k] = (result[k] ?? 0) - (b[k] ?? 0);
  });
  return result;
}

/** 计算资源总数（用于同步公开手牌数） */
function totalCards(resources: PlayerResources): number {
  return Object.values(resources).reduce((a, b) => a + b, 0);
}

// ----------------------------------------------------------------
// 发起交易
// ----------------------------------------------------------------

/**
 * 当前回合玩家发起交易请求
 * - 校验：游戏阶段、是否轮到自己、是否已掷骰、是否已有进行中的交易
 * - 校验：offer/request 不能为空，且自身资源足够
 * - 成功后写入 state.tradeOffer，其他玩家状态初始化为 "pending"
 */
export function handleTradeOffer(
  state: ServerRoom,
  privates: Map<string, PlayerPrivate>,
  playerId: string,
  req: TradeOfferReq
): Result {
  if (state.phase !== "playing")      return { ok: false, error: "不在游戏阶段" };
  if (state.players[state.currentPlayerIndex].playerId !== playerId)
                                      return { ok: false, error: "不是你的回合" };
  if (!state.hasRolled)               return { ok: false, error: "请先掷骰子" };
  if (state.tradeOffer)               return { ok: false, error: "已有进行中的交易" };

  // offer 和 request 都不能为空
  if (totalCards(req.offer) === 0)    return { ok: false, error: "请选择要给出的资源" };
  if (totalCards(req.request) === 0)  return { ok: false, error: "请选择要获得的资源" };

  const myPrivate = privates.get(playerId);
  if (!myPrivate) return { ok: false, error: "玩家不存在" };
  if (!hasEnough(myPrivate.resources, req.offer))
    return { ok: false, error: "你的资源不足" };

  // 初始化其他玩家的响应状态为 pending
  const responses: TradeOffer["responses"] = {};
  state.players
    .filter(p => p.playerId !== playerId)
    .forEach(p => { responses[p.playerId] = "pending"; });

  state.tradeOffer = {
    tradeId: genTradeId(),
    fromPlayerId: playerId,
    offer: req.offer,
    request: req.request,
    responses,
    status: "pending",
  };

  return { ok: true };
}

// ----------------------------------------------------------------
// 接受交易
// ----------------------------------------------------------------

/**
 * 其他玩家接受交易（仅表示愿意，尚未成交）
 * - 校验：交易存在且未结束、不能接受自己的交易、自身资源足够
 * - 成功后将该玩家响应标记为 "accepted"
 * - 发起方看到 accepted 列表后可选择与谁 confirm
 */
export function handleTradeAccept(
  state: ServerRoom,
  privates: Map<string, PlayerPrivate>,
  playerId: string,
  req: TradeAcceptReq
): Result {
  const trade = state.tradeOffer;
  if (!trade || trade.tradeId !== req.tradeId) return { ok: false, error: "交易不存在" };
  if (trade.status !== "pending")              return { ok: false, error: "交易已结束" };
  if (trade.fromPlayerId === playerId)         return { ok: false, error: "不能接受自己的交易" };

  const myPrivate = privates.get(playerId);
  if (!myPrivate) return { ok: false, error: "玩家不存在" };
  // 检查接受方是否有足够的资源满足发起方的 request
  if (!hasEnough(myPrivate.resources, trade.request))
    return { ok: false, error: "你的资源不足" };

  trade.responses[playerId] = "accepted";
  return { ok: true };
}

// ----------------------------------------------------------------
// 拒绝交易
// ----------------------------------------------------------------

/**
 * 其他玩家拒绝交易
 * - 校验：交易存在且未结束、不能拒绝自己的交易
 * - 成功后将该玩家响应标记为 "rejected"
 */
export function handleTradeReject(
  state: ServerRoom,
  playerId: string,
  req: TradeRejectReq
): Result {
  const trade = state.tradeOffer;
  if (!trade || trade.tradeId !== req.tradeId) return { ok: false, error: "交易不存在" };
  if (trade.status !== "pending")              return { ok: false, error: "交易已结束" };
  if (trade.fromPlayerId === playerId)         return { ok: false, error: "不能拒绝自己的交易" };

  trade.responses[playerId] = "rejected";
  return { ok: true };
}

// ----------------------------------------------------------------
// 确认成交
// ----------------------------------------------------------------

/**
 * 发起方选择与某个已接受的玩家正式成交，执行资源交换
 * - 校验：交易存在且未结束、只有发起方可以确认、目标玩家已接受
 * - 再次校验双方资源是否仍然足够（防止中途资源变化）
 * - 执行资源交换：双方互换 offer 和 request
 * - 同步公开手牌数（totalCards），清空 tradeOffer
 */
export function handleTradeConfirm(
  state: ServerRoom,
  privates: Map<string, PlayerPrivate>,
  playerId: string,
  req: TradeConfirmReq
): Result {
  const trade = state.tradeOffer;
  if (!trade || trade.tradeId !== req.tradeId) return { ok: false, error: "交易不存在" };
  if (trade.status !== "pending")              return { ok: false, error: "交易已结束" };
  if (trade.fromPlayerId !== playerId)         return { ok: false, error: "只有发起方可以确认" };
  if (trade.responses[req.targetPlayerId] !== "accepted")
    return { ok: false, error: "对方未接受交易" };

  const fromPrivate = privates.get(playerId);
  const toPrivate   = privates.get(req.targetPlayerId);
  if (!fromPrivate || !toPrivate) return { ok: false, error: "玩家不存在" };

  // 二次校验：防止玩家在 accept 之后资源被其他操作消耗
  if (!hasEnough(fromPrivate.resources, trade.offer))
    return { ok: false, error: "你的资源不足" };
  if (!hasEnough(toPrivate.resources, trade.request))
    return { ok: false, error: "对方资源不足" };

  // 执行资源交换：发起方给出 offer 换回 request，接受方反之
  fromPrivate.resources = addRes(subRes(fromPrivate.resources, trade.offer), trade.request);
  toPrivate.resources   = addRes(subRes(toPrivate.resources, trade.request), trade.offer);

  // 清空交易，本次交易结束
  state.tradeOffer = null;
  return { ok: true };
}

// ----------------------------------------------------------------
// 取消交易
// ----------------------------------------------------------------

/**
 * 发起方取消本次交易
 * - 校验：交易存在、只有发起方可以取消
 * - 清空 tradeOffer，所有玩家的交易面板关闭
 */
export function handleTradeCancel(
  state: ServerRoom,
  playerId: string,
  req: TradeCancelReq
): Result {
  const trade = state.tradeOffer;
  if (!trade || trade.tradeId !== req.tradeId) return { ok: false, error: "交易不存在" };
  if (trade.fromPlayerId !== playerId)         return { ok: false, error: "只有发起方可以取消" };

  // 清空交易
  state.tradeOffer = null;
  return { ok: true };
}