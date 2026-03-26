import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'
import { ROOM_CREATE, ROOM_JOIN } from '@catan/shared'
import type { RoomCreateReq, RoomJoinReq, StateSyncPayload } from '@catan/shared'

export default function HomePage() {
  const navigate = useNavigate()
  const [playerName, setPlayerName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')

  function handleCreateRoom() {
    if (!playerName.trim()) {
      setError('请输入玩家名称')
      return
    }

    const payload: RoomCreateReq = { name: playerName.trim() }
    socket.emit(ROOM_CREATE, payload, (response: StateSyncPayload) => {
      navigate(/room/+response.state.roomId, { state: response })
    })
  }

  function handleJoinRoom() {
    if (!playerName.trim()) {
      setError('请输入玩家名称')
      return
    }
    if (!roomId.trim()) {
      setError('请输入房间号')
      return
    }

    const payload: RoomJoinReq = {
      roomId: roomId.trim(),
      name: playerName.trim()
    }

    socket.emit(ROOM_JOIN, payload, (response: StateSyncPayload | { error: string }) => {
      if ('error' in response) {
        setError(response.error)
        setTimeout(() => setError(''), 3000)
      } else {
        navigate(/room/+roomId.trim(), { state: response })
      }
    })
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'sans-serif', padding: 20 }}>
      <h1 style={{ textAlign: 'center' }}>🏝️ 卡坦岛在线</h1>
      
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>玩家名称</label>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="输入你的名字"
          style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>

      <button
        onClick={handleCreateRoom}
        style={{
          width: '100%',
          padding: 12,
          fontSize: 16,
          background: '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer',
          marginBottom: 20
        }}
      >
        🎮 创建房间
      </button>

      <hr style={{ margin: '30px 0' }} />

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>房间号</label>
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="输入房间号"
          style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 4, border: '1px solid #ccc' }}
        />
      </div>

      <button
        onClick={handleJoinRoom}
        style={{
          width: '100%',
          padding: 12,
          fontSize: 16,
          background: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: 4,
          cursor: 'pointer'
        }}
      >
        🚪 加入房间
      </button>

      {error && (
        <div style={{ marginTop: 20, padding: 10, background: '#f8d7da', color: '#721c24', borderRadius: 4 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}
