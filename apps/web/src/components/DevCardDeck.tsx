import { useState, useEffect } from 'react'
import type { DevCardType } from '@catan/shared'

const DEV_CARD_LABELS: Record<DevCardType, string> = {
  knight: '⚔️ 骑士',
  victory_point: '🏆 分数',
  road_building: '🛣️ 道路建设',
  monopoly: '💰 资源垄断',
  year_of_plenty: '🌟 资源丰收',
}

const DEV_CARD_COLORS: Record<DevCardType, string> = {
  knight: '#e74c3c',
  victory_point: '#f39c12',
  road_building: '#8e44ad',
  monopoly: '#16a085',
  year_of_plenty: '#2980b9',
}

const DEV_CARD_DESC: Record<DevCardType, string> = {
  knight: '移动强盗并可抢劫一名玩家',
  victory_point: '立即获得1个胜利点（自动生效）',
  road_building: '免费建造2条道路',
  year_of_plenty: '从银行获取任意2种资源',
  monopoly: '宣布一种资源，所有玩家将该资源全给你',
}

interface Props {
  cardCount: number
  revealedCard: DevCardType | null
  isWaiting: boolean
  onClose: () => void
}

export default function DevCardDeck({ cardCount, revealedCard, isWaiting, onClose }: Props) {
  const totalCards = Math.max(cardCount, 1)

  const [selectedPos, setSelectedPos] = useState<number | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (revealedCard && selectedPos !== null) {
      const timer = setTimeout(() => setRevealed(true), 700)
      return () => clearTimeout(timer)
    }
  }, [revealedCard, selectedPos])

  const fanAngle = Math.min(80, totalCards * 5)
  const radius = 450

  const getCardTransform = (index: number, total: number, isHovered: boolean) => {
    const step = total > 1 ? fanAngle / (total - 1) : 0
    const angle = -fanAngle / 2 + index * step
    const rad = (angle * Math.PI) / 180
    const x = radius * Math.sin(rad)
    const y = -radius * (1 - Math.cos(rad))

    let offsetX = 0
    let offsetY = 0
    if (isHovered) {
      offsetX = 30 * Math.sin(rad)
      offsetY = -30 * Math.cos(rad)
    }
    if (hoveredIndex !== null && !isHovered) {
      const dist = Math.abs(index - hoveredIndex)
      if (dist === 1) {
        const dir = index > hoveredIndex ? 1 : -1
        offsetX += dir * 18
      }
    }
    return { x: x + offsetX, y: y + offsetY, rotation: angle }
  }

  const handleCardClick = (index: number) => {
    if (selectedPos !== null) return
    setSelectedPos(index)
    setHoveredIndex(null)
  }

  const selectedTransform = selectedPos !== null
    ? getCardTransform(selectedPos, totalCards, false)
    : null

  return (
    // 外层：半透明遮罩
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      {/* 内层：居中弹窗 —— 宽度改大，overflow visible */}
      <div style={{
        background: 'linear-gradient(135deg, #1a2a3a 0%, #2c3e50 100%)',
        borderRadius: 20,
        padding: '24px 24px 32px',
        width: 760,           // ✅ 580 → 760
        maxWidth: '95vw',     // ✅ 90vw → 95vw
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        border: '1px solid rgba(255,255,255,0.1)',
        overflow: 'visible',  // ✅ 新增，允许扇形牌超出弹窗边界
      }}>
        <style>{`
          @keyframes devCardFly {
            0%   { transform: translate(var(--sx), var(--sy)) rotate(var(--sr)) scale(1); }
            40%  { transform: translate(0px, -180px) rotate(0deg) scale(1.25); }
            100% { transform: translate(0px, -220px) rotate(0deg) scale(1.3); }
          }
          @keyframes devCardFlip {
            0%   { transform: rotateY(0deg); }
            100% { transform: rotateY(180deg); }
          }
          @keyframes resultFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* 标题 */}
        <div style={{
          color: '#fff', fontSize: 22, fontWeight: 'bold',
          textShadow: '2px 2px 8px rgba(0,0,0,0.5)',
          textAlign: 'center',
          marginBottom: 16,
        }}>
          {selectedPos === null
            ? `🎴 点击一张牌抽取发展卡（剩余 ${totalCards} 张）`
            : revealed
              ? '🎉 抽卡结果揭晓！'
              : '⏳ 正在确认结果...'}
        </div>

        {/* 扇形牌区 */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 300,
          perspective: 1500,
          overflow: 'visible',  // ✅ 新增，牌可超出此区域
        }}>
          {/* 未选中的背面牌 */}
          {Array.from({ length: totalCards }, (_, i) => {
            if (i === selectedPos) return null
            const displayIndex = selectedPos !== null && i > selectedPos ? i - 1 : i
            const displayTotal = selectedPos !== null ? totalCards - 1 : totalCards
            const isHovered = hoveredIndex === i
            const { x, y, rotation } = getCardTransform(displayIndex, displayTotal, isHovered)

            return (
              <div
                key={i}
                onMouseEnter={() => { if (selectedPos === null) setHoveredIndex(i) }}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => handleCardClick(i)}
                style={{
                  position: 'absolute', left: '50%', bottom: 0,
                  width: 100, height: 145, marginLeft: -50,
                  transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) ${isHovered ? 'scale(1.12)' : 'scale(1)'}`,
                  transformOrigin: 'center bottom',
                  transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                  cursor: selectedPos === null ? 'pointer' : 'default',
                  zIndex: isHovered ? 100 : i,
                }}
              >
                <CardBack />
              </div>
            )
          })}

          {/* 选中的牌（飞起 + 翻牌） */}
          {selectedPos !== null && selectedTransform && (
            <div
              style={{
                position: 'absolute', left: '50%', bottom: 0,
                width: 100, height: 145, marginLeft: -50,
                transformOrigin: 'center bottom',
                zIndex: 200,
                ...({
                  '--sx': `${selectedTransform.x}px`,
                  '--sy': `${selectedTransform.y}px`,
                  '--sr': `${selectedTransform.rotation}deg`,
                } as React.CSSProperties),
                animation: 'devCardFly 0.8s cubic-bezier(0.4,0,0.2,1) forwards',
              }}
            >
              <div style={{
                width: '100%', height: '100%',
                position: 'relative',
                transformStyle: 'preserve-3d',
                animation: revealed ? 'devCardFlip 0.7s 0.1s cubic-bezier(0.4,0,0.2,1) forwards' : undefined,
              }}>
                {/* 牌背 */}
                <div style={{
                  position: 'absolute', inset: 0,
                  backfaceVisibility: 'hidden',
                }}>
                  <CardBack highlighted />
                </div>
                {/* 牌面（翻转后显示） */}
                {revealedCard && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: DEV_CARD_COLORS[revealedCard],
                    borderRadius: 12,
                    border: '4px solid #ffd700',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: 10,
                    boxShadow: '0 12px 32px rgba(255,215,0,0.6)',
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>
                      {DEV_CARD_LABELS[revealedCard].split(' ')[0]}
                    </div>
                    <div style={{
                      fontSize: 12, color: '#fff', textAlign: 'center',
                      fontWeight: 'bold', lineHeight: 1.3,
                    }}>
                      {DEV_CARD_LABELS[revealedCard].split(' ').slice(1).join(' ')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 结果详情卡片 */}
        {revealed && revealedCard && (
          <div style={{
            marginTop: 16,
            animation: 'resultFadeIn 0.5s ease-out',
            background: 'rgba(0,0,0,0.4)',
            border: `2px solid ${DEV_CARD_COLORS[revealedCard]}`,
            borderRadius: 14, padding: '16px 32px',
            textAlign: 'center', color: '#fff',
            width: '100%',
            boxShadow: `0 0 40px ${DEV_CARD_COLORS[revealedCard]}66`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: '#ffd700' }}>
              🎉 恭喜！抽到了
            </div>
            <div style={{
              fontSize: 22, fontWeight: 'bold', marginBottom: 8,
              color: DEV_CARD_COLORS[revealedCard],
            }}>
              {DEV_CARD_LABELS[revealedCard]}
            </div>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16, lineHeight: 1.6 }}>
              {DEV_CARD_DESC[revealedCard]}
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '10px 32px', fontSize: 15,
                background: DEV_CARD_COLORS[revealedCard],
                color: '#fff', border: 'none', borderRadius: 8,
                cursor: 'pointer', fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              收下！
            </button>
          </div>
        )}

        {/* 等待服务器响应提示 */}
        {selectedPos !== null && !revealed && (
          <div style={{
            marginTop: 16,
            color: 'rgba(255,255,255,0.6)', fontSize: 14,
          }}>
            ⏳ 等待服务器确认...
          </div>
        )}

        {/* 取消按钮（未选牌时显示） */}
        {selectedPos === null && !isWaiting && (
          <button
            onClick={onClose}
            style={{
              marginTop: 16,
              padding: '12px 36px', fontSize: 16,
              background: '#e74c3c', color: '#fff',
              border: 'none', borderRadius: 10,
              cursor: 'pointer', fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            取消
          </button>
        )}

      </div>
    </div>
  )
}

/** 卡背组件 */
function CardBack({ highlighted = false }: { highlighted?: boolean }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      borderRadius: 12,
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      border: highlighted ? '3px solid #ffd700' : '3px solid rgba(255,255,255,0.4)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      boxShadow: highlighted
        ? '0 8px 30px rgba(255,215,0,0.4)'
        : '0 4px 16px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: 36 }}>🎴</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: 6, fontWeight: 'bold' }}>
        卡坦岛
      </div>
    </div>
  )
}