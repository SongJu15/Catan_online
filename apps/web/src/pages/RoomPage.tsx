import { useEffect, useState } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'
import { STATE_SYNC, PLAYER_READY, GAME_START } from '@catan/shared'
import type { StateSyncPayload } from '@catan/shared'

export default function RoomPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [syncData, setSyncData] = useState<StateSyncPayload | null>(
    (location.state as StateSyncPayload) ?? null
  )

  useEffect(() => {
    // 持续监听状态更新
    socket.on(STATE_SYNC, (payload: StateSyncPayload) => {
      setSyncData(payload)
      
      // 🔥 新增：检测游戏开始，跳转到游戏界面
      if (payload.state.phase !== 'lobby') {
        console.log('🎮 游戏开始！阶段:', payload.state.phase)
        navigate(/game/+id, { state: payload })
      }
    })

    // 如果直接访问此页面（没有 state），跳回首页
    if (!syncData) {
      navigate('/')
    }

    return () => {
      socket.off(STATE_SYNC)
    }
  }, [])

  if (!syncData) return null

  const { you, state } = syncData

  // 判断是否为房主
  const isHost = state.hostPlayerId === you.playerId

  // 判断所有其他玩家是否都准备好了
  const allOthersReady = state.players
    .filter(p => p.playerId !== state.hostPlayerId)
    .every(p => p.isReady)

  // 当前玩家的准备状态
  const currentPlayer = state.players.find(p => p.playerId === you.playerId)
  const isReady = currentPlayer?.isReady || false

  // 处理准备按钮
  const handleReady = () => {
    socket.emit(PLAYER_READY, { roomId: id, ready: !isReady })
  }

  // 处理开始游戏
  const handleStartGame = () => {
    socket.emit(GAME_START, { roomId: id })
  }

  return (
    <div style={{ maxWidth: 500, margin: '60px auto', fontFamily: 'sans-serif' }}>
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
              background: player.playerId === you.playerId ? '#d4edda' : '#fff',
              border: '1px solid #ddd',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              {player.playerId === state.hostPlayerId && '👑 '}
              {player.name}
              {player.playerId === you.playerId && ' （你）'}
            </span>
            {player.playerId !== state.hostPlayerId && player.isReady && (
              <span style={{ color: '#28a745', fontWeight: 'bold' }}>✓ 已准备</span>
            )}
          </li>
        ))}
      </ul>

      {/* 房主显示开始游戏按钮 */}
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

      {/* 非房主显示准备按钮 */}
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
