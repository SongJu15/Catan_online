import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import socket from '../socket'
import { ROOM_CREATE, ROOM_JOIN, STATE_SYNC, ROOM_ERROR } from '@catan/shared'
import type { StateSyncPayload, RoomErrorPayload } from '@catan/shared'

export default function HomePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleCreate() {
    if (!name.trim()) return setError('请输入你的名字')
    setError('')
    setLoading(true)

    socket.connect()

    socket.once(STATE_SYNC, (payload: StateSyncPayload) => {
      setLoading(false)
      navigate(`/room/${payload.roomId}`, { state: payload })
    })

    socket.once(ROOM_ERROR, (payload: RoomErrorPayload) => {
      setLoading(false)
      setError(payload.message)
    })

    socket.emit(ROOM_CREATE, { name: name.trim() })
  }

  function handleJoin() {
    if (!name.trim()) return setError('请输入你的名字')
    if (!roomId.trim()) return setError('请输入房间号')
    setError('')
    setLoading(true)

    socket.connect()

    socket.once(STATE_SYNC, (payload: StateSyncPayload) => {
      setLoading(false)
      navigate(`/room/${payload.roomId}`, { state: payload })
    })

    socket.once(ROOM_ERROR, (payload: RoomErrorPayload) => {
      setLoading(false)
      setError(payload.message)
    })

    socket.emit(ROOM_JOIN, { roomId: roomId.trim(), name: name.trim() })
  }

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', fontFamily: 'sans-serif' }}>
      <h1>🏝️ 卡坦岛 Online</h1>

      <div style={{ marginBottom: 16 }}>
        <label>你的名字</label>
        <br />
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="输入名字"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </div>

      <button
        onClick={handleCreate}
        disabled={loading}
        style={{ width: '100%', padding: 10, marginBottom: 12, cursor: 'pointer' }}
      >
        {loading ? '连接中...' : '🆕 创建房间'}
      </button>

      <hr />

      <div style={{ marginTop: 12, marginBottom: 8 }}>
        <label>房间号</label>
        <br />
        <input
          value={roomId}
          onChange={e => setRoomId(e.target.value)}
          placeholder="输入房间号"
          style={{ width: '100%', padding: 8, marginTop: 4 }}
        />
      </div>

      <button
        onClick={handleJoin}
        disabled={loading}
        style={{ width: '100%', padding: 10, cursor: 'pointer' }}
      >
        {loading ? '连接中...' : '🚪 加入房间'}
      </button>

      {error && (
        <p style={{ color: 'red', marginTop: 12 }}>{error}</p>
      )}
    </div>
  )
}
