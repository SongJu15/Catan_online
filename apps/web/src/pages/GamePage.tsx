import { useEffect, useState, useRef } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import socket from '../socket'
import {
  STATE_SYNC, GAME_ERROR,
  ACTION_PLACE_SETTLEMENT, ACTION_PLACE_ROAD,
  ACTION_ROLL_DICE, ACTION_END_TURN,
  ACTION_BUILD_SETTLEMENT, ACTION_BUILD_CITY, ACTION_BUILD_ROAD,
  ACTION_BUY_DEV_CARD, ACTION_PLAY_DEV_CARD,
  ACTION_BANK_TRADE, ACTION_MOVE_ROBBER, ACTION_DISCARD,
} from '@catan/shared'
import type {
  StateSyncPayload, Hex, Vertex, Edge, Port,
  PlayerResources, PlayerSummary, DevCard,
  ResourceType, DevCardType,
} from '@catan/shared'
import TradePanel from '../components/TradePanel'
// 在文件顶部，原有 import 之后添加：
import DevCardDeck from '../components/DevCardDeck'
import { calcBestTradeRate } from '@catan/shared'


const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: '木材', brick: '砖块', ore: '矿石', wheat: '小麦', sheep: '羊毛',
}
const RESOURCE_EMOJI: Record<ResourceType, string> = {
  wood: '🌲', brick: '🧱', ore: '⛰️', wheat: '🌾', sheep: '🐑',
}
const RESOURCE_COLOR: Record<ResourceType, string> = {
  wood: '#2d6a2d', brick: '#c0522a', ore: '#7f8c8d', wheat: '#d4ac0d', sheep: '#58b85c',
}
const ALL_RESOURCES: ResourceType[] = ['wood', 'brick', 'ore', 'wheat', 'sheep']

const DEV_CARD_LABELS: Record<DevCardType, string> = {
  knight: '⚔️ 骑士',
  victory_point: '🏆 胜利点',
  road_building: '🛣️ 道路建设',
  year_of_plenty: '🌟 丰收年',
  monopoly: '💰 垄断',
}
const DEV_CARD_DESC: Record<DevCardType, string> = {
  knight: '移动强盗并可抢劫一名玩家',
  victory_point: '立即获得1个胜利点（自动生效）',
  road_building: '免费建造2条道路',
  year_of_plenty: '从银行获取任意2种资源',
  monopoly: '宣布一种资源，所有玩家将该资源全给你',
}

type ModalType =
  | 'rob_player'
  | 'bank_trade'
  | 'port_trade'
  | 'year_of_plenty'
  | 'monopoly'
  | 'road_building_hint'
  | 'draw_card'
  | null

function useDraggable() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })

  const onMouseDown = (e: React.MouseEvent) => {
    const tag = (e.target as HTMLElement).tagName
    if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
    dragging.current = true
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect()
    offset.current = { x: e.clientX - box.left, y: e.clientY - box.top }
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y })
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


