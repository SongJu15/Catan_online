import { useState, useRef, useEffect } from 'react'
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
// 拖拽 Hook（整个弹窗可拖）
// ============================================================
function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    // 排除按钮、输入框等交互元素，防止误触发拖拽
    const tag = (e.target as HTMLElement).tagName
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return

    dragging.current = true
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    offset.current = {
      x: e.clientX - box.left,
      y: e.clientY - box.top,
    }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: e.clientX - offset.current.x,
        y: e.clientY - offset.current.y,
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { pos, onMouseDown }
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
  const [open, setOpen] = useState(false)

  const iAmOfferer  = tradeOffer?.fromPlayerId === myPlayerId
  const iAmReceiver = !!tradeOffer && tradeOffer.fromPlayerId !== myPlayerId

  const canInitiate = isMyTurn && hasRolled && !isLocked && !tradeOffer
  const btnDisabled = !canInitiate && !tradeOffer

  let btnLabel = '🤝 发起交易邀约'
  let btnColor = canInitiate ? '#8e44ad' : '#555'
  if (iAmOfferer) { btnLabel = '📋 查看交易状态'; btnColor = '#e67e22' }
  if (iAmReceiver && tradeOffer?.status === 'pending') { btnLabel = '📩 有交易邀约！'; btnColor = '#e74c3c' }

  return (
    <>
      <div style={panelStyle}>
        <h3 style={panelTitle}>🤝 玩家交易</h3>
        <button
          onClick={() => setOpen(true)}
          disabled={btnDisabled}
          style={btnStyle(btnColor)}
        >
          {btnLabel}
        </button>
        {iAmReceiver && tradeOffer?.status === 'pending' && (
          <div style={{ fontSize: 11, color: '#e74c3c', textAlign: 'center', marginTop: 4 }}>
            ● 有玩家向你发起了交易
          </div>
        )}
        {!canInitiate && !tradeOffer && (
          <div style={hintText}>
            {isLocked ? '⚠️ 当前阶段无法交易'
              : !isMyTurn ? '⏳ 等待当前玩家发起交易'
              : !hasRolled ? '🎲 请先掷骰子'
              : ''}
          </div>
        )}
      </div>

      {open && (
        <ModalOverlay>
          <TradeModal
            roomId={roomId}
            myPlayerId={myPlayerId}
            myResources={myResources}
            players={players}
            tradeOffer={tradeOffer}
            iAmOfferer={iAmOfferer}
            iAmReceiver={iAmReceiver}
            canInitiate={canInitiate}
            onClose={() => setOpen(false)}
          />
        </ModalOverlay>
      )}
    </>
  )
}

