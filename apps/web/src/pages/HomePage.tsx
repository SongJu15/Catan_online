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
    if (!playerName.trim()) { setError('请输入玩家名称'); return }
    const payload: RoomCreateReq = { name: playerName.trim() }
    socket.emit(ROOM_CREATE, payload, (response: StateSyncPayload) => {
      navigate(`/room/` + response.state.roomId, { state: response })
    })
  }

  function handleJoinRoom() {
    if (!playerName.trim()) { setError('请输入玩家名称'); return }
    if (!roomId.trim()) { setError('请输入房间号'); return }
    const payload: RoomJoinReq = { roomId: roomId.trim(), name: playerName.trim() }
    socket.emit(ROOM_JOIN, payload, (response: StateSyncPayload | { error: string }) => {
      if ('error' in response) {
        setError(response.error)
        setTimeout(() => setError(''), 3000)
      } else {
        navigate(`/room/` + roomId.trim(), { state: response })
      }
    })
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap');

        .home-bg {
          min-height: 100vh;
          width: 100%;
          background-image: url('/background.png');
          background-size: cover;
          background-position: center;
          background-attachment: fixed;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding-top: 60px;
          position: relative;
        }

        .home-bg::before {
          content: '';
          position: fixed;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0,0,0,0.2) 0%,
            rgba(10,20,40,0.4) 100%
          );
          z-index: 0;
        }

        /* ── 立体标题 ── */
        .catan-title-wrap {
          position: relative;
          z-index: 1;
          text-align: center;
          margin-bottom: 48px;
          animation: titleFloat 3.5s ease-in-out infinite;
        }

        .catan-title {
          font-family: 'Cinzel', 'Noto Serif SC', serif;
          font-size: clamp(64px, 10vw, 110px);
          font-weight: 900;
          letter-spacing: 0.12em;
          color: #ffe97a;
          /* 多层 text-shadow 制造立体感 */
          text-shadow:
            0px 1px 0px #c9952a,
            0px 2px 0px #b8841f,
            0px 3px 0px #a07318,
            0px 4px 0px #8e6210,
            0px 5px 0px #7c5208,
            0px 6px 0px #6a4200,
            2px 8px 6px rgba(0,0,0,0.6),
            4px 14px 20px rgba(0,0,0,0.4),
            0 0 40px rgba(255,220,80,0.5),
            0 0 80px rgba(255,180,30,0.25);
          -webkit-text-stroke: 1px rgba(200,140,20,0.4);
          line-height: 1;
          user-select: none;
        }

        .catan-subtitle {
          font-family: 'Cinzel', serif;
          font-size: clamp(14px, 2vw, 20px);
          color: rgba(255, 230, 150, 0.75);
          letter-spacing: 0.35em;
          margin-top: 10px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }

        @keyframes titleFloat {
          0%, 100% { transform: translateY(0px) rotate(-0.3deg); }
          50%       { transform: translateY(-10px) rotate(0.3deg); }
        }

        /* ── 卡片 ── */
        .home-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          background: rgba(20, 40, 70, 0.3);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 210, 80, 0.25);
          border-radius: 20px;
          padding: 36px 32px;
          box-shadow:
            0 8px 40px rgba(0,0,0,0.55),
            inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .home-card-divider {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.12);
          margin: 24px 0;
        }

        .home-label {
          display: block;
          margin-bottom: 8px;
          font-weight: 600;
          font-size: 13px;
          letter-spacing: 0.08em;
          color: rgba(255, 220, 130, 0.85);
          text-transform: uppercase;
        }

        .home-input {
          width: 100%;
          padding: 11px 14px;
          font-size: 15px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08);
          color: #fff;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .home-input::placeholder { color: rgba(255,255,255,0.35); }
        .home-input:focus {
          border-color: rgba(255, 210, 80, 0.6);
          box-shadow: 0 0 0 3px rgba(255, 210, 80, 0.15);
        }

        .home-btn {
          width: 100%;
          padding: 13px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
          letter-spacing: 0.05em;
        }
        .home-btn:hover {
          transform: translateY(-2px);
          filter: brightness(1.1);
        }
        .home-btn:active { transform: translateY(0); }

        .home-btn-create {
          background: linear-gradient(135deg, #2ecc71, #27ae60);
          color: #fff;
          box-shadow: 0 4px 16px rgba(39,174,96,0.4);
          margin-top: 14px;
        }

        .home-btn-join {
          background: linear-gradient(135deg, #3498db, #2980b9);
          color: #fff;
          box-shadow: 0 4px 16px rgba(41,128,185,0.4);
          margin-top: 14px;
        }

        .home-error {
          margin-top: 16px;
          padding: 10px 14px;
          background: rgba(220, 38, 38, 0.25);
          border: 1px solid rgba(220,38,38,0.5);
          color: #fca5a5;
          border-radius: 8px;
          font-size: 14px;
        }
      `}</style>

      <div className="home-bg">
        {/* 立体动态标题 */}
        <div className="catan-title-wrap">
          <div className="catan-title">卡坦岛</div>
          <div className="catan-subtitle">CATAN · ONLINE</div>
        </div>

        {/* 表单卡片 */}
        <div className="home-card">
          {/* 玩家名称 */}
          <div style={{ marginBottom: 16 }}>
            <label className="home-label">玩家名称</label>
            <input
              className="home-input"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="输入你的名字"
            />
          </div>

          <button className="home-btn home-btn-create" onClick={handleCreateRoom}>
            🎮 创建房间
          </button>

          <hr className="home-card-divider" />

          {/* 房间号 */}
          <div style={{ marginBottom: 0 }}>
            <label className="home-label">房间号</label>
            <input
              className="home-input"
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="输入房间号"
            />
          </div>

          <button className="home-btn home-btn-join" onClick={handleJoinRoom}>
            🚪 加入房间
          </button>

          {error && (
            <div className="home-error">⚠️ {error}</div>
          )}
        </div>
      </div>
    </>
  )
}