export default function GamePage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [syncData, setSyncData] = useState<StateSyncPayload | null>(
    (location.state as StateSyncPayload) ?? null
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalType>(null)

  // 丢牌选择
  const [discardSelection, setDiscardSelection] = useState<PlayerResources>(
    { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }
  )
  // 银行交易
  const [tradeGive, setTradeGive] = useState<ResourceType>('wood')
  const [tradeReceive, setTradeReceive] = useState<ResourceType>('brick')
  // 港口交易
  const [portTradeGive, setPortTradeGive] = useState<ResourceType>('wood')
  const [portTradeReceive, setPortTradeReceive] = useState<ResourceType>('brick')
  const [portTradeRate, setPortTradeRate] = useState<number>(3)
  // 丰收年 / 垄断
  const [yopRes1, setYopRes1] = useState<ResourceType>('wood')
  const [yopRes2, setYopRes2] = useState<ResourceType>('wood')
  const [monopolyRes, setMonopolyRes] = useState<ResourceType>('wood')
  // 强盗
  const [selectedRobberHex, setSelectedRobberHex] = useState<string | null>(null)
  const [robTargets, setRobTargets] = useState<PlayerSummary[]>([])

  // ✅ 新增：抽卡相关状态
  const [drawnCard, setDrawnCard] = useState<DevCardType | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const isDrawingRef = useRef(false)   // ✅ 新增这一行
  const prevDevCardCountRef = useRef<number>(0)

  // 发展卡弹窗
  const [showDevCardPanel, setShowDevCardPanel] = useState(false)
  const [statusDrawerOpen, setStatusDrawerOpen] = useState(true)
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(true)

  const playerCardRef = useRef<HTMLDivElement>(null)
  const [playerCardWidth, setPlayerCardWidth] = useState(160)

  useEffect(() => {
    if (playerCardRef.current) {
      setPlayerCardWidth(playerCardRef.current.offsetWidth + 12)
    }
  }, [syncData])

  useEffect(() => {
    if (!syncData) { navigate('/'); return }
    socket.on(STATE_SYNC, (payload: StateSyncPayload) => {
      setSyncData(payload)

      if (isDrawingRef.current && payload.you.devCards.length > prevDevCardCountRef.current) {
        const newCard = payload.you.devCards[payload.you.devCards.length - 1]
        setDrawnCard(newCard.type)
        setModal('draw_card')          // ✅ 确认收到新卡后再开弹窗
        isDrawingRef.current = false
        setIsDrawing(false)
        prevDevCardCountRef.current = payload.you.devCards.length
      } else {
        prevDevCardCountRef.current = payload.you.devCards.length
      }
    })



    socket.on(GAME_ERROR, (payload: { message: string }) => {
      setErrorMsg(payload.message)
      setTimeout(() => setErrorMsg(null), 3000)

      // ✅ 用 ref 判断，避免闭包陷阱
      if (isDrawingRef.current) {
        setModal(null)
        setDrawnCard(null)
        isDrawingRef.current = false
        setIsDrawing(false)
        prevDevCardCountRef.current = 0  // 重置，下次 STATE_SYNC 会更新
      }
    })

    return () => {
      socket.off(STATE_SYNC)
      socket.off(GAME_ERROR)
    }
  }, [])

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
    @keyframes eventPulse {
      0%, 100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
      50% { opacity: 0.92; transform: translate(-50%, 0) scale(1.025); }
    }
  `
    document.head.appendChild(style)
    return () => { document.head.removeChild(style) }
  }, [])

  if (!syncData) return null

  const { you, state } = syncData
  const {
    board, phase, currentPlayerId, players, diceResult,
    hasRolled, winner, robberInfo, robberHexId,
    roadBuildingInfo, turnNumber,
  } = state

  const isMyTurn = currentPlayerId === you.playerId
  const myInfo = players.find(p => p.playerId === you.playerId)
  const myColor = myInfo?.color ?? '#888'


  // ✅ 全部改为派生值，不再用 useEffect 同步
  const iMustDiscard =
    !!robberInfo &&
    robberInfo.mustDiscard.includes(you.playerId) &&
    !robberInfo.discarded.includes(you.playerId)

  const iMustMoveRobber = isMyTurn && !!robberInfo?.waitingForMove

  // ✅ isMovingRobber 直接派生，不再是 state
  const isMovingRobber = iMustMoveRobber

  // ✅ showDiscardModal 直接派生，不再通过 useEffect 设置 modal
  const showDiscardModal = iMustDiscard

  const isRoadBuilding = isMyTurn && !!roadBuildingInfo && roadBuildingInfo.roadsLeft > 0
  const isLocked = !!robberInfo || iMustDiscard

  // ============================================================
  // 港口工具函数
  // ============================================================

  // 获取我拥有的所有港口
  const getMyPorts = (): Port[] => {
    if (!board?.ports) return []
    return board.ports.filter(port =>
      port.vertexIds.some(vId => {
        const v = board.vertices.find(vv => vv.id === vId)
        return v?.ownerPlayerId === you.playerId
      })
    )
  }

  // ✅ 替换 getBestTradeRate，内部调用 shared 的统一实现
  const getBestTradeRate = (resource: ResourceType): number => {
    if (!syncData.state.board) return 4  // ✅ lobby阶段board为null，直接返回默认4:1
    return calcBestTradeRate(
      you.playerId,
      resource,
      syncData.state.board.ports,
      syncData.state.board.vertices
    )
  }

  // ============================================================
  // 事件处理
  // ============================================================

  const handleVertexClick = (vertexId: string, vertex: Vertex) => {
    if (!isMyTurn || isLocked) return
    if (phase === 'setup_settlement') {
      socket.emit(ACTION_PLACE_SETTLEMENT, { roomId: id, vertexId })
    } else if (phase === 'playing' && hasRolled) {
      if (!vertex.ownerPlayerId) {
        socket.emit(ACTION_BUILD_SETTLEMENT, { roomId: id, vertexId })
      } else if (vertex.ownerPlayerId === you.playerId && vertex.building === 'settlement') {
        socket.emit(ACTION_BUILD_CITY, { roomId: id, vertexId })
      }
    }
  }

  const handleEdgeClick = (edgeId: string) => {
    if (!isMyTurn) return
    if (phase === 'setup_road') {
      socket.emit(ACTION_PLACE_ROAD, { roomId: id, edgeId })
    } else if (phase === 'playing' && (hasRolled || isRoadBuilding) && !isLocked) {
      socket.emit(ACTION_BUILD_ROAD, { roomId: id, edgeId })
    }
  }

  const handleRollDice = () => {
    if (!isMyTurn || hasRolled || isLocked) return
    socket.emit(ACTION_ROLL_DICE, { roomId: id })
  }

  const handleEndTurn = () => {
    if (!isMyTurn || !hasRolled || isLocked || roadBuildingInfo) return
    socket.emit(ACTION_END_TURN, { roomId: id })
  }

  const handleBuyDevCard = () => {
    if (!isMyTurn || !hasRolled || isLocked) return
    prevDevCardCountRef.current = you.devCards.length
    isDrawingRef.current = true
    setIsDrawing(true)
    setDrawnCard(null)
    // ✅ 删除 setModal('draw_card')，等服务端确认后再开弹窗
    socket.emit(ACTION_BUY_DEV_CARD, { roomId: id })
  }


  // ✅ 新增：关闭抽卡界面
  const handleCloseDrawCard = () => {
    setModal(null)
    setDrawnCard(null)
    isDrawingRef.current = false   // ✅ 新增
    setIsDrawing(false)
  }

  const handlePlayDevCard = (cardType: DevCardType) => {
    if (!isMyTurn || isLocked) return
    if (cardType === 'victory_point') return
    if (cardType === 'year_of_plenty') {
      setModal('year_of_plenty')
      return
    }
    if (cardType === 'monopoly') {
      setModal('monopoly')
      return
    }
    if (cardType === 'road_building') {
      socket.emit(ACTION_PLAY_DEV_CARD, { roomId: id, cardType: 'road_building' })
      setModal('road_building_hint')
      setTimeout(() => setModal(null), 2000)
      return
    }
    if (cardType === 'knight') {
      socket.emit(ACTION_PLAY_DEV_CARD, { roomId: id, cardType: 'knight' })
      return
    }
  }

  const handleDiscardConfirm = () => {
    const total = Object.values(discardSelection).reduce((a, b) => a + b, 0)
    const myTotal = Object.values(you.resources).reduce((a, b) => a + b, 0)
    const required = Math.floor(myTotal / 2)
    if (total !== required) {
      setErrorMsg(`必须丢弃 ${required} 张资源，当前选了 ${total} 张`)
      setTimeout(() => setErrorMsg(null), 3000)
      return
    }
    socket.emit(ACTION_DISCARD, { roomId: id, resources: discardSelection })
    // ✅ 不需要手动 setModal(null)，丢牌后服务端会更新 robberInfo，showDiscardModal 自动变 false
  }

  const handleRobberHexSelect = (hexId: string) => {
    if (hexId === robberHexId) return
    setSelectedRobberHex(hexId)
    if (!board) return
    const hex = board.hexes.find(h => h.id === hexId)
    if (!hex) return
    const occupants = new Map<string, PlayerSummary>()
    for (const vId of hex.vertexIds) {
      const v = board.vertices.find(vv => vv.id === vId)
      if (v?.ownerPlayerId && v.ownerPlayerId !== you.playerId) {
        const ps = players.find(p => p.playerId === v.ownerPlayerId)
        if (ps) occupants.set(ps.playerId, ps)
      }
    }
    const targets = [...occupants.values()]
    if (targets.length > 0) {
      setRobTargets(targets)
      setModal('rob_player')
    } else {
      socket.emit(ACTION_MOVE_ROBBER, { roomId: id, hexId })
      setSelectedRobberHex(null)
    }
  }

  const handleRobPlayerConfirm = (robPlayerId: string | null) => {
    if (!selectedRobberHex) return
    socket.emit(ACTION_MOVE_ROBBER, {
      roomId: id,
      hexId: selectedRobberHex,
      robPlayerId: robPlayerId ?? undefined,
    })
    setSelectedRobberHex(null)
    setRobTargets([])
    setModal(null)
  }

  const handleBankTradeConfirm = () => {
    socket.emit(ACTION_BANK_TRADE, { roomId: id, give: tradeGive, receive: tradeReceive })
    setModal(null)
  }

  // ✅ 新增：港口交易
  const handleOpenPortTrade = () => {
    const myPorts = getMyPorts()
    if (myPorts.length === 0) {
      // 没有港口，退回银行交易
      setModal('bank_trade')
      return
    }
    // 默认选第一个有资源的最优交易
    const best = ALL_RESOURCES.reduce<{ res: ResourceType; rate: number }>(
      (acc, r) => {
        const rate = getBestTradeRate(r)
        return rate < acc.rate ? { res: r, rate } : acc
      },
      { res: 'wood', rate: 4 }
    )
    setPortTradeGive(best.res)
    setPortTradeRate(getBestTradeRate(best.res))
    setModal('port_trade')
  }

  const handlePortTradeGiveChange = (r: ResourceType) => {
    setPortTradeGive(r)
    setPortTradeRate(getBestTradeRate(r))
  }

  const handlePortTradeConfirm = () => {
    socket.emit(ACTION_BANK_TRADE, {
      roomId: id,
      give: portTradeGive,
      receive: portTradeReceive,
      rate: portTradeRate,
    })
    setModal(null)
  }

  const handleYopConfirm = () => {
    socket.emit(ACTION_PLAY_DEV_CARD, {
      roomId: id,
      cardType: 'year_of_plenty',
      yearOfPlentyResources: [yopRes1, yopRes2],
    })
    setModal(null)
  }

  const handleMonopolyConfirm = () => {
    socket.emit(ACTION_PLAY_DEV_CARD, {
      roomId: id,
      cardType: 'monopoly',
      monopolyResource: monopolyRes,
    })
    setModal(null)
  }

  const canPlayCard = (card: DevCard): boolean => {
    if (!isMyTurn) return false
    if (card.type === 'victory_point') return false
    if ((turnNumber ?? 0) <= card.turnBought) return false
    if (isLocked) return false
    return true
  }

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      fontFamily: 'sans-serif',
      // 👇 这里是修改的部分 👇
      backgroundImage: "url('/海洋.png')",
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      // 👆 修改结束 👆
      color: '#fff',
      padding: 10, gap: 8, boxSizing: 'border-box',
    }}>



      {/* 错误提示 */}
      {errorMsg && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#e74c3c', color: '#fff', padding: '10px 24px',
          borderRadius: 8, zIndex: 9999, fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>⚠️ {errorMsg}</div>
      )}

      {/* 游戏结束 */}
      {phase === 'ended' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998,
        }}>
          <div style={{ background: '#fff', color: '#333', padding: 48, borderRadius: 20, textAlign: 'center', minWidth: 340 }}>
            <div style={{ fontSize: 64 }}>🏆</div>
            <h2 style={{ fontSize: 28, margin: '12px 0' }}>
              {players.find(p => p.playerId === winner)?.name ?? '某人'} 获胜！
            </h2>
            <div style={{ marginBottom: 20 }}>
              {[...players].sort((a, b) => b.victoryPoints - a.victoryPoints).map((p, i) => (
                <div key={p.playerId} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 16px', margin: '4px 0', borderRadius: 8,
                  background: p.playerId === winner ? '#fff9e6' : '#f5f5f5',
                  border: p.playerId === winner ? '2px solid #f39c12' : '2px solid transparent',
                }}>
                  <span style={{ fontWeight: 'bold' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {p.name}
                  </span>
                  <span style={{ color: '#e67e22', fontWeight: 'bold' }}>{p.victoryPoints} 分</span>
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/')} style={btnStyle('#3498db')}>返回首页</button>
          </div>
        </div>
      )}

      {/* 丢牌弹窗 */}
      {showDiscardModal && (
        <ModalOverlay>
          <DiscardModal
            resources={you.resources}
            selection={discardSelection}
            onChange={setDiscardSelection}
            onConfirm={handleDiscardConfirm}
          />
        </ModalOverlay>
      )}

      {/* 其他弹窗 */}
      {!showDiscardModal && modal && (
        <ModalOverlay>
          {modal === 'rob_player' && (
            <div style={modalBox}>
              <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                选择抢劫目标
              </h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>该地块上有其他玩家，选择抢劫对象（或跳过）</p>
              {robTargets.map(t => (
                <button key={t.playerId} onClick={() => handleRobPlayerConfirm(t.playerId)}
                  style={{ ...btnStyle(t.color), marginBottom: 8 }}>
                  抢劫 {t.name}（{t.totalCards} 张牌）
                </button>
              ))}
              <button onClick={() => handleRobPlayerConfirm(null)} style={btnStyle('#888')}>不抢劫，直接放置</button>
            </div>
          )}
          {modal === 'bank_trade' && (
            <BankTradeModal resources={you.resources} give={tradeGive} receive={tradeReceive}
              onGiveChange={setTradeGive} onReceiveChange={setTradeReceive}
              onConfirm={handleBankTradeConfirm} onCancel={() => setModal(null)} />
          )}
          {modal === 'port_trade' && (
            <PortTradeModal resources={you.resources} give={portTradeGive} receive={portTradeReceive}
              rate={portTradeRate} onGiveChange={handlePortTradeGiveChange}
              onReceiveChange={setPortTradeReceive} onConfirm={handlePortTradeConfirm}
              onCancel={() => setModal(null)} getBestRate={getBestTradeRate} />
          )}
          {modal === 'year_of_plenty' && (
            <div style={modalBox}>
              <h3 style={{ margin: '0 0 12px' }}>🌟 丰收年 — 选择2种资源</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>第1种资源</label>
                <ResourceSelect value={yopRes1} onChange={setYopRes1} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, opacity: 0.8 }}>第2种资源</label>
                <ResourceSelect value={yopRes2} onChange={setYopRes2} />
              </div>
              <button onClick={handleYopConfirm} style={btnStyle('#27ae60')}>确认</button>
              <button onClick={() => setModal(null)} style={{ ...btnStyle('#888'), marginTop: 8 }}>取消</button>
            </div>
          )}
          {modal === 'monopoly' && (
            <div style={modalBox}>
              <h3 style={{ margin: '0 0 12px' }}>💰 垄断 — 选择资源种类</h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>所有其他玩家将把该资源全部给你</p>
              <ResourceSelect value={monopolyRes} onChange={setMonopolyRes} />
              <button onClick={handleMonopolyConfirm} style={{ ...btnStyle('#e67e22'), marginTop: 12 }}>确认</button>
              <button onClick={() => setModal(null)} style={{ ...btnStyle('#888'), marginTop: 8 }}>取消</button>
            </div>
          )}
          {modal === 'road_building_hint' && (
            <div style={{ ...modalBox, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🛣️</div>
              <p>道路建设卡已激活！<br />可以免费建造 2 条道路</p>
            </div>
          )}
        </ModalOverlay>
      )}

      {modal === 'draw_card' && (
        <DevCardDeck
          cardCount={state.devCardDeckCount ?? 25}
          revealedCard={drawnCard}
          isWaiting={isDrawing}
          onClose={handleCloseDrawCard}
        />
      )}

      {/* ══════════════════════════════════════
        行2：主体区（占满剩余高度）
        左：玩家列表 | 中：地图+底部自身信息 | 右：游戏规则+操作+玩家交易
    ══════════════════════════════════════ */}
      <div style={{ display: 'flex', gap: 8, flex: '1 1 0', minHeight: 0 }}>

        {/* ── 玩家头像覆盖层（固定定位，覆盖在整个页面上） ── */}
        <>
          {/* ── 特殊事件横幅（屏幕中间偏上） ── */}
          {(iMustDiscard || isMovingRobber || isRoadBuilding) && (
            <div style={{
              position: 'fixed',
              top: '28%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9997,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              pointerEvents: 'none',
            }}>
              {iMustDiscard && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 32px',
                  background: 'linear-gradient(135deg, #c0392b, #e74c3c)',
                  borderRadius: 14,
                  boxShadow: '0 6px 28px rgba(231,76,60,0.65), 0 0 0 1px rgba(255,255,255,0.15)',
                  fontSize: 15, fontWeight: 'bold', color: '#fff',
                  whiteSpace: 'nowrap',
                  animation: 'eventPulse 1.5s ease-in-out infinite',
                }}>
                  <span style={{ fontSize: 24 }}>⚠️</span>
                  <span>你的手牌超过 7 张，必须丢弃资源！</span>
                </div>
              )}
              {isMovingRobber && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 32px',
                  background: 'linear-gradient(135deg, #d35400, #e67e22)',
                  borderRadius: 14,
                  boxShadow: '0 6px 28px rgba(230,126,34,0.65), 0 0 0 1px rgba(255,255,255,0.15)',
                  fontSize: 15, fontWeight: 'bold', color: '#fff',
                  whiteSpace: 'nowrap',
                }}>
                  <span>点击地图上的地块放置强盗（不能放在原位置）</span>
                </div>
              )}
              {isRoadBuilding && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 32px',
                  background: 'linear-gradient(135deg, #6c3483, #9b59b6)',
                  borderRadius: 14,
                  boxShadow: '0 6px 28px rgba(155,89,182,0.65), 0 0 0 1px rgba(255,255,255,0.15)',
                  fontSize: 15, fontWeight: 'bold', color: '#fff',
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontSize: 24 }}>🛣️</span>
                  <span>道路建设 — 免费建造道路（剩余 <strong>{roadBuildingInfo!.roadsLeft}</strong> 条）</span>
                </div>
              )}
            </div>
          )}

          {/* ── 左侧状态抽屉 ── */}
          <div style={{
            position: 'fixed',
            left: statusDrawerOpen ? 0 : -160,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 150,
            transition: 'left 0.35s cubic-bezier(0.4,0,0.2,1)',
            display: 'flex',
            alignItems: 'center',
          }}>
            {/* 面板主体 */}
            <div style={{
              width: 160,
              background: 'linear-gradient(160deg, rgba(15,30,55,0.96), rgba(8,18,35,0.96))',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(100,160,255,0.18)',
              borderRight: 'none',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderTopRightRadius: 12,
              borderBottomRightRadius: 12,
              padding: '16px 14px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              boxShadow: '6px 0 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)',
            }}>
              {/* 标题 */}
              <div style={{
                fontSize: 15, fontWeight: 'bold',
                color: 'rgba(160,210,255,0.85)',
                letterSpacing: 1,
                marginBottom: 6,
                paddingLeft: 2,
              }}>
                ◈ 游戏状态
              </div>

              {/* 阶段 */}
              <StatusRow icon="🎮" label={getPhaseText(phase)} color="#e8f4ff" />

              {/* 骰子结果 */}
              {diceResult && (
                <StatusRow
                  icon="🎲"
                  label={`${diceResult[0]} + ${diceResult[1]} = ${diceResult[0] + diceResult[1]}`}
                  color="#f5c842"
                />
              )}

              {/* 回合数 */}
              {turnNumber != null && (
                <StatusRow icon="🔄" label={`第 ${turnNumber} 回合`} color="rgba(180,210,255,0.75)" />
              )}

              {/* 当前玩家 */}
              {(() => {
                const cur = players.find(p => p.playerId === currentPlayerId)
                return cur ? (
                  <StatusRow
                    icon="👤"
                    label={isMyTurn ? '✦ 你的回合' : `${cur.name} 的回合`}
                    color={isMyTurn ? '#4ade80' : cur.color}
                    bold={isMyTurn}
                  />
                ) : null
              })()}
            </div>

            {/* 梯形拉手 */}
            <div
              onClick={() => setStatusDrawerOpen(v => !v)}
              style={{ width: 20, height: 72, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
            >
              <svg width="20" height="72" viewBox="0 0 20 72" style={{ display: 'block' }}>
                <polygon
                  points="0,0 20,10 20,62 0,72"
                  fill="rgba(15,30,55,0.96)"
                  stroke="rgba(100,160,255,0.2)"
                  strokeWidth="1"
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'rgba(150,200,255,0.8)',
                userSelect: 'none',
              }}>
                {statusDrawerOpen ? '◀' : '▶'}
              </div>
            </div>
          </div>




          {/* 其他玩家：左上、上中、右上 */}
          {players
            .filter(p => p.playerId !== you.playerId)
            .map((p, idx) => {
              const positions: React.CSSProperties[] = [
                { top: 12, left: 12 },           // 左上
                { top: 12, left: '50%', transform: 'translateX(-50%)' }, // 上中
                { top: 12, right: 12 },           // 右上
              ]
              const aligns: ('left' | 'center' | 'right')[] = ['left', 'center', 'right']
              return (
                <PlayerCard
                  key={p.playerId}
                  player={p}
                  isCurrentPlayer={p.playerId === currentPlayerId}
                  isMe={false}
                  align={aligns[idx]}
                  style={{ position: 'fixed', zIndex: 100, ...positions[idx] }}
                />
              )
            })
          }

          {/* 本机玩家：左下角 - 下移与资源卡同行 */}
          {myInfo && (
            <div
              ref={playerCardRef}
              style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 100 }}
            >
              <PlayerCard
                player={myInfo}
                isCurrentPlayer={myInfo.playerId === currentPlayerId}
                isMe={true}
              />
            </div>
          )}


        </>

        {/* ── 中列：地图（上）+ 自身信息（下） ── */}
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>

          {/* 地图 */}
          <div style={{
            flex: '1 1 0',
            background: 'transparent',   // ← 去掉深色背景，透出海洋蓝
            borderRadius: 0,              // ← 去掉圆角边框感
            border: 'none',               // ← 无边框
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>

            {board && (
              <svg width="800" height="700" viewBox="0 0 800 700"
                style={{
                  display: 'block',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  transform: 'scale(1.2)', /* 放大 1.15 倍 */
                  transformOrigin: 'center center'
                }}>

                <rect width="800" height="700" fill="rgba(10, 50, 80, 0)" rx="16" />
                {board.ports?.map((port: Port) => (
                  <PortTile key={port.id} port={port} board={board} myPlayerId={you.playerId} />
                ))}
                {board.hexes.map((hex: Hex) => (
                  <HexagonTile key={hex.id} hex={hex}
                    isRobberTarget={isMovingRobber && hex.id !== robberHexId}
                    onClick={() => isMovingRobber && handleRobberHexSelect(hex.id)}
                    selected={selectedRobberHex === hex.id} />
                ))}
                {board.edges.map((edge: Edge) => (
                  <EdgeLine key={edge.id} edge={edge}
                    onClick={() => handleEdgeClick(edge.id)}
                    isClickable={
                      isMyTurn && !isLocked && (
                        phase === 'setup_road' ||
                        (phase === 'playing' && (!!hasRolled || isRoadBuilding) && !edge.ownerPlayerId)
                      )
                    }
                    players={players} myColor={myColor} />
                ))}
                {board.vertices.map((vertex: Vertex) => (
                  <VertexPoint key={vertex.id} vertex={vertex}
                    onClick={() => handleVertexClick(vertex.id, vertex)}
                    isClickable={
                      isMyTurn && !isLocked && (
                        phase === 'setup_settlement' ||
                        (phase === 'playing' && !!hasRolled)
                      )
                    }
                    players={players} myPlayerId={you.playerId} myColor={myColor} />
                ))}
              </svg>
            )}
          </div>

          {/* 底部：资源 + 港口 + 发展卡 */}
          <div style={{
            position: 'fixed',
            bottom: 12,
            left: 12 + playerCardWidth,  // 👈 动态计算
            zIndex: 100,
            display: 'flex', gap: 6, alignItems: 'flex-end',
          }}>


            {/* 我的资源 */}
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_RESOURCES.map(key => {
                const count = you.resources[key] ?? 0
                return (
                  <div key={key} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 3,
                  }}>
                    {/* 上：圆圈 */}
                    <div style={{
                      width: 54, height: 54, borderRadius: '50%',
                      background: count > 0
                        ? `radial-gradient(circle at 35% 35%, ${RESOURCE_COLOR[key]}ff, ${RESOURCE_COLOR[key]}99)`
                        : 'rgba(255,255,255,0.08)',
                      border: count > 0
                        ? `2.5px solid ${RESOURCE_COLOR[key]}`
                        : '2.5px solid rgba(255,255,255,0.15)',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      boxShadow: count > 0 ? `0 0 10px ${RESOURCE_COLOR[key]}66` : 'none',
                      transition: 'all 0.2s',
                    }}>
                      <span style={{ fontSize: 22, lineHeight: 1 }}>{RESOURCE_EMOJI[key]}</span>
                      <span style={{
                        fontSize: 10, color: 'rgba(255,255,255,0.85)',
                        fontWeight: 'bold', marginTop: 1,
                      }}>{RESOURCE_LABELS[key]}</span>
                    </div>

                    {/* 下：六边形数字 */}
                    <HexBadge count={count} color={RESOURCE_COLOR[key]} />
                  </div>
                )
              })}
            </div>



            {/* 分隔线 */}
            <div style={{
              width: 1, alignSelf: 'stretch',
              background: 'rgba(255,255,255,0.12)',
              margin: '0 4px',
            }} />

            {/* 我的港口（有才显示） */}
            {board?.ports && getMyPorts().length > 0 && (
              <>
                <div style={{ flex: '0 0 auto' }}>
                  <div style={bottomSectionTitle}>⚓ 港口</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {getMyPorts().map(port => {
                      const isSpecific = port.type !== 'any'
                      const color = isSpecific ? RESOURCE_COLOR[port.type as ResourceType] : '#2980b9'
                      return (
                        <div key={port.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 8,
                          background: color + '44',
                          border: `1.5px solid ${color}88`,
                          fontSize: 12,
                        }}>
                          <span style={{ fontSize: 16 }}>
                            {isSpecific ? RESOURCE_EMOJI[port.type as ResourceType] : '🌊'}
                          </span>
                          <span style={{ color: '#fff', fontWeight: 'bold' }}>
                            {isSpecific ? `${RESOURCE_LABELS[port.type as ResourceType]} 2:1` : '通用 3:1'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 分隔线 */}
                <div style={{
                  width: 1, alignSelf: 'stretch',
                  background: 'rgba(255,255,255,0.12)',
                  margin: '0 4px',
                }} />
              </>
            )}

            {/* 我的发展卡 */}
            <div style={{ flex: '0 0 auto', position: 'relative' }}>
              {/* 触发按钮：上圆圈 + 下六边形 */}
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
              }}>
                {/* 圆圈 - 点击弹出 */}
                <div
                  onClick={() => setShowDevCardPanel(v => !v)}
                  style={{
                    width: 54, height: 54, borderRadius: '50%',
                    background: showDevCardPanel
                      ? 'radial-gradient(circle at 35% 35%, #c39bffff, #9b59b699)'
                      : 'rgba(255,255,255,0.08)',
                    border: showDevCardPanel
                      ? '2.5px solid #b48cff'
                      : '2.5px solid rgba(255,255,255,0.15)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', userSelect: 'none',
                    boxShadow: showDevCardPanel ? '0 0 10px #b48cff66' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>📜</span>
                  <span style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.85)',
                    fontWeight: 'bold', marginTop: 1,
                  }}>发展卡</span>
                </div>

                {/* 六边形数字 */}
                <HexBadge count={you.devCards.length} color="#9b59b6" />
              </div>

              {/* 弹出面板 */}
              {showDevCardPanel && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 10px)',
                  left: 0,
                  zIndex: 200,
                  background: 'rgba(10, 25, 45, 0.97)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: 16,
                  padding: 16,
                  minWidth: 320,
                  boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
                }}>
                  {/* 标题栏 */}
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 14,
                  }}>
                    <div style={{
                      fontSize: 15, fontWeight: 'bold', color: '#fff',
                    }}>
                      📜 我的发展卡
                    </div>
                    <div
                      onClick={() => setShowDevCardPanel(false)}
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', fontSize: 14, color: 'rgba(255,255,255,0.7)',
                        transition: 'all 0.2s',
                      }}
                    >✕</div>
                  </div>

                  {/* 卡片列表 */}
                  {you.devCards.length === 0 ? (
                    <div style={{
                      textAlign: 'center', padding: '20px 0',
                      color: 'rgba(255,255,255,0.3)', fontSize: 13, fontStyle: 'italic',
                    }}>
                      暂无发展卡
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {you.devCards.map((card, i) => {
                        const usable = canPlayCard(card)
                        const color = DEV_CARD_COLOR_MAP[card.type]
                        const isNewCard = (turnNumber ?? 0) <= card.turnBought
                        return (
                          <div
                            key={i}
                            onClick={() => {
                              if (usable) {
                                handlePlayDevCard(card.type)
                                setShowDevCardPanel(false)
                              }
                            }}
                            title={DEV_CARD_DESC[card.type]}
                            style={{
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'space-between',
                              width: 72, minHeight: 96,
                              borderRadius: 12,
                              background: usable
                                ? `linear-gradient(160deg, ${color}cc, ${color}66)`
                                : 'rgba(255,255,255,0.05)',
                              border: usable
                                ? `2px solid ${color}`
                                : '2px solid rgba(255,255,255,0.1)',
                              cursor: usable ? 'pointer' : 'default',
                              opacity: usable ? 1 : 0.45,
                              padding: '10px 6px 8px',
                              boxShadow: usable ? `0 4px 16px ${color}55` : 'none',
                              transition: 'all 0.2s',
                              position: 'relative', overflow: 'hidden',
                            }}
                          >
                            {/* 光效 */}
                            {usable && (
                              <div style={{
                                position: 'absolute', inset: 0,
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)',
                                pointerEvents: 'none',
                              }} />
                            )}
                            <div style={{ fontSize: 26 }}>
                              {DEV_CARD_LABELS[card.type].split(' ')[0]}
                            </div>
                            <div style={{
                              fontSize: 11, fontWeight: 'bold', color: '#fff',
                              textAlign: 'center', lineHeight: 1.3, marginTop: 6,
                              textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                            }}>
                              {DEV_CARD_LABELS[card.type].split(' ').slice(1).join(' ')}
                            </div>
                            <div style={{
                              fontSize: 10, marginTop: 6,
                              color: usable ? '#2ecc71' : 'rgba(255,255,255,0.35)',
                              fontWeight: usable ? 'bold' : 'normal',
                              textAlign: 'center',
                            }}>
                              {card.type === 'victory_point'
                                ? '✦ 自动生效'
                                : isNewCard
                                  ? '⏳ 下回合'
                                  : usable ? '▶ 点击使用' : '✗ 不可用'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 提示文字 */}
                  {you.devCards.some(c => canPlayCard(c)) && (
                    <div style={{
                      marginTop: 12, fontSize: 11,
                      color: 'rgba(255,255,255,0.4)', textAlign: 'center',
                    }}>
                      每回合只能使用一张发展卡
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
          {/* 右下角操作圆圈 */}
          {phase === 'playing' && (
            <ActionBar
              isMyTurn={isMyTurn}
              hasRolled={!!hasRolled}
              isLocked={isLocked}
              roadBuildingInfo={roadBuildingInfo}
              onRoll={handleRollDice}
              onEndTurn={handleEndTurn}
              onPortTrade={handleOpenPortTrade}
              onBuyDevCard={handleBuyDevCard}
              tradeProps={{
                roomId: id!,
                myPlayerId: you.playerId,
                myResources: you.resources,
                players,
                tradeOffer: state.tradeOffer,
                isMyTurn,
                hasRolled: !!hasRolled,
                isLocked,
              }}
            />
          )}

        </div>

        {/* ── 右侧规则抽屉（fixed 定位，和左侧状态抽屉对称） ── */}
        <div style={{
          position: 'fixed',
          right: rulesDrawerOpen ? 0 : -220,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 150,
          transition: 'right 0.35s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          alignItems: 'center',
        }}>
          {/* 梯形拉手（在左侧） */}
          <div
            onClick={() => setRulesDrawerOpen(v => !v)}
            style={{ width: 20, height: 72, cursor: 'pointer', position: 'relative', flexShrink: 0 }}
          >
            <svg width="20" height="72" viewBox="0 0 20 72" style={{ display: 'block' }}>
              <polygon
                points="20,0 0,10 0,62 20,72"
                fill="rgba(15,30,55,0.96)"
                stroke="rgba(100,160,255,0.2)"
                strokeWidth="1"
              />
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: 'rgba(150,200,255,0.8)',
              userSelect: 'none',
            }}>
              {rulesDrawerOpen ? '▶' : '◀'}
            </div>
          </div>

          {/* 面板主体 */}
          <div style={{
            width: 220,                                          // ← 加宽
            background: 'linear-gradient(160deg, rgba(15,30,55,0.96), rgba(8,18,35,0.96))',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(100,160,255,0.18)',
            borderLeft: 'none',
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            padding: '16px 16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            boxShadow: '-6px 0 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.07)',
          }}>
            {/* 标题 */}
            <div style={{
              fontSize: 15, fontWeight: 'bold',
              color: 'rgba(160,210,255,0.85)',
              letterSpacing: 1,
              marginBottom: 8,
              paddingLeft: 2,
            }}>
              📋 游戏规则
            </div>

            {/* 建造费用 */}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 2 }}>建造费用</div>
            {[
              { icon: '🏘️', text: '定居点: 木 砖 羊 麦 各×1' },
              { icon: '🏰', text: '城市: 麦×2 矿×3' },
              { icon: '🛣️', text: '道路: 木×1 砖×1' },
              { icon: '📜', text: '发展卡: 羊×1 麦×1 矿×1' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e8f4ff', padding: '2px 0' }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                <span>{text}</span>
              </div>
            ))}

            {/* 分隔线 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />

            {/* 胜利条件 */}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 2 }}>胜利条件</div>
            {[
              { icon: '🏆', text: '10分获胜', color: '#f5c842' },
              { icon: '⚔️', text: '最大军队: 3骑士 +2分', color: 'rgba(180,210,255,0.8)' },
              { icon: '🛣️', text: '最长道路: 5条 +2分', color: 'rgba(180,210,255,0.8)' },
            ].map(({ icon, text, color }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color, padding: '2px 0' }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                <span>{text}</span>
              </div>
            ))}

            {/* 分隔线 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '6px 0' }} />

            {/* 港口 */}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, marginBottom: 2 }}>港口规则</div>
            {[
              { icon: '⚓', text: '2:1港口: 同类×2 换1', color: 'rgba(180,210,255,0.8)' },
              { icon: '🌊', text: '3:1港口: 任意×3 换1', color: 'rgba(180,210,255,0.8)' },
            ].map(({ icon, text, color }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color, padding: '2px 0' }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
                <span>{text}</span>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  )
}


// ============================================================
// 港口渲染组件 (优化木桥版)
// ============================================================
// ============================================================
// 港口渲染组件 (加长木桥版)
// ============================================================
function PortTile({
  port, board, myPlayerId,
}: {
  port: Port
  board: { vertices: Vertex[] }
  myPlayerId: string
}) {
  const v1 = board.vertices.find((v: Vertex) => v.id === port.vertexIds[0])
  const v2 = board.vertices.find((v: Vertex) => v.id === port.vertexIds[1])
  if (!v1 || !v2) return null

  const isMine = [v1, v2].some(v => v.ownerPlayerId === myPlayerId)

  // ==========================================
  // 🌟 核心修改：计算向海面延伸的坐标
  // ==========================================
  const midX = (v1.x + v2.x) / 2;
  const midY = (v1.y + v2.y) / 2;

  // 1. 计算连接两个顶点的边缘的法向量（垂直方向）
  let nx = -(v2.y - v1.y);
  let ny = v2.x - v1.x;

  // 2. 确保法向量是指向外侧海面的（远离地图中心点 400, 350）
  const toCenterX = 400 - midX;
  const toCenterY = 350 - midY;
  if (nx * toCenterX + ny * toCenterY > 0) {
    nx = -nx;
    ny = -ny;
  }

  // 3. 归一化向量
  const len = Math.sqrt(nx * nx + ny * ny);
  nx /= len;
  ny /= len;

  // 4. 🌟 桥的长度！你可以修改这个数字（比如 60, 70, 80）来控制桥有多长
  const bridgeLength = 50;

  // 5. 得出港口圆圈最终的渲染坐标
  const renderX = midX + nx * bridgeLength;
  const renderY = midY + ny * bridgeLength;
  // ==========================================

  const portColors: Record<string, string> = {
    wood: '#2d6a2d', brick: '#c0522a', ore: '#7f8c8d',
    wheat: '#d4ac0d', sheep: '#58b85c', any: '#2980b9',
  }
  const portEmoji: Record<string, string> = {
    wood: '🌲', brick: '🧱', ore: '⛰️',
    wheat: '🌾', sheep: '🐑', any: '🌊',
  }
  const portLabel: Record<string, string> = {
    wood: '2:1', brick: '2:1', ore: '2:1',
    wheat: '2:1', sheep: '2:1', any: '3:1',
  }

  const color = portColors[port.type] ?? '#2980b9'

  return (
    <g>
      {/* --- 木桥 1 (连接顶点 1) --- */}
      <line
        x1={renderX} y1={renderY} x2={v1.x} y2={v1.y}
        stroke="#8b5a2b" strokeWidth="8" strokeLinecap="round"
      />
      <line
        x1={renderX} y1={renderY} x2={v1.x} y2={v1.y}
        stroke="#5c3a18" strokeWidth="2" strokeDasharray="4 4"
      />

      {/* --- 木桥 2 (连接顶点 2) --- */}
      <line
        x1={renderX} y1={renderY} x2={v2.x} y2={v2.y}
        stroke="#8b5a2b" strokeWidth="8" strokeLinecap="round"
      />
      <line
        x1={renderX} y1={renderY} x2={v2.x} y2={v2.y}
        stroke="#5c3a18" strokeWidth="2" strokeDasharray="4 4"
      />

      {/* --- 港口指示牌主体 --- */}
      <circle cx={renderX} cy={renderY} r={24}
        fill="#f5e6c8"
        stroke={isMine ? '#FFD700' : color}
        strokeWidth={isMine ? 4 : 3}
      />

      {isMine && (
        <circle cx={renderX} cy={renderY} r={29}
          fill="none" stroke="#FFD700"
          strokeWidth="2" strokeDasharray="4 3" opacity={0.8}
        />
      )}

      <text x={renderX} y={renderY - 4} textAnchor="middle" fontSize="16"
        style={{ userSelect: 'none' }}>
        {portEmoji[port.type]}
      </text>

      <text x={renderX} y={renderY + 12} textAnchor="middle" dominantBaseline="middle"
        fontSize="12" fontWeight="bold" fill={color}
        style={{ userSelect: 'none' }}>
        {portLabel[port.type]}
      </text>
    </g>
  )
}



// ============================================================
// ✅ 新增：港口交易弹窗
// ============================================================
function PortTradeModal({
  resources, give, receive, rate,
  onGiveChange, onReceiveChange, onConfirm, onCancel, getBestRate,
}: {
  resources: PlayerResources
  give: ResourceType
  receive: ResourceType
  rate: number
  onGiveChange: (r: ResourceType) => void
  onReceiveChange: (r: ResourceType) => void
  onConfirm: () => void
  onCancel: () => void
  getBestRate: (r: ResourceType) => number
}) {
  const { pos, onMouseDown } = useDraggable()   // ← 新增
  const canTrade = resources[give] >= rate && give !== receive

  const boxStyle: React.CSSProperties = {       // ← 新增
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
    <div style={boxStyle} onMouseDown={onMouseDown}>  {/* ← 改这里 */}
      <h3 style={{ margin: '0 0 4px' }}>⚓ 港口 / 银行交易</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12, opacity: 0.7 }}>
        系统自动选择最优比率（港口 &gt; 银行）
      </p>

      {/* 给出 */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, opacity: 0.8 }}>给出资源</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {ALL_RESOURCES.map(r => {
            const rRate = getBestRate(r)
            const enough = resources[r] >= rRate
            const selected = give === r
            return (
              <div
                key={r}
                onClick={() => onGiveChange(r)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                  background: selected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                  border: selected ? '1px solid rgba(255,255,255,0.6)' : '1px solid transparent',
                  opacity: enough ? 1 : 0.4,
                }}
              >
                <span style={{ fontSize: 13 }}>
                  {RESOURCE_EMOJI[r]} {RESOURCE_LABELS[r]}
                </span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  有 {resources[r]} 张 &nbsp;
                  <span style={{
                    background: rRate === 2 ? '#27ae60' : rRate === 3 ? '#2980b9' : '#888',
                    color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11,
                  }}>
                    {rRate}:1
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 换取 */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, opacity: 0.8 }}>换取资源（得到 1 张）</label>
        <ResourceSelect value={receive} onChange={onReceiveChange} />
      </div>

      {give === receive && (
        <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 8 }}>给出和换取不能相同</div>
      )}
      {!canTrade && give !== receive && (
        <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 8 }}>
          {RESOURCE_LABELS[give]} 不足 {rate} 张
        </div>
      )}

      <button onClick={onConfirm} disabled={!canTrade} style={btnStyle(canTrade ? '#16a085' : '#555')}>
        确认交易（{rate} 张 {RESOURCE_LABELS[give]} → 1 张 {RESOURCE_LABELS[receive]}）
      </button>
      <button onClick={onCancel} style={{ ...btnStyle('#888'), marginTop: 8 }}>取消</button>
    </div>
  )
}


// ============================================================
// 子组件（保持原有）
// ============================================================

function HexagonTile({
  hex, isRobberTarget, onClick, selected,
}: {
  hex: Hex
  isRobberTarget: boolean
  onClick: () => void
  selected: boolean
}) {
  const { x, y, terrain, diceNumber, hasRobber } = hex
  const size = 72

  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`
  }).join(' ')

  // 用坐标生成唯一ID（避免需要 hex.id）
  const uid = `${Math.round(x)}-${Math.round(y)}`
  const clipId = `hex-clip-${uid}`
  const patternId = `hex-pattern-${uid}`

  const terrainImage: Record<string, string> = {
    wood: '/树林.png',
    brick: '/砖块.png',
    ore: '/石头.png',
    wheat: '/小麦.png',
    sheep: '/羊毛.png',
    desert: '/沙漠.png',
  }

  const terrainColors: Record<string, string> = {
    wood: '#2d6a2d', brick: '#c0522a', ore: '#7f8c8d',
    wheat: '#d4ac0d', sheep: '#58b85c', desert: '#c9a84c',
  }

  const imgSrc = terrainImage[terrain]
  const fallbackColor = terrainColors[terrain] ?? '#ccc'

  return (
    <g onClick={isRobberTarget ? onClick : undefined}
      style={{ cursor: isRobberTarget ? 'pointer' : 'default' }}>

      <defs>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
        {imgSrc && (
          <pattern id={patternId} patternUnits="userSpaceOnUse"
            x={x - size} y={y - size}
            width={size * 2} height={size * 2}>
            <image
              href={imgSrc}
              x="0" y="0"
              width={size * 2} height={size * 2}
              preserveAspectRatio="xMidYMid slice"
            />
          </pattern>
        )}
      </defs>

      {/* 备用底色 */}
      <polygon points={points} fill={fallbackColor} />

      {/* 图片贴图 */}
      {imgSrc && (
        <polygon points={points} fill={`url(#${patternId})`} />
      )}

      {/* 边框 - 优化为沙色/木质粗边框 */}
      <polygon
        points={points}
        fill="none"
        stroke={selected ? '#ffffff' : isRobberTarget ? '#f39c12' : '#e3c598'} /* 柔和的沙滩/木质色 */
        strokeWidth={selected ? 6 : isRobberTarget ? 5 : 4} /* 加粗边框，相邻六边形拼在一起会有 8px 的厚度 */
        strokeLinejoin="round" /* 让边角更圆润自然 */
        opacity={isRobberTarget ? 0.85 : 1}
      />


      {/* 强盗 */}
      {hasRobber && (
        <image
          href="/强盗.png"
          x={x - 40}       /* 向左偏移一半宽度使其居中 */
          y={y - 70}       /* 向上偏移，让它稳稳坐在数字圆圈上方 */
          width="80"       /* 设置合适的宽度 */
          height="80"      /* 设置合适的高度 */
          style={{ pointerEvents: 'none' }} /* 防止图片遮挡地块的点击事件 */
        />
      )}


      {/* 数字圆圈 */}
      {diceNumber > 0 && (
        <g>
          <circle cx={x} cy={y} r={23} fill="rgba(0,0,0,0.3)" />
          <circle cx={x} cy={y} r={21}
            fill="#f5e6c8"
            stroke="#8B6914"
            strokeWidth={1.5}
          />
          <text
            x={x} y={y - 3}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={diceNumber >= 10 ? '15' : '17'}
            fontWeight="bold"
            fill="#3d2b00"
            style={{ userSelect: 'none' }}
          >
            {diceNumber}
          </text>
          {(() => {
            const dotCount = 6 - Math.abs(7 - diceNumber)
            const spacing = 4
            const totalWidth = (dotCount - 1) * spacing
            return Array.from({ length: dotCount }, (_, i) => (
              <circle
                key={i}
                cx={x - totalWidth / 2 + i * spacing}
                cy={y + 13}
                r={1.8}
                fill="#3d2b00"
              />
            ))
          })()}
        </g>
      )}
    </g>
  )
}

