import { useState } from 'react'
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

interface Props {
  onSelect: (cardType: DevCardType) => void
  onClose: () => void
  remainingCards: DevCardType[]
}

interface CardState {
  originalIndex: number
  displayIndex: number
  isSelected: boolean
  isFlipping: boolean
}

export default function DevCardDeck({ onSelect, onClose, remainingCards }: Props) {
  const totalCards = remainingCards.length
  const [cards, setCards] = useState<CardState[]>(
    remainingCards.map((_, i) => ({
      originalIndex: i,
      displayIndex: i,
      isSelected: false,
      isFlipping: false,
    }))
  )
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [selectedCard, setSelectedCard] = useState<number | null>(null)

  // 计算扇形参数
  const fanAngle = Math.min(90, totalCards * 4)
  const startAngle = -fanAngle / 2
  const radius = 450

  const getCardTransform = (index: number, isHovered: boolean, currentTotal: number) => {
    const currentAngleStep = currentTotal > 1 ? fanAngle / (currentTotal - 1) : 0
    const angle = startAngle + index * currentAngleStep
    const rad = (angle * Math.PI) / 180
    const x = radius * Math.sin(rad)
    const y = -radius * (1 - Math.cos(rad))

    let offsetX = 0
    let offsetY = 0

    if (isHovered) {
      offsetX = 30 * Math.sin(rad)
      offsetY = -30 * Math.cos(rad)
    }

    // 相邻卡片散开
    if (hoveredIndex !== null && !isHovered) {
      const distance = Math.abs(index - hoveredIndex)
      if (distance === 1) {
        const direction = index > hoveredIndex ? 1 : -1
        const spreadRad = rad + direction * 0.15
        offsetX = 25 * Math.sin(spreadRad) * direction
        offsetY = -25 * Math.cos(spreadRad)
      }
    }

    return {
      x: x + offsetX,
      y: y + offsetY,
      rotation: angle,
    }
  }

  const handleCardClick = (displayIndex: number) => {
    if (selectedCard !== null) return

    const card = cards[displayIndex]
    const originalIndex = card.originalIndex

    setSelectedCard(displayIndex)

    // 标记为选中和翻转
    setCards(prev =>
      prev.map((c, i) =>
        i === displayIndex
          ? { ...c, isSelected: true, isFlipping: true }
          : c
      )
    )

    // 600ms 后获取卡片类型并回调
    setTimeout(() => {
      const cardType = remainingCards[originalIndex]
      onSelect(cardType)

      // 再等 800ms 让玩家看清卡面
      setTimeout(() => {
        onClose()
      }, 800)
    }, 600)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #1a2a3a 0%, #2c3e50 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        zIndex: 9999,
        paddingBottom: '80px',
      }}
    >
      {/* 标题 */}
      <div
        style={{
          position: 'absolute',
          top: '40px',
          color: '#fff',
          fontSize: '32px',
          fontWeight: 'bold',
          textShadow: '2px 2px 8px rgba(0,0,0,0.5)',
        }}
      >
        📜 选择一张发展卡 ({totalCards}/25)
      </div>

      {/* 卡片扇形区域 */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '400px',
          perspective: '1500px',
        }}
      >
        {cards.map((card, displayIndex) => {
          const { x, y, rotation } = getCardTransform(
            displayIndex,
            hoveredIndex === displayIndex,
            cards.length
          )
          const cardType = remainingCards[card.originalIndex]
          const isHovered = hoveredIndex === displayIndex

          return (
            <div
              key={card.originalIndex}
              onMouseEnter={() => !card.isSelected && setHoveredIndex(displayIndex)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => handleCardClick(displayIndex)}
              style={{
                position: 'absolute',
                left: '50%',
                bottom: '0',
                width: '120px',
                height: '170px',
                marginLeft: '-60px',
                transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) ${
                  isHovered ? 'scale(1.15)' : 'scale(1)'
                }`,
                transformOrigin: 'center bottom',
                transition: card.isSelected
                  ? 'none'
                  : 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                cursor: card.isSelected ? 'default' : 'pointer',
                zIndex: isHovered ? 100 : displayIndex,
                pointerEvents: card.isSelected ? 'none' : 'auto',
                animation: card.isSelected
                  ? 'cardSelect 1s cubic-bezier(0.4, 0, 0.2, 1) forwards'
                  : 'none',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: card.isFlipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* 卡背 */}
                <div
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '12px',
                    border: '3px solid #fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  📜
                </div>

                {/* 卡面 */}
                <div
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    backfaceVisibility: 'hidden',
                    background: DEV_CARD_COLORS[cardType],
                    borderRadius: '12px',
                    border: '4px solid #ffd700',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px',
                    boxShadow: '0 12px 32px rgba(255,215,0,0.6)',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>
                    {DEV_CARD_LABELS[cardType].split(' ')[0]}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: '#fff',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                      lineHeight: 1.3,
                    }}
                  >
                    {DEV_CARD_LABELS[cardType].split(' ').slice(1).join(' ')}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 取消按钮 */}
      {selectedCard === null && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            bottom: '30px',
            padding: '14px 40px',
            fontSize: '18px',
            background: '#e74c3c',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 'bold',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
          }}
        >
          取消
        </button>
      )}

      <style>{`
        @keyframes cardSelect {
          0% {
            transform: translate(var(--start-x), var(--start-y)) rotate(var(--start-rotation)) scale(1.15);
          }
          30% {
            transform: translate(0, -200px) rotate(0deg) scale(1.2);
          }
          100% {
            transform: translate(0, -250px) rotate(0deg) scale(1.3);
          }
        }
      `}</style>
    </div>
  )
}
