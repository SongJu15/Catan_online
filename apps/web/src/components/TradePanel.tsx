import { useState } from 'react'
import socket from '../socket'
import {
  ACTION_TRADE_OFFER,
  ACTION_TRADE_ACCEPT,
  ACTION_TRADE_REJECT,
  ACTION_TRADE_CONFIRM,
  ACTION_TRADE_CANCEL,
} from '@catan/shared'
import type {
  PlayerResources,
  PlayerSummary,
  TradeOffer,
  ResourceType,
} from '@catan/shared'

// ============================================================
// 常量
// ============================================================
const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: '木材', brick: '砖块', ore: '矿石', wheat: '小麦', sheep: '羊毛',
}
const RESOURCE_EMOJI: Record<ResourceType, string> = {
  wood: '🌲', brick: '🧱', ore: '⛰️', wheat: '🌾', sheep: '🐑',
}
const ALL_RESOURCES: ResourceType[] = ['wood', 'brick', 'ore', 'wheat', 'sheep']

function emptyRes(): PlayerResources {
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
}
function totalRes(r: PlayerResources) {
  return r.wood + r.brick + r.sheep + r.wheat + r.ore
}

// ============================================================
// Props
// ============================================================
interface TradePanelProps {
  roomId: string
  myPlayerId: string
  myResources: PlayerResources
  players: PlayerSummary[]
  tradeOffer: TradeOffer | null | undefined
  isMyTurn: boolean
  hasRolled: boolean
  isLocked: boolean
}