// ============================================================
// 弹窗内容
// ============================================================
function TradeModal({
  roomId, myPlayerId, myResources, players, tradeOffer,
  iAmOfferer, iAmReceiver, canInitiate, onClose,
}: {
  roomId: string
  myPlayerId: string
  myResources: PlayerResources
  players: PlayerSummary[]
  tradeOffer: TradeOffer | null | undefined
  iAmOfferer: boolean
  iAmReceiver: boolean
  canInitiate: boolean
  onClose: () => void
}) {
  const [offer,   setOffer]   = useState<PlayerResources>(emptyRes())
  const [request, setRequest] = useState<PlayerResources>(emptyRes())
  const { pos, onMouseDown } = useDraggable()

  const offerTotal   = totalRes(offer)
  const requestTotal = totalRes(request)
  const canSendOffer = canInitiate && offerTotal > 0 && requestTotal > 0

  const handleSendOffer = () => {
    if (!canSendOffer) return
    socket.emit(ACTION_TRADE_OFFER, { roomId, offer, request })
    setOffer(emptyRes())
    setRequest(emptyRes())
  }

  const handleAccept = () => tradeOffer && socket.emit(ACTION_TRADE_ACCEPT, { roomId, tradeId: tradeOffer.tradeId })
  const handleReject = () => tradeOffer && socket.emit(ACTION_TRADE_REJECT, { roomId, tradeId: tradeOffer.tradeId })

  const handleConfirm = (targetPlayerId: string) =>
    tradeOffer && socket.emit(ACTION_TRADE_CONFIRM, { roomId, tradeId: tradeOffer.tradeId, targetPlayerId })

  const handleCancel = () => {
    tradeOffer && socket.emit(ACTION_TRADE_CANCEL, { roomId, tradeId: tradeOffer.tradeId })
    onClose()
  }

  const boxStyle: React.CSSProperties = {
    ...modalBox,
    position: 'fixed',
    cursor: 'grab',
    userSelect: 'none',
    ...(pos
      ? { top: pos.y, left: pos.x, transform: 'none' }
      : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    ),
  }

  return (
    // ✅ onMouseDown 绑定在整个弹窗容器，任意区域均可拖动
    <div
      style={boxStyle}
      data-modal-box
      onMouseDown={onMouseDown}
    >
      {/* 标题栏 */}
      <div style={modalHeader}>
        <span style={{ fontSize: 18, fontWeight: 'bold' }}>🤝 玩家交易</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, opacity: 0.4 }}>拖拽移动</span>
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            style={closeBtn}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── 情况1：没有进行中的交易，且可以发起 ── */}
      {!tradeOffer && canInitiate && (
        <>
          <p style={subTitle}>选择你要给出和想要的资源，发送邀约给其他玩家</p>

          <SectionLabel>📤 我给出</SectionLabel>
          <ResourceEditor
            value={offer}
            onChange={setOffer}
            myResources={myResources}
            cap="have"
          />

          <SectionLabel style={{ marginTop: 14 }}>📥 我想要</SectionLabel>
          <ResourceEditor
            value={request}
            onChange={setRequest}
            myResources={myResources}
            cap="none"
          />

          {(offerTotal > 0 || requestTotal > 0) && (
            <div style={summaryBox}>
              {offerTotal > 0 && <span>给出：{renderResShort(offer)}</span>}
              {offerTotal > 0 && requestTotal > 0 && <span style={{ opacity: 0.5 }}> ⇄ </span>}
              {requestTotal > 0 && <span>换取：{renderResShort(request)}</span>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button
              onClick={handleSendOffer}
              disabled={!canSendOffer}
              style={{ ...btnStyle(canSendOffer ? '#27ae60' : '#555'), flex: 1, marginBottom: 0 }}
            >
              📨 发送邀约
            </button>
            <button onClick={onClose} style={{ ...btnStyle('#888'), flex: 1, marginBottom: 0 }}>
              取消
            </button>
          </div>
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
          myResponse={tradeOffer.responses[myPlayerId]}
          onAccept={handleAccept}
          onReject={handleReject}
          onClose={onClose}
        />
      )}

      {/* ── 情况4：没有交易且不能发起 ── */}
      {!tradeOffer && !canInitiate && (
        <div style={{ ...hintText, padding: '24px 0' }}>
          ⏳ 只有当前回合玩家可以发起交易
        </div>
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

  const pendingCount = Object.values(tradeOffer.responses).filter(v => v === 'pending').length

  return (
    <div>
      <p style={subTitle}>你的交易邀约已发出，等待其他玩家响应</p>

      <TradeOfferSummary offer={tradeOffer.offer} request={tradeOffer.request} />

      <SectionLabel style={{ marginTop: 14 }}>玩家响应</SectionLabel>
      {Object.entries(tradeOffer.responses).map(([pid, status]) => {
        const p = players.find(pl => pl.playerId === pid)
        if (!p) return null
        const icon  = status === 'accepted' ? '✅' : status === 'rejected' ? '❌' : '⏳'
        const label = status === 'accepted' ? '已接受' : status === 'rejected' ? '已拒绝' : '等待中'
        return (
          <div key={pid} style={responseRow(p.color)}>
            <span style={{ fontSize: 13 }}>{icon} <strong>{p.name}</strong></span>
            <span style={{ fontSize: 12, opacity: 0.75 }}>{label}</span>
          </div>
        )
      })}

      {acceptedPlayers.length > 0 && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>选择成交对象</SectionLabel>
          {acceptedPlayers.map(p => (
            <button key={p.playerId} onClick={() => onConfirm(p.playerId)}
              style={{ ...btnStyle(p.color), marginBottom: 6 }}>
              🤝 与 {p.name} 成交
            </button>
          ))}
        </>
      )}

      {pendingCount > 0 && acceptedPlayers.length === 0 && (
        <div style={hintText}>⏳ 等待其他玩家响应…</div>
      )}

      <button onClick={onCancel} style={{ ...btnStyle('#c0392b'), marginTop: 10 }}>
        ✕ 取消交易
      </button>
    </div>
  )
}

// ============================================================
// 接收方视图
// ============================================================
function ReceiverView({
  tradeOffer, players, myResources, myResponse, onAccept, onReject, onClose,
}: {
  tradeOffer: TradeOffer
  players: PlayerSummary[]
  myResources: PlayerResources
  myResponse: 'pending' | 'accepted' | 'rejected' | undefined
  onAccept: () => void
  onReject: () => void
  onClose: () => void
}) {
  const offerer   = players.find(p => p.playerId === tradeOffer.fromPlayerId)
  const canAfford = ALL_RESOURCES.every(r => myResources[r] >= tradeOffer.request[r])

  if (tradeOffer.status === 'confirmed') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
        <div style={{ color: '#27ae60', fontWeight: 'bold', fontSize: 16 }}>交易已完成！</div>
        <button onClick={onClose} style={{ ...btnStyle('#27ae60'), marginTop: 16 }}>关闭</button>
      </div>
    )
  }
  if (tradeOffer.status === 'cancelled') {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>❌</div>
        <div style={{ opacity: 0.7 }}>交易已取消</div>
        <button onClick={onClose} style={{ ...btnStyle('#888'), marginTop: 16 }}>关闭</button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, marginBottom: 10, opacity: 0.85 }}>
        <strong style={{ color: offerer?.color ?? '#fff' }}>
          {offerer?.name ?? '某玩家'}
        </strong>{'  '}
        向你发起了交易邀约：
      </div>

      <TradeOfferSummary offer={tradeOffer.offer} request={tradeOffer.request} receiverView />

      {!canAfford && (
        <div style={{ color: '#e74c3c', fontSize: 12, margin: '10px 0' }}>
          ⚠️ 你的资源不足以接受此交易
        </div>
      )}

      {myResponse === 'pending' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            onClick={onAccept}
            disabled={!canAfford}
            style={{ ...btnStyle(canAfford ? '#27ae60' : '#555'), flex: 1, marginBottom: 0 }}
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
        <div style={{ ...hintText, color: '#27ae60', marginTop: 12 }}>
          ✅ 你已接受，等待对方确认…
        </div>
      )}

      {myResponse === 'rejected' && (
        <div style={{ ...hintText, marginTop: 12 }}>
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
  const giveRes = receiverView ? request : offer
  const getRes  = receiverView ? offer   : request

  return (
    <div style={offerBox}>
      <div style={{ marginBottom: 8 }}>
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
      <div style={{ textAlign: 'center', fontSize: 20, opacity: 0.5, margin: '6px 0' }}>⇄</div>
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
// 资源编辑器
// ============================================================
function ResourceEditor({
  value, onChange, myResources, cap,
}: {
  value: PlayerResources
  onChange: (r: PlayerResources) => void
  myResources: PlayerResources
  cap: 'have' | 'none'
}) {
  const adjust = (key: ResourceType, delta: number) => {
    const max  = cap === 'have' ? myResources[key] : 99
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
              <button onClick={() => adjust(r, -1)} disabled={value[r] === 0} style={smallBtn}>－</button>
              <span style={{
                minWidth: 20, textAlign: 'center',
                fontWeight: 'bold', fontSize: 14,
                color: value[r] > 0 ? '#fff' : 'rgba(255,255,255,0.3)',
              }}>
                {value[r]}
              </span>
              <button onClick={() => adjust(r, 1)} disabled={value[r] >= maxVal} style={smallBtn}>＋</button>
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
      background: colors[resource], color: '#fff',
      borderRadius: 6, padding: '2px 8px',
      fontSize: 12, fontWeight: 'bold',
    }}>
      {RESOURCE_EMOJI[resource]} ×{count}
    </span>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

function ModalOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        zIndex: 9000,
        pointerEvents: 'none',
      }}
    >
      <div style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'relative' }}>
        {children}
      </div>
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

const modalBox: React.CSSProperties = {
  background: '#1e2d3d',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 14,
  padding: 24,
  width: 420,
  maxWidth: '90vw',
  maxHeight: '85vh',
  overflowY: 'auto',
  color: '#fff',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  zIndex: 9001,
}

const modalHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 6,
  paddingBottom: 12,
  borderBottom: '1px solid rgba(255,255,255,0.15)',
}

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.6)',
  fontSize: 18,
  cursor: 'pointer',
  padding: '0 4px',
  lineHeight: 1,
}

const subTitle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.6,
  margin: '0 0 14px',
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
    padding: '9px 0', background: bg, color: '#fff',
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