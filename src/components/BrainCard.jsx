import { motion, useMotionValue } from 'framer-motion'
import { useEffect } from 'react'
import useStore from '../store/useStore'

function seeded(id, salt) {
  const v = Math.sin(id * 9301 + salt * 49297) * 10000
  return v - Math.floor(v)
}

export default function BrainCard({ item, onDragEnd, dragConstraints }) {
  const removeItem = useStore((s) => s.removeItem)
  const updatePosition = useStore((s) => s.updatePosition)

  // Motion values carry the position. FM accumulates drag deltas directly into
  // them, so CSS `left`/`top` stays fixed and there is no double-offset.
  const x = useMotionValue(item.position?.x ?? 0)
  const y = useMotionValue(item.position?.y ?? 0)
  const cardRotate = (seeded(item.id, 2) - 0.5) * 10 // ±5deg, consistent per card

  // Sync if the position is changed externally (e.g. store reset).
  useEffect(() => {
    x.set(item.position?.x ?? 0)
    y.set(item.position?.y ?? 0)
  }, [item.position?.x, item.position?.y]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={dragConstraints}
      dragElastic={0}
      onDragEnd={(event, info) => {
        if (onDragEnd) {
          onDragEnd(event, info, item)
        } else {
          updatePosition(item.id, { x: x.get(), y: y.get() })
        }
      }}
      initial={{ opacity: 0, scale: 0.8, rotate: 0 }}
      animate={{ opacity: 1, scale: 1, rotate: cardRotate }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileDrag={{ zIndex: 50, scale: 1.05, rotate: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
      className="absolute rounded-xl shadow-sm p-3 text-sm text-gray-700 cursor-grab active:cursor-grabbing select-none"
      style={{
        width: '140px',
        minHeight: '60px',
        zIndex: 10,
        left: '50%',
        top: '50%',
        marginLeft: '-70px',
        marginTop: '-30px',
        backgroundColor: item.color ?? '#DBEAFE',
        pointerEvents: 'auto',
        x,
        y,
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          removeItem(item.id)
        }}
        className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-600 transition-colors"
        style={{
          border: 'none',
          cursor: 'pointer',
          fontSize: '9px',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
      <p className="pr-5 break-words leading-snug">{item.text}</p>
    </motion.div>
  )
}