// ============================================================
// 主组件
// ============================================================
export default function TradePanel({
  roomId,
  myPlayerId,
  myResources,
  players,
  tradeOffer,
  isMyTurn,
  hasRolled,
  isLocked,
}: TradePanelProps) {
  // 发起交易的本地草稿
  const [offer, setOffer] = useState<PlayerResources>(emptyRes())
  const [request, setRequest] = useState<PlayerResources>(emptyRes())
  const [expanded, setExpanded] = useState(false)

  const iAmOfferer = tradeOffer?.fromPlayerId === myPlayerId
  const iAmReceiver = !!tradeOffer && tradeOffer.fromPlayerId !== myPlayerId
  const myResponse = tradeOffer?.responses[myPlayerId]

  const canInitiate = isMyTurn && hasRolled && !isLocked && !tradeOffer
  const offerTotal = totalRes(offer)
  const requestTotal = totalRes(request)
  const canSendOffer = canInitiate && offerTotal > 0 && requestTotal > 0

  // ── 发起交易 ──────────────────────────────────────────────
  const handleSendOffer = () => {
    if (!canSendOffer) return
    socket.emit(ACTION_TRADE_OFFER, { roomId, offer, request })
    setOffer(emptyRes())
    setRequest(emptyRes())
    setExpanded(false)
  }

  // ── 接受 / 拒绝 ───────────────────────────────────────────
  const handleAccept = () => {
    if (!tradeOffer) return
    socket.emit(ACTION_TRADE_ACCEPT, { roomId, tradeId: tradeOffer.tradeId })
  }
  const handleReject = () => {
    if (!tradeOffer) return
    socket.emit(ACTION_TRADE_REJECT, { roomId, tradeId: tradeOffer.tradeId })
  }

  // ── 确认成交 ──────────────────────────────────────────────
  const handleConfirm = (targetPlayerId: string) => {
    if (!tradeOffer) return
    socket.emit(ACTION_TRADE_CONFIRM, { roomId, tradeId: tradeOffer.tradeId, targetPlayerId })
  }

  // ── 取消交易 ──────────────────────────────────────────────
  const handleCancel = () => {
    if (!tradeOffer) return
    socket.emit(ACTION_TRADE_CANCEL, { roomId, tradeId: tradeOffer.tradeId })
  }

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div style={panelStyle}>
      <h3 style={panelTitle}>🤝 玩家交易</h3>

      {/* ── 情况1：当前没有交易邀约 ── */}
      {!tradeOffer && (
        <>
          {canInitiate ? (
            <>
              <button
                onClick={() => setExpanded(v => !v)}
                style={btnStyle('#8e44ad')}
              >
                {expanded ? '▲ 收起' : '▼ 发起交易邀约'}
              </button>

              {expanded && (
                <div style={{ marginTop: 10 }}>
                  {/* 给出 */}
                  <SectionLabel>📤 我给出</SectionLabel>
                  <ResourceEditor
                    value={offer}
                    onChange={setOffer}
                    myResources={myResources}
                    cap="have"
                  />

                  {/* 想要 */}
                  <SectionLabel style={{ marginTop: 10 }}>📥 我想要</SectionLabel>
                  <ResourceEditor
                    value={request}
                    onChange={setRequest}
                    myResources={myResources}
                    cap="none"
                  />

                  {/* 摘要 */}
                  {(offerTotal > 0 || requestTotal > 0) && (
                    <div style={summaryBox}>
                      {offerTotal > 0 && (
                        <span>给出：{renderResShort(offer)}</span>
                      )}
                      {offerTotal > 0 && requestTotal > 0 && (
                        <span style={{ opacity: 0.5 }}> → </span>
                      )}
                      {requestTotal > 0 && (
                        <span>换取：{renderResShort(request)}</span>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleSendOffer}
                    disabled={!canSendOffer}
                    style={{ ...btnStyle(canSendOffer ? '#27ae60' : '#555'), marginTop: 8 }}
                  >
                    📨 发送邀约
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={hintText}>
              {isLocked
                ? '⚠️ 当前阶段无法交易'
                : !isMyTurn
                ? '⏳ 等待当前玩家发起交易'
                : !hasRolled
                ? '🎲 请先掷骰子'
                : ''}
            </div>
          )}
        </>
      )}

      {/* ── 情况2：我是发起方 ── */}
      {tradeOffer && iAmOfferer && (
        <OffererView
          tradeOffer={tradeOffer}
          players={players}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {/* ── 情况3：我是接收方 ── */}
      {tradeOffer && iAmReceiver && (
        <ReceiverView
          tradeOffer={tradeOffer}
          players={players}
          myResources={myResources}
          myResponse={myResponse}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
    </div>
  )
}

// ============================================================
// 发起方视图
// ============================================================
function OffererView({
  tradeOffer, players, onConfirm, onCancel,
}: {
  tradeOffer: TradeOffer
  players: PlayerSummary[]
  onConfirm: (targetPlayerId: string) => void
  onCancel: () => void
}) {
  const acceptedPlayers = Object.entries(tradeOffer.responses)
    .filter(([, v]) => v === 'accepted')
    .map(([pid]) => players.find(p => p.playerId === pid))
    .filter(Boolean) as PlayerSummary[]

  const pendingCount = Object.values(tradeOffer.responses)
    .filter(v => v === 'pending').length

  return (
    <div>
      {/* 邀约内容 */}
      <TradeOfferSummary offer={tradeOffer.offer} request={tradeOffer.request} />

      {/* 等待响应 */}
      <div style={{ marginTop: 10 }}>
        <SectionLabel>玩家响应</SectionLabel>
        {Object.entries(tradeOffer.responses).map(([pid, status]) => {
          const p = players.find(pl => pl.playerId === pid)
          if (!p) return null
          const icon = status === 'accepted' ? '✅' : status === 'rejected' ? '❌' : '⏳'
          const label = status === 'accepted' ? '已接受' : status === 'rejected' ? '已拒绝' : '等待中'
          return (
            <div key={pid} style={responseRow(p.color)}>
              <span style={{ fontSize: 13 }}>
                {icon} <strong>{p.name}</strong>
              </span>
              <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
            </div>
          )
        })}
      </div>

      {/* 有人接受时，选择与谁成交 */}
      {acceptedPlayers.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <SectionLabel>选择成交对象</SectionLabel>
          {acceptedPlayers.map(p => (
            <button
              key={p.playerId}
              onClick={() => onConfirm(p.playerId)}
              style={{ ...btnStyle(p.color), marginBottom: 6 }}
            >
              🤝 与 {p.name} 成交
            </button>
          ))}
        </div>
      )}

      {pendingCount > 0 && acceptedPlayers.length === 0 && (
        <div style={hintText}>⏳ 等待其他玩家响应…</div>
      )}

      <button onClick={onCancel} style={{ ...btnStyle('#c0392b'), marginTop: 8 }}>
        ✖ 取消交易
      </button>
    </div>
  )
}

// ============================================================
// 接收方视图
// ============================================================
function ReceiverView({
  tradeOffer, players, myResources, myResponse, onAccept, onReject,
}: {
  tradeOffer: TradeOffer
  players: PlayerSummary[]
  myResources: PlayerResources
  myResponse: 'pending' | 'accepted' | 'rejected' | undefined
  onAccept: () => void
  onReject: () => void
}) {
  const offerer = players.find(p => p.playerId === tradeOffer.fromPlayerId)

  // 检查我是否有足够资源接受
  const canAfford = ALL_RESOURCES.every(
    r => myResources[r] >= tradeOffer.request[r]
  )

  if (tradeOffer.status === 'confirmed') {
    return (
      <div style={{ ...hintText, color: '#27ae60' }}>
        ✅ 交易已完成
      </div>
    )
  }
  if (tradeOffer.status === 'cancelled') {
    return (
      <div style={hintText}>
        ✖ 交易已取消
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.85 }}>
        <strong style={{ color: offerer?.color ?? '#fff' }}>
          {offerer?.name ?? '某玩家'}
        </strong>{' '}
        发起了交易邀约：
      </div>

      {/* 邀约内容（从接收方角度：对方给出 = 我得到，对方想要 = 我给出） */}
      <TradeOfferSummary
        offer={tradeOffer.offer}
        request={tradeOffer.request}
        receiverView
      />

      {!canAfford && (
        <div style={{ color: '#e74c3c', fontSize: 12, margin: '8px 0' }}>
          ⚠️ 你的资源不足以接受此交易
        </div>
      )}

      {myResponse === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={onAccept}
            disabled={!canAfford}
            style={{
              ...btnStyle(canAfford ? '#27ae60' : '#555'),
              flex: 1, marginBottom: 0,
            }}
          >
            ✅ 接受
          </button>
          <button
            onClick={onReject}
            style={{ ...btnStyle('#c0392b'), flex: 1, marginBottom: 0 }}
          >
            ❌ 拒绝
          </button>
        </div>
      )}

      {myResponse === 'accepted' && (
        <div style={{ ...hintText, color: '#27ae60', marginTop: 8 }}>
          ✅ 你已接受，等待对方确认…
        </div>
      )}

      {myResponse === 'rejected' && (
        <div style={{ ...hintText, marginTop: 8 }}>
          ❌ 你已拒绝此交易
        </div>
      )}
    </div>
  )
}

// ============================================================
// 交易内容摘要组件
// ============================================================
function TradeOfferSummary({
  offer, request, receiverView = false,
}: {
  offer: PlayerResources
  request: PlayerResources
  receiverView?: boolean
}) {
  // 发起方：offer = 我给，request = 我要
  // 接收方：offer = 我得到，request = 我给出
  const giveRes = receiverView ? request : offer
  const getRes  = receiverView ? offer   : request

  return (
    <div style={offerBox}>
      <div style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {receiverView ? '你需要给出' : '我给出'}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {ALL_RESOURCES.filter(r => giveRes[r] > 0).map(r => (
            <ResChip key={r} resource={r} count={giveRes[r]} />
          ))}
          {totalRes(giveRes) === 0 && <span style={{ opacity: 0.4, fontSize: 12 }}>（无）</span>}
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 18, opacity: 0.6, margin: '4px 0' }}>⇅</div>
      <div>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {receiverView ? '你将得到' : '我想要'}
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {ALL_RESOURCES.filter(r => getRes[r] > 0).map(r => (
            <ResChip key={r} resource={r} count={getRes[r]} />
          ))}
          {totalRes(getRes) === 0 && <span style={{ opacity: 0.4, fontSize: 12 }}>（无）</span>}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 资源编辑器（加减按钮）
// ============================================================
function ResourceEditor({
  value, onChange, myResources, cap,
}: {
  value: PlayerResources
  onChange: (r: PlayerResources) => void
  myResources: PlayerResources
  cap: 'have' | 'none'  // have = 不超过手牌数，none = 无上限（想要）
}) {
  const adjust = (key: ResourceType, delta: number) => {
    const max = cap === 'have' ? myResources[key] : 99
    const next = Math.max(0, Math.min(max, value[key] + delta))
    onChange({ ...value, [key]: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {ALL_RESOURCES.map(r => {
        const maxVal = cap === 'have' ? myResources[r] : 99
        return (
          <div key={r} style={resEditorRow}>
            <span style={{ fontSize: 13, flex: 1 }}>
              {RESOURCE_EMOJI[r]} {RESOURCE_LABELS[r]}
              {cap === 'have' && (
                <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 4 }}>
                  (有{myResources[r]})
                </span>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => adjust(r, -1)}
                disabled={value[r] === 0}
                style={smallBtn}
              >－</button>
              <span style={{
                minWidth: 20, textAlign: 'center',
                fontWeight: 'bold', fontSize: 14,
                color: value[r] > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
              }}>
                {value[r]}
              </span>
              <button
                onClick={() => adjust(r, 1)}
                disabled={value[r] >= maxVal}
                style={smallBtn}
              >＋</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================
// 小工具组件
// ============================================================
function ResChip({ resource, count }: { resource: ResourceType; count: number }) {
  const colors: Record<ResourceType, string> = {
    wood: '#2d6a2d', brick: '#c0522a', ore: '#7f8c8d', wheat: '#d4ac0d', sheep: '#58b85c',
  }
  return (
    <span style={{
      background: colors[resource],
      color: '#fff', borderRadius: 6,
      padding: '2px 8px', fontSize: 12, fontWeight: 'bold',
    }}>
      {RESOURCE_EMOJI[resource]} ×{count}
    </span>
  )
}

function SectionLabel({
  children, style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      fontSize: 12, opacity: 0.7, marginBottom: 4,
      borderLeft: '2px solid rgba(255,255,255,0.3)',
      paddingLeft: 6, ...style,
    }}>
      {children}
    </div>
  )
}

function renderResShort(r: PlayerResources): string {
  return ALL_RESOURCES
    .filter(k => r[k] > 0)
    .map(k => `${RESOURCE_EMOJI[k]}×${r[k]}`)
    .join(' ')
}

// ============================================================
// 样式
// ============================================================
const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  borderRadius: 10,
  padding: '10px 12px',
}

const panelTitle: React.CSSProperties = {
  margin: '0 0 8px 0',
  fontSize: 14,
  fontWeight: 'bold',
  borderBottom: '1px solid rgba(255,255,255,0.15)',
  paddingBottom: 6,
  color: '#fff',
}

const offerBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8,
  padding: '10px 12px',
}

const summaryBox: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  marginTop: 8,
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 4,
  alignItems: 'center',
}

const resEditorRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  background: 'rgba(255,255,255,0.06)',
  borderRadius: 6,
  padding: '5px 8px',
}

const responseRow = (color: string): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '5px 8px',
  borderRadius: 6,
  marginBottom: 4,
  background: color + '33',
  border: `1px solid ${color}66`,
})

const hintText: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  textAlign: 'center',
  padding: '8px 0',
  color: '#fff',
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    display: 'block', width: '100%', marginBottom: 4,
    padding: '8px 0', background: bg, color: '#fff',
    border: 'none', borderRadius: 6,
    fontWeight: 'bold', fontSize: 13,
    cursor: bg === '#555' ? 'not-allowed' : 'pointer',
    opacity: bg === '#555' ? 0.55 : 1,
  }
}

const smallBtn: React.CSSProperties = {
  width: 26, height: 26,
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 4, color: '#fff',
  cursor: 'pointer', fontSize: 13,
}