function VertexPoint({
  vertex, onClick, isClickable, players, myPlayerId, myColor,
}: {
  vertex: Vertex
  onClick: () => void
  isClickable: boolean
  players: PlayerSummary[]
  myPlayerId: string
  myColor: string
}) {
  const { x, y, ownerPlayerId, building } = vertex
  const owner = players.find(p => p.playerId === ownerPlayerId)
  const hasBuilding = !!building
  const isClickableNow = isClickable && (
    !hasBuilding ||
    (ownerPlayerId === myPlayerId && building === 'settlement')
  )

  return (
    <g onClick={isClickableNow ? onClick : undefined} style={{ cursor: isClickableNow ? 'pointer' : 'default' }}>
      {isClickableNow && <circle cx={x} cy={y} r={18} fill="transparent" />}
      {isClickableNow && (
        <circle cx={x} cy={y} r={14}
          fill="rgba(255,255,255,0.15)"
          stroke={myColor} strokeWidth="2" strokeDasharray="4 2"
        />
      )}
      {hasBuilding && owner && (
        <g>
          <circle cx={x} cy={y} r={12} fill={owner.color} stroke="#fff" strokeWidth="2" />
          <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="12">
            {building === 'city' ? '🏰' : '🏘️'}
          </text>
        </g>
      )}
      {!hasBuilding && (
        <g>
          {/* 外圈底座 */}
          <circle cx={x} cy={y} r={7} fill="#f5e6c8" stroke="#a68a56" strokeWidth="1.5" />
          {/* 内圈小点 */}
          <circle cx={x} cy={y} r={2.5} fill="#a68a56" />
        </g>
      )}
    </g>
  )
}

