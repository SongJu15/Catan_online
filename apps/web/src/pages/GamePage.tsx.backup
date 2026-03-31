import { useEffect, useState } from 'react'
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
  | null

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

  useEffect(() => {
    if (!syncData) { navigate('/'); return }

    socket.on(STATE_SYNC, (payload: StateSyncPayload) => {
      setSyncData(payload)
    })
    socket.on(GAME_ERROR, (payload: { message: string }) => {
      setErrorMsg(payload.message)
      setTimeout(() => setErrorMsg(null), 3000)
    })
    return () => {
      socket.off(STATE_SYNC)
      socket.off(GAME_ERROR)
    }
  }, [])

  if (!syncData) return null

  const { you, state } = syncData
  const {
    board, phase, currentPlayerId, players, diceResult,
    hasRolled, winner, robberInfo, robberHexId,
    roadBuildingInfo, turnNumber,
  } = state

  const isMyTurn = currentPlayerId === you.playerId
  const currentPlayer = players.find(p => p.playerId === currentPlayerId)
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

  // 计算某种资源的最优交易比率
  const getBestTradeRate = (resource: ResourceType): number => {
    const myPorts = getMyPorts()
    // 检查是否有该资源的 2:1 港口
    const hasSpecific = myPorts.some(p => p.type === resource)
    if (hasSpecific) return 2
    // 检查是否有 3:1 通用港口
    const hasGeneral = myPorts.some(p => p.type === 'any')
    if (hasGeneral) return 3
    // 默认银行 4:1
    return 4
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
    socket.emit(ACTION_BUY_DEV_CARD, { roomId: id })
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
    <div style={{ padding: 16, fontFamily: 'sans-serif', background: '#1a2a3a', minHeight: '100vh', color: '#fff' }}>

      {/* 错误提示 */}
      {errorMsg && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#e74c3c', color: '#fff', padding: '10px 24px',
          borderRadius: 8, zIndex: 9999, fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
        }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* 强盗移动提示条 */}
      {isMovingRobber && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: '#e67e22', color: '#fff', padding: '10px 24px',
          borderRadius: 8, zIndex: 9998, fontWeight: 'bold',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          🗡️ 点击地图上的地块放置强盗（不能放在原位置）
        </div>
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
              {[...players]
                .sort((a, b) => b.victoryPoints - a.victoryPoints)
                .map((p, i) => (
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

      {/* ✅ 丢牌弹窗：由派生值 showDiscardModal 控制，独立于 modal state */}
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

      {/* 其他弹窗：由 modal state 控制 */}
      {!showDiscardModal && modal && (
        <ModalOverlay>
          {modal === 'rob_player' && (
            <div style={modalBox}>
              <h3 style={{ margin: '0 0 12px' }}>🗡️ 选择抢劫目标</h3>
              <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>
                该地块上有其他玩家，选择抢劫对象（或跳过）
              </p>
              {robTargets.map(t => (
                <button
                  key={t.playerId}
                  onClick={() => handleRobPlayerConfirm(t.playerId)}
                  style={{ ...btnStyle(t.color), marginBottom: 8 }}
                >
                  抢劫 {t.name}（{t.totalCards} 张牌）
                </button>
              ))}
              <button onClick={() => handleRobPlayerConfirm(null)} style={btnStyle('#888')}>
                不抢劫，直接放置
              </button>
            </div>
          )}
          {modal === 'bank_trade' && (
            <BankTradeModal
              resources={you.resources}
              give={tradeGive}
              receive={tradeReceive}
              onGiveChange={setTradeGive}
              onReceiveChange={setTradeReceive}
              onConfirm={handleBankTradeConfirm}
              onCancel={() => setModal(null)}
            />
          )}
          {modal === 'port_trade' && (
            <PortTradeModal
              resources={you.resources}
              give={portTradeGive}
              receive={portTradeReceive}
              rate={portTradeRate}
              onGiveChange={handlePortTradeGiveChange}
              onReceiveChange={setPortTradeReceive}
              onConfirm={handlePortTradeConfirm}
              onCancel={() => setModal(null)}
              getBestRate={getBestTradeRate}
            />
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
              <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.8 }}>
                所有其他玩家将把该资源全部给你
              </p>
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

      {/* 顶部状态栏 */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.08)', padding: '10px 16px',
        borderRadius: 10, marginBottom: 12,
      }}>
        <span style={{ fontSize: 18, fontWeight: 'bold' }}>🏝️ 卡坦岛</span>
        <Tag color="rgba(255,255,255,0.15)">{getPhaseText(phase)}</Tag>
        {currentPlayer && (
          <Tag color={currentPlayer.color}>当前：{currentPlayer.name}</Tag>
        )}
        {isMyTurn && phase !== 'ended' && (
          <Tag color="#27ae60">🎯 你的回合！</Tag>
        )}
        {diceResult && (
          <Tag color="#f39c12">
            🎲 {diceResult[0]} + {diceResult[1]} = {diceResult[0] + diceResult[1]}
          </Tag>
        )}
        {iMustDiscard && (
          <Tag color="#e74c3c">⚠️ 你需要丢牌！</Tag>
        )}
        {isMovingRobber && (
          <Tag color="#e67e22">🗡️ 请点击地块放置强盗</Tag>
        )}
        {isRoadBuilding && (
          <Tag color="#9b59b6">🛣️ 道路建设中（剩余 {roadBuildingInfo!.roadsLeft} 条）</Tag>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

        {/* 棋盘区域 */}
        <div style={{ flex: '1 1 600px' }}>
          <div style={{ background: '#2c3e50', borderRadius: 12, padding: 8, overflow: 'auto' }}>
            {board && (
              <svg
                width="800" height="700" viewBox="0 0 800 700"
                style={{ display: 'block', maxWidth: '100%' }}
              >
                <rect width="800" height="700" fill="#1a6b9a" rx="12" />

                {/* ✅ 港口渲染（在六边形下面先画） */}
                {board.ports?.map((port: Port) => (
                  <PortTile
                    key={port.id}
                    port={port}
                    board={board}
                    myPlayerId={you.playerId}
                  />
                ))}

                {board.hexes.map((hex: Hex) => (
                  <HexagonTile
                    key={hex.id}
                    hex={hex}
                    isRobberTarget={isMovingRobber && hex.id !== robberHexId}
                    onClick={() => isMovingRobber && handleRobberHexSelect(hex.id)}
                    selected={selectedRobberHex === hex.id}
                  />
                ))}

                {board.edges.map((edge: Edge) => (
                  <EdgeLine
                    key={edge.id}
                    edge={edge}
                    onClick={() => handleEdgeClick(edge.id)}
                    isClickable={
                      isMyTurn && !isLocked && (
                        phase === 'setup_road' ||
                        (phase === 'playing' && (!!hasRolled || isRoadBuilding) && !edge.ownerPlayerId)
                      )
                    }
                    players={players}
                    myColor={myColor}
                  />
                ))}

                {board.vertices.map((vertex: Vertex) => (
                  <VertexPoint
                    key={vertex.id}
                    vertex={vertex}
                    onClick={() => handleVertexClick(vertex.id, vertex)}
                    isClickable={
                      isMyTurn && !isLocked && (
                        phase === 'setup_settlement' ||
                        (phase === 'playing' && !!hasRolled)
                      )
                    }
                    players={players}
                    myPlayerId={you.playerId}
                    myColor={myColor}
                  />
                ))}
              </svg>
            )}
          </div>
        </div>

        {/* 右侧面板 */}
        <div style={{ flex: '0 0 230px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* 玩家列表 */}
          <div style={panelStyle}>
            <h3 style={panelTitle}>👥 玩家</h3>
            {players.map(p => (
              <div key={p.playerId} style={{
                padding: '8px 10px', borderRadius: 6, marginBottom: 6,
                background: p.playerId === currentPlayerId ? p.color + 'cc' : 'rgba(255,255,255,0.08)',
                border: p.playerId === you.playerId ? '2px solid #fff' : '2px solid transparent',
                fontSize: 13,
                opacity: p.isOnline === false ? 0.5 : 1,
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: 2 }}>
                  {p.name}
                  {p.playerId === you.playerId && ' (你)'}
                  {p.hasLargestArmy && ' ⚔️'}
                  {p.hasLongestRoad && ' 🛣️'}
                  {p.isOnline === false && ' 🔴'}
                </div>
                <div style={{ opacity: 0.9, fontSize: 12 }}>
                  🏆 {p.victoryPoints}分 &nbsp;🃏 {p.totalCards}张 &nbsp;📜 {p.devCardCount}张
                </div>
                <div style={{ opacity: 0.75, fontSize: 11, marginTop: 2 }}>
                  🏘️×{p.settlements} 🏰×{p.cities} 🛣️×{p.roads} ⚔️×{p.knightsPlayed}
                </div>
              </div>
            ))}
          </div>

          {/* 我的资源 */}
          <div style={panelStyle}>
            <h3 style={panelTitle}>🎒 我的资源</h3>
            <ResourceDisplay resources={you.resources} />
          </div>

          {/* ✅ 我的港口 */}
          {board?.ports && getMyPorts().length > 0 && (
            <div style={panelStyle}>
              <h3 style={panelTitle}>⚓ 我的港口</h3>
              {getMyPorts().map(port => (
                <div key={port.id} style={{
                  fontSize: 12, padding: '4px 8px', marginBottom: 4,
                  background: 'rgba(255,255,255,0.08)', borderRadius: 6,
                }}>
                  {port.type === 'any'
                    ? '🌊 通用港口（3:1）'
                    : `${RESOURCE_EMOJI[port.type as ResourceType]} ${RESOURCE_LABELS[port.type as ResourceType]} 港口（2:1）`}
                </div>
              ))}
            </div>
          )}

          {/* 我的发展卡 */}
          {you.devCards.length > 0 && (
            <div style={panelStyle}>
              <h3 style={panelTitle}>📜 我的发展卡</h3>
              {you.devCards.map((card, i) => {
                const usable = canPlayCard(card)
                return (
                  <div
                    key={i}
                    onClick={() => usable && handlePlayDevCard(card.type)}
                    style={{
                      padding: '7px 10px', borderRadius: 6, marginBottom: 6,
                      background: usable ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                      border: usable ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                      cursor: usable ? 'pointer' : 'default',
                      opacity: usable ? 1 : 0.5,
                      transition: 'all 0.15s',
                    }}
                    title={DEV_CARD_DESC[card.type]}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: 13 }}>{DEV_CARD_LABELS[card.type]}</div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      {card.type === 'victory_point'
                        ? '自动生效'
                        : (turnNumber ?? 0) <= card.turnBought
                          ? '下回合可用'
                          : usable ? '点击使用' : '不可用'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 操作按钮 */}
          {phase === 'playing' && isMyTurn && (
            <div style={panelStyle}>
              <h3 style={panelTitle}>⚡ 操作</h3>
              <button
                onClick={handleRollDice}
                disabled={!!hasRolled || isLocked}
                style={btnStyle(hasRolled || isLocked ? '#555' : '#e67e22')}
              >
                🎲 {hasRolled ? '已掷骰' : '掷骰子'}
              </button>
              <button
                onClick={handleOpenPortTrade}
                disabled={!hasRolled || isLocked}
                style={btnStyle(!hasRolled || isLocked ? '#555' : '#16a085')}
              >
                ⚓ 港口/银行交易
              </button>
              <button
                onClick={handleBuyDevCard}
                disabled={!hasRolled || isLocked}
                style={btnStyle(!hasRolled || isLocked ? '#555' : '#2980b9')}
              >
                📜 购买发展卡
              </button>
              <button
                onClick={handleEndTurn}
                disabled={!hasRolled || isLocked || !!roadBuildingInfo}
                style={btnStyle(!hasRolled || isLocked || !!roadBuildingInfo ? '#555' : '#27ae60')}
              >
                ✅ 结束回合
              </button>
              {hasRolled && !isLocked && (
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6, lineHeight: 1.6 }}>
                  点击空顶点建定居点<br />
                  点击自己的定居点升城市<br />
                  点击空边建道路
                </div>
              )}
            </div>
          )}

          {/* 玩家交易 */}        
          {phase === 'playing' && (
            <TradePanel
              roomId={id!}
              myPlayerId={you.playerId}
              myResources={you.resources}
              players={players}
              tradeOffer={state.tradeOffer}
              isMyTurn={isMyTurn}
              hasRolled={!!hasRolled}
              isLocked={isLocked}
            />
          )}

          {/* 建造费用参考 */}
          <div style={panelStyle}>
            <h3 style={panelTitle}>📋 建造费用</h3>
            <div style={{ fontSize: 11, lineHeight: 1.9, opacity: 0.85 }}>
              <div>🏘️ 定居点: 木砖羊麦各×1</div>
              <div>🏰 城市: 麦×2 矿×3</div>
              <div>🛣️ 道路: 木×1 砖×1</div>
              <div>📜 发展卡: 羊×1 麦×1 矿×1</div>
              <div style={{ marginTop: 6, opacity: 0.7 }}>🏆 10分获胜</div>
              <div style={{ opacity: 0.7 }}>⚔️ 最大军队: 3骑士 +2分</div>
              <div style={{ opacity: 0.7 }}>🛣️ 最长道路: 5条 +2分</div>
              <div style={{ marginTop: 6, opacity: 0.7 }}>⚓ 2:1港口: 同类×2换1</div>
              <div style={{ opacity: 0.7 }}>🌊 3:1港口: 任意×3换1</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ============================================================
// ✅ 新增：港口渲染组件
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
  const lineColor = isMine ? '#FFD700' : 'rgba(255,255,255,0.5)'
  const lineWidth = isMine ? 2 : 1.5

  return (
    <g>
      {/* 连线到两个顶点 */}
      <line
        x1={port.x} y1={port.y} x2={v1.x} y2={v1.y}
        stroke={lineColor} strokeWidth={lineWidth} strokeDasharray="5 3"
      />
      <line
        x1={port.x} y1={port.y} x2={v2.x} y2={v2.y}
        stroke={lineColor} strokeWidth={lineWidth} strokeDasharray="5 3"
      />

      {/* 两个顶点上的锚点标记 */}
      <circle cx={v1.x} cy={v1.y} r={9} fill={color}
        stroke={isMine ? '#FFD700' : 'rgba(255,255,255,0.8)'}
        strokeWidth={isMine ? 2.5 : 1.5} opacity={0.85}
      />
      <text x={v1.x} y={v1.y} textAnchor="middle" dominantBaseline="middle"
        fontSize="9" style={{ userSelect: 'none' }}>⚓</text>

      <circle cx={v2.x} cy={v2.y} r={9} fill={color}
        stroke={isMine ? '#FFD700' : 'rgba(255,255,255,0.8)'}
        strokeWidth={isMine ? 2.5 : 1.5} opacity={0.85}
      />
      <text x={v2.x} y={v2.y} textAnchor="middle" dominantBaseline="middle"
        fontSize="9" style={{ userSelect: 'none' }}>⚓</text>

      {/* 港口主体 */}
      <circle cx={port.x} cy={port.y} r={26}
        fill={color}
        stroke={isMine ? '#FFD700' : 'rgba(255,255,255,0.7)'}
        strokeWidth={isMine ? 3 : 1.5}
        opacity={0.92}
      />
      {isMine && (
        <circle cx={port.x} cy={port.y} r={30}
          fill="none" stroke="#FFD700"
          strokeWidth="2" strokeDasharray="4 3" opacity={0.7}
        />
      )}
      <text x={port.x} y={port.y - 7} textAnchor="middle" fontSize="15"
        style={{ userSelect: 'none' }}>
        {portEmoji[port.type]}
      </text>
      <text x={port.x} y={port.y + 9} textAnchor="middle" dominantBaseline="middle"
        fontSize="11" fontWeight="bold" fill="#fff"
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
  const canTrade = resources[give] >= rate && give !== receive

  return (
    <div style={modalBox}>
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
  const terrainColors: Record<string, string> = {
    wood: '#2d6a2d', brick: '#c0522a', ore: '#7f8c8d',
    wheat: '#d4ac0d', sheep: '#58b85c', desert: '#c9a84c',
  }
  const terrainEmoji: Record<string, string> = {
    wood: '🌲', brick: '🧱', ore: '⛰️', wheat: '🌾', sheep: '🐑', desert: '🏜️',
  }
  const color = terrainColors[terrain] ?? '#ccc'
  const size = 72
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`
  }).join(' ')

  return (
    <g onClick={isRobberTarget ? onClick : undefined} style={{ cursor: isRobberTarget ? 'pointer' : 'default' }}>
      <polygon
        points={points}
        fill={color}
        stroke={selected ? '#fff' : isRobberTarget ? '#f39c12' : '#1a2a3a'}
        strokeWidth={selected ? 4 : isRobberTarget ? 3 : 2}
        opacity={isRobberTarget ? 0.85 : 1}
      />
      <text x={x} y={y - 10} textAnchor="middle" fontSize="20" style={{ userSelect: 'none' }}>
        {terrainEmoji[terrain]}
      </text>
      {diceNumber > 0 && (
        <>
          <circle cx={x} cy={y + 14} r="16" fill="rgba(255,255,255,0.9)" stroke="#333" strokeWidth="1.5" />
          <text
            x={x} y={y + 14} textAnchor="middle" dominantBaseline="middle"
            fontSize="14" fontWeight="bold"
            fill={diceNumber === 6 || diceNumber === 8 ? '#c0392b' : '#1a2a3a'}
          >
            {diceNumber}
          </text>
        </>
      )}
      {hasRobber && (
        <text x={x} y={y - 30} textAnchor="middle" fontSize="22" style={{ userSelect: 'none' }}>
          🗡️
        </text>
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
        <circle cx={x} cy={y} r={5} fill="rgba(255,255,255,0.3)" />
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
        strokeWidth={hasRoad ? 6 : 3}
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

function ResourceDisplay({ resources }: { resources: PlayerResources }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {ALL_RESOURCES.map(key => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '4px 8px',
        }}>
          <span style={{ fontSize: 13 }}>{RESOURCE_EMOJI[key]} {RESOURCE_LABELS[key]}</span>
          <span style={{
            background: RESOURCE_COLOR[key], color: '#fff', borderRadius: 4,
            padding: '1px 8px', fontWeight: 'bold', fontSize: 13,
            minWidth: 24, textAlign: 'center',
          }}>
            {resources[key] ?? 0}
          </span>
        </div>
      ))}
    </div>
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
  const canTrade = resources[give] >= 4 && give !== receive
  return (
    <div style={modalBox}>
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
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9000,
    }}>
      {children}
    </div>
  )
}

function Tag({
  color, children,
}: {
  color: string
  children: React.ReactNode
}) {
  return (
    <span style={{
      background: color, color: '#fff',
      padding: '4px 10px', borderRadius: 6,
      fontWeight: 'bold', fontSize: 13,
    }}>
      {children}
    </span>
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

const smallBtn: React.CSSProperties = {
  width: 28, height: 28,
  background: 'rgba(255,255,255,0.15)',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: 4, color: '#fff',
  cursor: 'pointer', fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    display: 'block', width: '100%', marginBottom: 4,
    padding: '9px 0', background: bg, color: '#fff',
    border: 'none', borderRadius: 6,
    fontWeight: 'bold', fontSize: 14,
    cursor: bg === '#555' ? 'not-allowed' : 'pointer',
    opacity: bg === '#555' ? 0.55 : 1,
  }
}