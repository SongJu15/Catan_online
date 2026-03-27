import { useEffect, useState } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'
import { STATE_SYNC, PLAYER_READY, GAME_START } from '@catan/shared'
import type { StateSyncPayload } from '@catan/shared'

// ✅ 重连逻辑：抽成独立函数，挂载时和 connect 事件都能调用
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
      // ✅ 根据游戏阶段决定跳转到哪个页面
      if (resp.state.phase !== 'lobby') {
        navigate(`/game/${savedRoomId}`, { state: resp })
      }
    }
  )
}

export default function RoomPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()

  const [syncData, setSyncData] = useState<StateSyncPayload | null>(
    (location.state as StateSyncPayload) ?? null
  )
  const [isConnected, setIsConnected] = useState(socket.connected)

  useEffect(() => {
    // ✅ 修复：没有 state 时，先尝试从 sessionStorage 重连，而不是直接跳回首页
    if (!syncData) {
      if (socket.connected) {
        // socket 已连接，直接尝试重连
        tryReconnect(navigate, setSyncData, setIsConnected)
      }
      // 如果 socket 还没连接，等 connect 事件触发后再重连（见下面的 handleConnect）
    } else {
      // 正常进入房间，存身份到 sessionStorage
      sessionStorage.setItem('catan_room_id', id!)
      sessionStorage.setItem('catan_player_id', syncData.you.playerId)
    }

    const handleStateSync = (payload: StateSyncPayload) => {
      setSyncData(payload)
      if (payload.state.phase !== 'lobby') {
        console.log('🎮 游戏开始！阶段:', payload.state.phase)
        navigate(`/game/${id}`, { state: payload })
      }
    }

    const handleDisconnect = () => {
      setIsConnected(false)
    }

    // ✅ 修复：connect 事件用于 socket 断线重连后恢复身份
    //    刷新页面时 socket 已经是 connected，不会走这里
    //    断线重连后才会走这里
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

  // ✅ 修复：重连中时显示加载状态，而不是直接返回 null
  if (!syncData) {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <p>⏳ 正在重连中...</p>
      </div>
    )
  }

  const { you, state } = syncData
  const isHost = state.hostPlayerId === you.playerId
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

  return (
    <div style={{ maxWidth: 500, margin: '60px auto', fontFamily: 'sans-serif' }}>

      {/* ✅ 断线提示横幅 */}
      {!isConnected && (
        <div style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: 6,
          padding: '10px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>⚠️</span>
          <span>网络连接断开，正在尝试重连...</span>
        </div>
      )}

      <h1>🏝️ 房间大厅</h1>

      <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 24 }}>
        <p>房间号：<strong>{id}</strong></p>
        <p>你的 ID：<strong>{you.playerId}</strong></p>
        <p>状态：<strong>{state.phase}</strong></p>
      </div>

      <h2>👥 玩家列表（{state.players.length} 人）</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {state.players.map((player) => (
          <li
            key={player.playerId}
            style={{
              padding: '10px 16px',
              marginBottom: 8,
              background: !player.isOnline
                ? '#f8d7da'
                : player.playerId === you.playerId ? '#d4edda' : '#fff',
              border: '1px solid #ddd',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: player.isOnline ? 1 : 0.6,
            }}
          >
            <span>
              {player.playerId === state.hostPlayerId && '👑 '}
              {player.name}
              {player.playerId === you.playerId && ' （你）'}
              {!player.isOnline && ' 🔴 离线中...'}
            </span>
            {player.playerId !== state.hostPlayerId && player.isReady && player.isOnline && (
              <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ 已准备</span>
            )}
          </li>
        ))}
      </ul>

      {isHost && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={handleStartGame}
            disabled={!allOthersReady || state.players.length < 2}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              color: '#fff',
              background: allOthersReady && state.players.length >= 2 ? '#28a745' : '#6c757d',
              border: 'none',
              borderRadius: 6,
              cursor: allOthersReady && state.players.length >= 2 ? 'pointer' : 'not-allowed',
            }}
          >
            {state.players.length < 2
              ? '等待更多玩家...'
              : allOthersReady
              ? '🎮 开始游戏'
              : '等待其他玩家准备...'}
          </button>
        </div>
      )}

      {!isHost && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={handleReady}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 'bold',
              color: '#fff',
              background: isReady ? '#ffc107' : '#007bff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {isReady ? '✓ 已准备（点击取消）' : '准备'}
          </button>
        </div>
      )}
    </div>
  )
}