function EdgeLine({
  edge, onClick, isClickable, players, myColor,
}: {
  edge: Edge
  onClick: () => void
  isClickable: boolean
  players: PlayerSummary[]
  myColor: string
}) {
  const { x1, y1, x2, y2, ownerPlayerId } = edge
  const owner = players.find(p => p.playerId === ownerPlayerId)
  const hasRoad = !!ownerPlayerId

  return (
    <g onClick={isClickable ? onClick : undefined} style={{ cursor: isClickable ? 'pointer' : 'default' }}>
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={hasRoad ? owner?.color ?? '#fff' : 'rgba(255,255,255,0.2)'}
        strokeWidth={hasRoad ? 8 : 4}
        strokeLinecap="round"
      />
      {isClickable && !hasRoad && (
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={myColor} strokeWidth="4"
          strokeLinecap="round" strokeDasharray="6 3" opacity="0.7"
        />
      )}
      {isClickable && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="16" />
      )}
    </g>
  )
}


function ResourceSelect({ value, onChange }: { value: ResourceType; onChange: (r: ResourceType) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as ResourceType)}
      style={{
        display: 'block', width: '100%', marginTop: 6,
        padding: '8px 10px', borderRadius: 6, border: 'none',
        background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 14,
      }}
    >
      {ALL_RESOURCES.map(r => (
        <option key={r} value={r} style={{ background: '#2c3e50' }}>
          {RESOURCE_EMOJI[r]} {RESOURCE_LABELS[r]}
        </option>
      ))}
    </select>
  )
}

