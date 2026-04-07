import { useState, useEffect } from 'react'
import type { DevCardType } from '@catan/shared'

const DEV_CARD_LABELS: Record<DevCardType, string> = {
  knight: '⚔️ 骑士',
  victory_point: '🏆 分数',
  road_building: '🛣️ 道路建设',
  monopoly: '💰 资源垄断',
  year_of_plenty: '🌟 资源丰收',
}

// ✅ 新增：映射到你设计的精美图片路径
const DEV_CARD_IMAGES: Record<DevCardType, string> = {
  knight: '/发展卡/骑士卡.png',
  victory_point: '/发展卡/得分卡.png',
  road_building: '/发展卡/道路建设.png',
  monopoly: '/发展卡/资源垄断.png',
  year_of_plenty: '/发展卡/丰收年.png',
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
  const radius = 480 // 稍微加大半径适应更大的卡牌

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
        offsetX += dir * 20
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
    // 外层：半透明遮罩 (加深一点，突出中间的高级感)
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)',
    }}>
      {/* 内层：居中弹窗 —— 改为复古暗色皮革/实木质感渐变 */}
      <div style={{
        background: 'radial-gradient(circle at 50% 0%, #3a2a20 0%, #140d0a 100%)',
        borderRadius: 20,
        padding: '24px 24px 32px',
        width: 760,
        maxWidth: '95vw',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.9), inset 0 2px 10px rgba(212,175,55,0.15)',
        border: '1px solid #5c4322', // 暗金色边框
        overflow: 'visible',
      }}>
        <style>{`
          @keyframes devCardFly {
            0%   { transform: translate(var(--sx), var(--sy)) rotate(var(--sr)) scale(1); }
            40%  { transform: translate(0px, -200px) rotate(0deg) scale(1.25); }
            100% { transform: translate(0px, -240px) rotate(0deg) scale(1.35); }
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
          color: '#e8d3a2', // 羊皮纸/淡金色
          fontSize: 22, fontWeight: 'bold',
          textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
          textAlign: 'center',
          marginBottom: 16,
          letterSpacing: 1,
        }}>
          {selectedPos === null
            ? `🎴 抽取发展卡（剩余 ${totalCards} 张）`
            : revealed
              ? '🎉 命运的指引...'
              : '⏳ 正在揭晓...'}
        </div>

        {/* 扇形牌区 */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 340, // 稍微加高，适应更大的卡牌
          perspective: 1500,
          overflow: 'visible',
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
                  width: 120, height: 175, marginLeft: -60, // 放大卡牌尺寸
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
                width: 120, height: 175, marginLeft: -60,
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
                {/* 牌面（翻转后显示真实的图片） */}
                {revealedCard && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    borderRadius: 10, // 配合图片的圆角
                    overflow: 'hidden', // 裁剪掉直角
                    boxShadow: '0 15px 40px rgba(0,0,0,0.8), 0 0 30px rgba(212,175,55,0.5)', // 金色发光效果
                    background: '#2a1f1a', // 图片未加载时的底色
                  }}>
                    <img 
                      src={DEV_CARD_IMAGES[revealedCard]} 
                      alt={DEV_CARD_LABELS[revealedCard]} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                    />
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
            background: 'linear-gradient(180deg, rgba(40,30,20,0.9) 0%, rgba(20,15,10,0.9) 100%)',
            border: '1px solid #d4af37', // 香槟金边框
            borderRadius: 14, padding: '16px 32px',
            textAlign: 'center', color: '#e8d3a2',
            width: '100%',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(212,175,55,0.15)',
          }}>
            <div style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 8, color: '#d4af37', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              {DEV_CARD_LABELS[revealedCard]}
            </div>
            <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 16, lineHeight: 1.6 }}>
              {DEV_CARD_DESC[revealedCard]}
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '10px 40px', fontSize: 16,
                background: 'linear-gradient(135deg, #d4af37 0%, #aa7c11 100%)', // 金色渐变按钮
                color: '#1a1210', // 深色文字对比强烈
                border: 'none', borderRadius: 8,
                cursor: 'pointer', fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.4)',
                textShadow: '0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              收下卡牌
            </button>
          </div>
        )}

        {/* 等待服务器响应提示 */}
        {selectedPos !== null && !revealed && (
          <div style={{
            marginTop: 16,
            color: 'rgba(212,175,55,0.6)', fontSize: 14,
          }}>
            ⏳ 命运的齿轮正在转动...
          </div>
        )}

        {/* 取消按钮（未选牌时显示） */}
        {selectedPos === null && !isWaiting && (
          <button
            onClick={onClose}
            style={{
              marginTop: 16,
              padding: '10px 36px', fontSize: 15,
              background: 'transparent', color: '#d4af37',
              border: '1px solid #d4af37', borderRadius: 8,
              cursor: 'pointer', fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(212,175,55,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            暂不抽取
          </button>
        )}

      </div>
    </div>
  )
}

/** 卡背组件：替换为真实的卡背图片 */
function CardBack({ highlighted = false }: { highlighted?: boolean }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      borderRadius: 10, // 配合图片的圆角
      overflow: 'hidden',
      background: '#2a1f1a',
      boxShadow: highlighted
        ? '0 0 20px 4px rgba(212,175,55,0.6)' // 选中时发金光
        : '0 4px 16px rgba(0,0,0,0.6)',
      transition: 'box-shadow 0.3s',
    }}>
      <img 
        src="/发展卡/发展卡.png" 
        alt="卡背" 
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
      />
    </div>
  )
}
