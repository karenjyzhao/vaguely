import { useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import BrainInput from './BrainInput'
import BrainCard from './BrainCard'
import useStore from '../store/useStore'

export default function BrainstormCanvas() {
  const allItems = useStore((s) => s.items ?? [])
  const items = allItems.filter((i) => !i.scheduled)
  const canvasRef = useRef(null)

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-full overflow-hidden"
      style={{ minHeight: 'calc(100vh - 64px)' }}
    >
      {/* Centered input */}
      <div
        className="absolute left-1/2 top-1/2 z-20"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <BrainInput />
      </div>

      {/* Floating cards */}
      <AnimatePresence>
        {items.map((item) => (
          <BrainCard
            key={item.id}
            item={item}
            dragConstraints={canvasRef}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