function DiscardModal({
  resources, selection, onChange, onConfirm,
}: {
  resources: PlayerResources
  selection: PlayerResources
  onChange: (r: PlayerResources) => void
  onConfirm: () => void
}) {
  const total = Object.values(resources).reduce((a, b) => a + b, 0)
  const required = Math.floor(total / 2)
  const selected = Object.values(selection).reduce((a, b) => a + b, 0)

  const adjust = (key: ResourceType, delta: number) => {
    const next = { ...selection, [key]: Math.max(0, Math.min(resources[key], selection[key] + delta)) }
    onChange(next)
  }

  return (
    <div style={modalBox}>
      <h3 style={{ margin: '0 0 4px' }}>⚠️ 骰到7点 — 丢弃资源</h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, opacity: 0.8 }}>
        你的手牌超过7张，必须丢弃 <strong>{required}</strong> 张（当前已选 {selected} 张）
      </p>
      {ALL_RESOURCES.map(key => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 10px',
        }}>
          <span style={{ fontSize: 13 }}>{RESOURCE_EMOJI[key]} {RESOURCE_LABELS[key]}（有 {resources[key]}）</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => adjust(key, -1)} style={smallBtn}>－</button>
            <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 'bold' }}>{selection[key]}</span>
            <button onClick={() => adjust(key, 1)} style={smallBtn}>＋</button>
          </div>
        </div>
      ))}
      <button
        onClick={onConfirm}
        disabled={selected !== required}
        style={{ ...btnStyle(selected === required ? '#e74c3c' : '#555'), marginTop: 8 }}
      >
        确认丢弃（{selected}/{required}）
      </button>
    </div>
  )
}

