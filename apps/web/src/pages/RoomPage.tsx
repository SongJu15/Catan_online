import { useEffect, useState } from 'react'
import { useLocation, useParams, useNavigate } from 'react-router-dom'
import socket from '../socket'
import { STATE_SYNC } from '@catan/shared'
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
        {state.players.map(player => (
          <li
            key={player.playerId}
            style={{
              padding: '10px 16px',
              marginBottom: 8,
              background: player.playerId === you.playerId ? '#d4edda' : '#fff',
              border: '1px solid #ddd',
              borderRadius: 6,
            }}
          >
            {player.name}
            {player.playerId === you.playerId && ' （你）'}
          </li>
        ))}
      </ul>

      <p style={{ color: '#888', marginTop: 24 }}>等待其他玩家加入...</p>
    </div>
  )
}
