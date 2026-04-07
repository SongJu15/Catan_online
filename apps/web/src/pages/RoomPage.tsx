import { useEffect, useState } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'
import { STATE_SYNC, PLAYER_READY, GAME_START } from '@catan/shared'
import type { StateSyncPayload } from '@catan/shared'
import './RoomPage.css'

function tryReconnect(
  navigate: ReturnType<typeof useNavigate>,
  setSyncData: (d: StateSyncPayload) => void,
  setIsConnected: (v: boolean) => void
) {
  const savedRoomId = sessionStorage.getItem('catan_room_id')
  const savedPlayerId = sessionStorage.getItem('catan_player_id')
  if (!savedRoomId || !savedPlayerId) return

  socket.emit(
    'reconnect_player',
    { roomId: savedRoomId, playerId: savedPlayerId },
    (resp: StateSyncPayload & { error?: string }) => {
      if (resp.error) {
        console.warn('重连失败:', resp.error)
        sessionStorage.removeItem('catan_room_id')
        sessionStorage.removeItem('catan_player_id')
        navigate('/')
        return
      }
      setIsConnected(true)
      setSyncData(resp)
      if (resp.state.phase !== 'lobby') {
        navigate(`/game/${savedRoomId}`, { state: resp })
      }
    }
  )
}

// 玩家颜色列表
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c']

export default function RoomPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [syncData, setSyncData] = useState<StateSyncPayload | null>(
    (location.state as StateSyncPayload) ?? null
  )
  const [isConnected, setIsConnected] = useState(socket.connected)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!syncData) {
      if (socket.connected) {
        tryReconnect(navigate, setSyncData, setIsConnected)
      }
    } else {
      sessionStorage.setItem('catan_room_id', id!)
      sessionStorage.setItem('catan_player_id', syncData.you.playerId)
    }

    const handleStateSync = (payload: StateSyncPayload) => {
      setSyncData(payload)
      if (payload.state.phase !== 'lobby') {
        navigate(`/game/${id}`, { state: payload })
      }
    }
    const handleDisconnect = () => setIsConnected(false)
    const handleConnect = () => {
      setIsConnected(true)
      tryReconnect(navigate, setSyncData, setIsConnected)
    }

    socket.on(STATE_SYNC, handleStateSync)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect', handleConnect)

    return () => {
      socket.off(STATE_SYNC, handleStateSync)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect', handleConnect)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 重连中
  if (!syncData) {
    return (
      <div className="room-page">
        <div className="room-container" style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="reconnect-spinner">⏳</div>
          <p style={{ color: '#f0e6d3', fontSize: 18 }}>正在重连中...</p>
        </div>
      </div>
    )
  }

  const { you, state } = syncData
  const isHost = state.hostPlayerId === you.playerId
  const myPublicInfo = state.players.find(p => p.playerId === you.playerId)  // ← 加这行
  const allOthersReady = state.players
    .filter(p => p.playerId !== state.hostPlayerId)
    .every(p => p.isReady)
  const currentPlayer = state.players.find(p => p.playerId === you.playerId)
  const isReady = currentPlayer?.isReady || false

  const handleReady = () => {
    socket.emit(PLAYER_READY, { roomId: id, ready: !isReady })
  }

  const handleStartGame = () => {
    socket.emit(GAME_START, { roomId: id })
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(id || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canStart = allOthersReady && state.players.length >= 2

  return (
    <div className="room-page">
      <div className="room-container">

        <h1>🏝️ 房间大厅</h1>

        {/* 断线提示 */}
        {!isConnected && (
          <div className="disconnect-banner">
            <span>⚠️</span>
            <span>网络连接断开，正在尝试重连...</span>
          </div>
        )}

        {/* 房间信息卡片 */}
        <div className="room-info-card">
          <div className="info-row">
            <span className="label">🔑 房间号</span>
            <span className="value">
              {id}
              <button className="copy-btn" onClick={handleCopy}>
                {copied ? '✅ 已复制' : '复制'}
              </button>
            </span>
          </div>
          <div className="info-row">
            <span className="label">🎭 你的名称</span>
            <span className="value">{myPublicInfo?.name ?? you.playerId}</span>
          </div>
          <div className="info-row">
            <span className="label">📡 房间状态</span>
            <span className="value">
              <span className="status-badge">
                {state.phase === 'lobby' ? '等待中' : state.phase}
              </span>
            </span>
          </div>
        </div>

        {/* 玩家列表 */}
        <div className="players-section">
          <h2>👥 玩家列表（{state.players.length} 人）</h2>
          <div className="players-grid">
            {state.players.map((player, index) => {
              const isMe = player.playerId === you.playerId
              const isPlayerHost = player.playerId === state.hostPlayerId
              return (
                <div
                  key={player.playerId}
                  className={`player-card ${isMe ? 'is-me' : ''} ${!player.isOnline ? 'offline' : ''}`}
                >
                  <div
                    className="player-avatar"
                    style={{ background: PLAYER_COLORS[index % PLAYER_COLORS.length] }}
                  >
                    {player.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="player-info">
                    <div className="player-name">
                      {player.name}
                      {isMe && <span className="badge">你</span>}
                      {isPlayerHost && <span className="badge host">👑 房主</span>}
                    </div>
                    <div className="player-status">
                      {!player.isOnline ? (
                        <span className="status-text offline-text">🔴 离线中</span>
                      ) : isPlayerHost ? (
                        <span className="status-text">房主</span>
                      ) : player.isReady ? (
                        <span className="status-text ready">✓ 已准备</span>
                      ) : (
                        <span className="status-text not-ready">未准备</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="actions">
          {isHost ? (
            <button
              className={`btn btn-large ${canStart ? 'btn-start' : 'btn-secondary'}`}
              onClick={handleStartGame}
              disabled={!canStart}
            >
              {state.players.length < 2
                ? '⏳ 等待更多玩家...'
                : canStart
                ? '🎮 开始游戏'
                : '⏳ 等待其他玩家准备...'}
            </button>
          ) : (
            <button
              className={`btn btn-large ${isReady ? 'btn-cancel' : 'btn-ready'}`}
              onClick={handleReady}
            >
              {isReady ? '✓ 已准备（点击取消）' : '🙋 准备'}
            </button>
          )}
        </div>

        {/* 提示 */}
        <div className="tips">
          <p>💡 游戏提示</p>
          <ul>
            <li>将房间号分享给朋友，邀请他们加入</li>
            <li>所有非房主玩家准备后，房主可开始游戏</li>
            <li>游戏需要 2～4 名玩家</li>
          </ul>
        </div>

      </div>
    </div>
  )
}