function BankTradeModal({
  resources, give, receive, onGiveChange, onReceiveChange, onConfirm, onCancel,
}: {
  resources: PlayerResources
  give: ResourceType
  receive: ResourceType
  onGiveChange: (r: ResourceType) => void
  onReceiveChange: (r: ResourceType) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const { pos, onMouseDown } = useDraggable()
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
  const canTrade = resources[give] >= 4 && give !== receive
  return (
    <div style={boxStyle} onMouseDown={onMouseDown}>
      <h3 style={{ margin: '0 0 12px' }}>🏦 银行交易（4:1）</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, opacity: 0.8 }}>给出（需要4张）</label>
        <ResourceSelect value={give} onChange={onGiveChange} />
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
          你有 {resources[give]} 张 {RESOURCE_LABELS[give]}
          {resources[give] < 4 && <span style={{ color: '#e74c3c' }}> （不足）</span>}
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, opacity: 0.8 }}>换取（得到1张）</label>
        <ResourceSelect value={receive} onChange={onReceiveChange} />
      </div>
      {give === receive && (
        <div style={{ color: '#e74c3c', fontSize: 12, marginBottom: 8 }}>给出和换取不能相同</div>
      )}
      <button onClick={onConfirm} disabled={!canTrade} style={btnStyle(canTrade ? '#8e44ad' : '#555')}>
        确认交易
      </button>
      <button onClick={onCancel} style={{ ...btnStyle('#888'), marginTop: 8 }}>取消</button>
    </div>
  )
}

function ModalOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      zIndex: 9000,
      pointerEvents: 'none',
    }}>
      <div style={{ pointerEvents: 'auto', width: '100%', height: '100%', position: 'relative' }}>
        {children}
      </div>
    </div>
  )
}


function getPhaseText(phase: string) {
  const map: Record<string, string> = {
    setup_settlement: '放置定居点',
    setup_road: '放置道路',
    playing: '游戏进行中',
    ended: '游戏结束',
  }
  return map[phase] ?? phase
}

/** 横向六边形数字徽章 */
function HexBadge({ count, color }: { count: number; color: string }) {
  return (
    <div style={{ position: 'relative', width: 54, height: 28 }}>
      <svg width="54" height="28" viewBox="0 0 54 28" overflow="visible">
        <polygon
          points="15,2 39,2 52,14 39,26 15,26 2,14"
          fill={count > 0 ? color + 'cc' : 'rgba(255,255,255,0.08)'}
          stroke={count > 0 ? color : 'rgba(255,255,255,0.15)'}
          strokeWidth="1.5"
        />
      </svg>
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 'bold', color: '#fff',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      }}>{count}</span>
    </div>
  )
}

function StatusRow({
  icon, label, color, bold,
}: {
  icon: string
  label: string
  color: string
  bold?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', borderRadius: 10,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.07)',
      transition: 'background 0.2s',
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize: 12.5, color,
        fontWeight: bold ? 'bold' : '500',
        lineHeight: 1.35,
        letterSpacing: 0.3,
      }}>{label}</span>
    </div>
  )
}


const modalBox: React.CSSProperties = {
  background: '#1e2d3d',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 14,
  padding: 24,
  minWidth: 300,
  maxWidth: 400,
  maxHeight: '85vh',
  overflowY: 'auto',
  color: '#fff',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
}

const btnStyle = (bg: string): React.CSSProperties => ({
  width: '100%',
  padding: '10px',
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  cursor: 'pointer',
  fontWeight: 'bold',
  marginBottom: 8,
})

// ✅ 新增：小按钮样式
const smallBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  background: '#555',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

// 发展卡颜色映射（底部卡牌用）
const DEV_CARD_COLOR_MAP: Record<DevCardType, string> = {
  knight: '#e74c3c',
  victory_point: '#f39c12',
  road_building: '#8e44ad',
  year_of_plenty: '#2980b9',
  monopoly: '#16a085',
}

const bottomSectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 'bold',
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: 1,
  textTransform: 'uppercase' as const,
  marginBottom: 6,
}


// ============================================================
// PlayerCard 组件（圆形头像 + 数据小圆圈 + 悬浮详情）
// ============================================================
function PlayerCard({
  player, isCurrentPlayer, isMe, style, align = 'left'
}: {
  player: PlayerSummary
  isCurrentPlayer: boolean
  isMe: boolean
  style?: React.CSSProperties
  align?: 'left' | 'center' | 'right'
}) {
  const [isHovered, setIsHovered] = useState(false) // 👈 新增悬浮状态

  const avatarIndex = (() => {
    const colorMap: Record<string, number> = {
      '#e74c3c': 1, '#e67e22': 2, '#3498db': 3, '#2ecc71': 4,
      '#9b59b6': 1, '#1abc9c': 2, '#f39c12': 3, '#e91e63': 4,
    }
    return colorMap[player.color] ?? 1
  })()

  // 补全了标签名称，方便在悬浮窗中显示
  const stats = [
    { icon: '🏆', value: player.victoryPoints, label: '胜利点' },
    { icon: '🃏', value: player.totalCards, label: '资源卡' },
    { icon: '⚔️', value: player.knightsPlayed, label: '骑士卡' },
    { icon: '🛣️', value: player.roads, label: '道路长度' },
  ]

  // 👇 根据对齐方式计算悬浮窗的位置
  let tooltipStyle: React.CSSProperties = { top: '100%', marginTop: 12 }
  if (isMe) {
    tooltipStyle = { bottom: '100%', left: 0, marginBottom: 12, top: 'auto' }
  } else if (align === 'left') {
    tooltipStyle = { ...tooltipStyle, left: 0 }
  } else if (align === 'right') {
    tooltipStyle = { ...tooltipStyle, right: 0 }
  } else {
    tooltipStyle = { ...tooltipStyle, left: '50%', transform: 'translateX(-50%)' }
  }

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)} // 👈 鼠标移入
      onMouseLeave={() => setIsHovered(false)} // 👈 鼠标移出
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        borderRadius: 50,
        background: isCurrentPlayer
          ? `linear-gradient(135deg, ${player.color}cc, ${player.color}66)`
          : 'rgba(0,0,0,0.55)',
        border: isMe
          ? '2px solid #fff'
          : isCurrentPlayer
            ? `2px solid ${player.color}`
            : '2px solid rgba(255,255,255,0.2)',
        backdropFilter: 'blur(8px)',
        boxShadow: isCurrentPlayer
          ? `0 0 16px ${player.color}88`
          : '0 4px 12px rgba(0,0,0,0.4)',
        transition: 'all 0.3s ease',
        position: 'relative', // 👈 关键：让 Tooltip 相对定位
        ...style,
      }}
    >
      {/* 👇 新增：悬浮详情面板 👇 */}
      {isHovered && (
        <div style={{
          position: 'absolute',
          ...tooltipStyle,
          background: 'rgba(15, 30, 50, 0.95)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${player.color}88`,
          borderRadius: 12,
          padding: '12px 16px',
          minWidth: 160,
          boxShadow: '0 10px 32px rgba(0,0,0,0.8)',
          zIndex: 300,
          pointerEvents: 'none', // 防止悬浮窗挡住鼠标事件
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          cursor: 'default',
        }}>
          <div style={{
            fontSize: 14, fontWeight: 'bold', color: player.color,
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            paddingBottom: 6, marginBottom: 2,
            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
          }}>
            {player.name} 的详细信息
          </div>
          
          {stats.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>{s.label}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#fff' }}>{s.value}</span>
            </div>
          ))}

          {/* 如果有最大军队或最长道路，额外高亮显示 */}
          {(player.hasLargestArmy || player.hasLongestRoad) && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 6, marginTop: 2 }}>
              {player.hasLargestArmy && <div style={{ fontSize: 11, color: '#f39c12', marginBottom: 4 }}>👑 拥有最大军队 (+2分)</div>}
              {player.hasLongestRoad && <div style={{ fontSize: 11, color: '#f39c12' }}>👑 拥有最长道路 (+2分)</div>}
            </div>
          )}
        </div>
      )}
      {/* 👆 新增结束 👆 */}

      {/* 圆形头像 */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: isMe ? 68 : 56,
          height: isMe ? 68 : 56,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `3px solid ${player.color}`,
          boxShadow: `0 0 0 2px rgba(255,255,255,0.3)`,
        }}>
          <img
            src={`/${avatarIndex}.png`}
            alt={player.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => {
              const t = e.currentTarget
              t.style.display = 'none'
              const parent = t.parentElement!
              parent.style.background = player.color
              parent.style.display = 'flex'
              parent.style.alignItems = 'center'
              parent.style.justifyContent = 'center'
              parent.innerHTML = `<span style="font-size:20px">👤</span>`
            }}
          />
        </div>
        {/* 当前回合指示点 */}
        {isCurrentPlayer && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 12, height: 12, borderRadius: '50%',
            background: '#2ecc71',
            border: '2px solid #fff',
            boxShadow: '0 0 6px #2ecc71',
          }} />
        )}
        {/* 离线指示 */}
        {player.isOnline === false && (
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 12, height: 12, borderRadius: '50%',
            background: '#e74c3c',
            border: '2px solid #fff',
          }} />
        )}
      </div>

      {/* 右侧信息 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* 玩家名称 */}
        <div style={{
          fontSize: isMe ? 15 : 13,
          fontWeight: 'bold',
          color: '#fff',
          textShadow: '1px 1px 3px rgba(0,0,0,0.8)',
          maxWidth: 100,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {player.name}
          {isMe && ' (你)'}
          {player.hasLargestArmy && ' ⚔️'}
          {player.hasLongestRoad && ' 🛣️'}
        </div>

        {/* 数据小圆圈行 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {stats.map(s => (
            <div key={s.label} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'center',
              minWidth: 34,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                border: '1.5px solid rgba(255,255,255,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13,
              }}>
                {s.icon}
              </div>
              <div style={{
                fontSize: 12, fontWeight: 'bold', color: '#fff',
                textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                marginTop: 1,
              }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ActionBar({
  isMyTurn, hasRolled, isLocked, roadBuildingInfo,
  onRoll, onEndTurn, onPortTrade, onBuyDevCard,
  tradeProps,
}: {
  isMyTurn: boolean
  hasRolled: boolean
  isLocked: boolean
  roadBuildingInfo: { roadsLeft: number } | null | undefined
  onRoll: () => void
  onEndTurn: () => void
  onPortTrade: () => void
  onBuyDevCard: () => void
  tradeProps: {
    roomId: string
    myPlayerId: string
    myResources: PlayerResources
    players: PlayerSummary[]
    tradeOffer: import('@catan/shared').TradeOffer | null | undefined
    isMyTurn: boolean
    hasRolled: boolean
    isLocked: boolean
  }
}) {
  const [tradeOpen, setTradeOpen] = useState(false)

  const canRoll = isMyTurn && !hasRolled && !isLocked
  const canEnd = isMyTurn && !!hasRolled && !isLocked && !roadBuildingInfo
  const canAct = isMyTurn && !!hasRolled && !isLocked

  const iAmReceiver = !!tradeProps.tradeOffer &&
    tradeProps.tradeOffer.fromPlayerId !== tradeProps.myPlayerId
  const hasTradeNotif = iAmReceiver && tradeProps.tradeOffer?.status === 'pending'

  return (
    <>
      <div style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 12, /* 恢复原来的间距 */
      }}>
        {/* 三个小圆圈 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ActionCircle
            icon="⚓"
            label="港口/银行交易"
            color="#16a085"
            disabled={!canAct}
            onClick={onPortTrade}
            size={62}
          />
          <ActionCircle
            icon="📜"
            label="购买发展卡"
            color="#2980b9"
            disabled={!canAct}
            onClick={onBuyDevCard}
            size={62}
          />
          <ActionCircle
            icon="🤝"
            label={hasTradeNotif ? '有交易邀约！' : '玩家交易'}
            color={hasTradeNotif ? '#e74c3c' : '#8e44ad'}
            disabled={false}
            onClick={() => setTradeOpen(true)}
            size={62}
            badge={hasTradeNotif}
          />
        </div>

        {/* 右侧：结束回合（上）+ 骰子（下） */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <ActionCircle
            icon="✅"
            label="结束回合"
            color="#27ae60"
            disabled={!canEnd}
            onClick={onEndTurn}
            size={62}
          />
          <ActionCircle
            icon={hasRolled ? '🎲' : '🎲'}
            label={hasRolled ? '已掷骰' : '掷骰子'}
            color={canRoll ? '#e67e22' : '#555'}
            disabled={!canRoll}
            onClick={onRoll}
            size={80}
          />
        </div>
      </div>

      {/* 交易弹窗 */}
      {tradeOpen && (
        <TradePanelModal
          {...tradeProps}
          onClose={() => setTradeOpen(false)}
        />
      )}
    </>
  )
}

function ActionCircle({
  icon, label, color, disabled, onClick, size, badge,
}: {
  icon: string
  label: string
  color: string
  disabled: boolean
  onClick: () => void
  size: number
  badge?: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: size + 8,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.85)',
          color: '#fff',
          fontSize: 12,
          padding: '4px 10px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          zIndex: 300,
        }}>
          {label}
        </div>
      )}

      {/* 圆圈按钮 */}
      <div
        onClick={disabled ? undefined : onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: disabled
            ? 'rgba(0 ,0 ,0 ,0.75)'
            : `radial-gradient(circle at 35% 35%, ${color}ff, ${color}99)`,
          border: disabled
            ? '2.5px solid rgba(255,255,255,0.55)'
            : `2.5px solid ${color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          boxShadow: disabled ? 'none' : `0 0 14px ${color}66`,
          transition: 'all 0.2s',
          fontSize: size >= 60 ? 28 : 22,
          userSelect: 'none',
        }}
      >
        {icon}
      </div>

      {/* 红点通知 */}
      {badge && (
        <div style={{
          position: 'absolute',
          top: -3, right: -3,
          width: 12, height: 12,
          borderRadius: '50%',
          background: '#e74c3c',
          border: '2px solid #071e2e',
          boxShadow: '0 0 6px #e74c3c',
        }} />
      )}
    </div>
  )
}

function TradePanelModal(props: {
  roomId: string
  myPlayerId: string
  myResources: PlayerResources
  players: PlayerSummary[]
  tradeOffer: import('@catan/shared').TradeOffer | null | undefined
  isMyTurn: boolean
  hasRolled: boolean
  isLocked: boolean
  onClose: () => void
}) {
  return (
    <TradePanel
      roomId={props.roomId}
      myPlayerId={props.myPlayerId}
      myResources={props.myResources}
      players={props.players}
      tradeOffer={props.tradeOffer}
      isMyTurn={props.isMyTurn}
      hasRolled={props.hasRolled}
      isLocked={props.isLocked}
      forceOpen
      onClose={props.onClose}
    />
  )
}
