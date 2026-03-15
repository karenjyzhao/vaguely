import { useRef, useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import useStore from '../store/useStore'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const START_HOUR = 7
const END_HOUR = 22
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const CELL_HEIGHT = 40 // px — must match the rendered row height

function formatHour(h) {
  if (h === 12) return '12 PM'
  if (h > 12) return `${h - 12} PM`
  return `${h} AM`
}

// A scheduled card inside the calendar grid.
// Uses raw pointer events for both body-drag and resize so the two
// interactions never conflict with each other.
function ScheduledCard({ item, cellRefs, containerRef, onDragStart, onDragEnd, onDragMove }) {
  const scheduleItem = useStore((s) => s.scheduleItem)
  const unscheduleItem = useStore((s) => s.unscheduleItem)
  const removeItem = useStore((s) => s.removeItem)
  const resizeScheduledItem = useStore((s) => s.resizeScheduledItem)
  const updatePosition = useStore((s) => s.updatePosition)

  const duration = item.scheduled.duration ?? 1
  const baseHeight = duration * CELL_HEIGHT

  // Live visual state during interactions (not committed to store yet)
  const [dragDelta, setDragDelta] = useState(null)   // {x, y} while body-dragging
  const [resizePx, setResizePx] = useState(null)     // {topOffset, height} while resizing

  const isDragging = dragDelta !== null
  const topOffset = resizePx?.topOffset ?? 0
  const height = resizePx?.height ?? (baseHeight - 2)

  // Use refs for the drag callbacks so the pointermove closure never goes stale
  const onDragStartRef = useRef(onDragStart)
  const onDragEndRef = useRef(onDragEnd)
  const onDragMoveRef = useRef(onDragMove)
  useEffect(() => {
    onDragStartRef.current = onDragStart
    onDragEndRef.current = onDragEnd
    onDragMoveRef.current = onDragMove
  }, [onDragStart, onDragEnd, onDragMove])

  // ── Body drag (move / unschedule) ─────────────────────────────────────────
  const onBodyPointerDown = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    onDragStartRef.current?.()

    const onMove = (me) => {
      setDragDelta({ x: me.clientX - startX, y: me.clientY - startY })
      onDragMoveRef.current?.(me.clientX, me.clientY)
    }

    const onUp = (me) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragDelta(null)
      onDragEndRef.current?.()

      const dropX = me.clientX
      const dropY = me.clientY
      let dropped = false

      for (const [key, ref] of Object.entries(cellRefs.current)) {
        if (!ref) continue
        const rect = ref.getBoundingClientRect()
        if (dropX >= rect.left && dropX <= rect.right && dropY >= rect.top && dropY <= rect.bottom) {
          const [day, hourStr] = key.split('_')
          scheduleItem(item.id, day, parseInt(hourStr, 10), duration)
          dropped = true
          break
        }
      }

      if (!dropped) {
        const cr = containerRef.current.getBoundingClientRect()
        updatePosition(item.id, {
          x: dropX - (cr.left + cr.width / 2),
          y: dropY - (cr.top + cr.height / 2),
        })
        unscheduleItem(item.id)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [item, duration, cellRefs, containerRef, scheduleItem, unscheduleItem, updatePosition])

  // ── Top resize handle ─────────────────────────────────────────────────────
  const onTopPointerDown = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
    const startY = e.clientY
    const maxUp = (item.scheduled.hour - START_HOUR) * CELL_HEIGHT
    const maxDown = (duration - 1) * CELL_HEIGHT

    const onMove = (me) => {
      const delta = me.clientY - startY
      const clamped = Math.max(-maxUp, Math.min(maxDown, delta))
      setResizePx({ topOffset: clamped, height: baseHeight - clamped - 2 })
    }

    const onUp = (me) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizePx(null)
      const deltaHours = Math.round((me.clientY - startY) / CELL_HEIGHT)
      const newHour = Math.max(
        START_HOUR,
        Math.min(item.scheduled.hour + deltaHours, item.scheduled.hour + duration - 1)
      )
      const newDuration = Math.max(1, duration - (newHour - item.scheduled.hour))
      resizeScheduledItem(item.id, newHour, newDuration)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [item, duration, baseHeight, resizeScheduledItem])

  // ── Bottom resize handle ──────────────────────────────────────────────────
  const onBottomPointerDown = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
    const startY = e.clientY
    const maxGrow = (END_HOUR - item.scheduled.hour) * CELL_HEIGHT

    const onMove = (me) => {
      const delta = me.clientY - startY
      const newH = Math.max(CELL_HEIGHT, Math.min(baseHeight + delta, maxGrow))
      setResizePx({ topOffset: 0, height: newH - 2 })
    }

    const onUp = (me) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizePx(null)
      const deltaHours = Math.round((me.clientY - startY) / CELL_HEIGHT)
      const newDuration = Math.max(1, Math.min(duration + deltaHours, END_HOUR - item.scheduled.hour))
      resizeScheduledItem(item.id, item.scheduled.hour, newDuration)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [item, duration, baseHeight, resizeScheduledItem])

  return (
    <div
      className="absolute rounded-lg bg-blue-200 shadow-sm select-none"
      style={{
        left: '1px',
        right: '1px',
        top: `${1 + topOffset}px`,
        height: `${height}px`,
        zIndex: isDragging ? 50 : 5,
        transform: dragDelta ? `translate(${dragDelta.x}px, ${dragDelta.y}px)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : undefined,
      }}
      onPointerDown={onBodyPointerDown}
    >
      {/* Top resize handle */}
      <div
        className="absolute top-0 left-0 right-0 h-3 flex items-center justify-center cursor-ns-resize"
        style={{ zIndex: 10 }}
        onPointerDown={onTopPointerDown}
      >
        <div className="w-8 h-0.5 bg-blue-500 rounded-full opacity-50" />
      </div>

      {/* Content */}
      <div className="pt-3 pb-3 px-2 h-full overflow-hidden pointer-events-none">
        <p className="text-xs text-gray-700 pr-4 break-words leading-tight">{item.text}</p>
      </div>

      {/* X button */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); removeItem(item.id) }}
        className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-600 transition-colors"
        style={{ border: 'none', cursor: 'pointer', fontSize: '8px', lineHeight: 1, padding: 0, zIndex: 10 }}
      >
        ×
      </button>

      {/* Bottom resize handle */}
      <div
        className="absolute bottom-0 left-0 right-0 h-3 flex items-center justify-center cursor-ns-resize"
        style={{ zIndex: 10 }}
        onPointerDown={onBottomPointerDown}
      >
        <div className="w-8 h-0.5 bg-blue-500 rounded-full opacity-50" />
      </div>
    </div>
  )
}

// A floating unscheduled card around the calendar edges
function FloatingCalendarCard({ item, cellRefs, onDragStart, onDragEnd, onDragMove }) {
  const scheduleItem = useStore((s) => s.scheduleItem)
  const updatePosition = useStore((s) => s.updatePosition)

  const x = useMotionValue(item.position?.x ?? 0)
  const y = useMotionValue(item.position?.y ?? 0)

  useEffect(() => {
    x.set(item.position?.x ?? 0)
    y.set(item.position?.y ?? 0)
  }, [item.position?.x, item.position?.y]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnd = useCallback(
    (event) => {
      onDragEnd?.()
      const dropX = event.clientX
      const dropY = event.clientY

      let dropped = false
      for (const [key, ref] of Object.entries(cellRefs.current)) {
        if (!ref) continue
        const rect = ref.getBoundingClientRect()
        if (dropX >= rect.left && dropX <= rect.right && dropY >= rect.top && dropY <= rect.bottom) {
          const [day, hourStr] = key.split('_')
          scheduleItem(item.id, day, parseInt(hourStr, 10))
          dropped = true
          break
        }
      }

      if (!dropped) {
        updatePosition(item.id, { x: x.get(), y: y.get() })
      }
    },
    [scheduleItem, updatePosition, cellRefs, x, y, item.id, onDragEnd]
  )

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={onDragStart}
      onDrag={(event) => onDragMove?.(event.clientX, event.clientY)}
      onDragEnd={handleDragEnd}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="absolute bg-blue-100 rounded-xl shadow-sm p-3 text-sm text-gray-700 cursor-grab active:cursor-grabbing select-none"
      style={{
        width: '130px',
        minHeight: '56px',
        zIndex: 20,
        left: '50%',
        top: '50%',
        marginLeft: '-65px',
        marginTop: '-28px',
        x,
        y,
      }}
      whileDrag={{ zIndex: 100, scale: 1.05, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    >
      <p className="pr-4 break-words leading-snug">{item.text}</p>
    </motion.div>
  )
}

export default function CalendarView() {
  const items = useStore((s) => s.items)
  const cellRefs = useRef({})
  const containerRef = useRef(null)
  const [hoveredCell, setHoveredCell] = useState(null) // { day, hour }
  const [isDragging, setIsDragging] = useState(false)

  // Find which cell key contains the given point and update hovered state
  const updateHoveredCellFromPoint = useCallback((clientX, clientY) => {
    for (const [key, ref] of Object.entries(cellRefs.current)) {
      if (!ref) continue
      const rect = ref.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        const [day, hourStr] = key.split('_')
        setHoveredCell({ day, hour: parseInt(hourStr, 10) })
        return
      }
    }
    setHoveredCell(null)
  }, [])

  const unscheduledItems = items.filter((i) => !i.scheduled)
  const scheduledItems = items.filter((i) => i.scheduled)

  // Only render a ScheduledCard in its start-hour cell
  const getScheduledForCell = (day, hour) =>
    scheduledItems.filter((i) => i.scheduled.day === day && i.scheduled.hour === hour)

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ minHeight: 'calc(100vh - 64px)', overflow: 'hidden' }}
    >
      {/* Calendar grid */}
      <div className="flex justify-center items-start pt-8 pb-8">
        <div
          className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white"
          style={{ minWidth: '700px', maxWidth: '900px', width: '90vw' }}
        >
          {/* Header */}
          <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
            <div className="border-b border-r border-gray-200 bg-gray-50 h-10" />
            {DAYS.map((day) => (
              <div
                key={day}
                className="border-b border-r border-gray-200 bg-gray-50 h-10 flex items-center justify-center text-xs font-semibold text-gray-500 uppercase tracking-wide last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Hour rows */}
          <div className="overflow-y-auto" style={{ maxHeight: '65vh' }}>
            {HOURS.map((hour) => {
              return (
                <div
                  key={hour}
                  className="grid"
                  style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}
                >
                  <div
                    className="border-b border-r border-gray-100 flex items-start justify-end pr-2 pt-1 transition-colors"
                    style={{ height: `${CELL_HEIGHT}px` }}
                  >
                    <span className="text-xs text-gray-400">
                      {formatHour(hour)}
                    </span>
                  </div>

                  {DAY_KEYS.map((day, di) => {
                    const cellKey = `${day}_${hour}`
                    const cellItems = getScheduledForCell(day, hour)
                    const isHovered = isDragging && hoveredCell?.day === day && hoveredCell?.hour === hour
                    return (
                      <div
                        key={day}
                        ref={(el) => { cellRefs.current[cellKey] = el }}
                        data-cell={cellKey}
                        className={`border-b border-r border-gray-100 relative transition-colors ${di === 6 ? 'border-r-0' : ''} ${isHovered ? 'bg-blue-100' : ''}`}
                        style={{ height: `${CELL_HEIGHT}px`, overflow: 'visible' }}
                      >
                        {cellItems.map((sItem) => (
                          <ScheduledCard
                            key={`${sItem.id}-${sItem.scheduled.day}-${sItem.scheduled.hour}`}
                            item={sItem}
                            cellRefs={cellRefs}
                            containerRef={containerRef}
                            onDragStart={() => setIsDragging(true)}
                            onDragEnd={() => { setIsDragging(false); setHoveredCell(null) }}
                            onDragMove={updateHoveredCellFromPoint}
                          />
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Floating unscheduled cards */}
      <AnimatePresence>
        {unscheduledItems.map((item) => (
          <FloatingCalendarCard
            key={item.id}
            item={item}
            cellRefs={cellRefs}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => { setIsDragging(false); setHoveredCell(null) }}
            onDragMove={updateHoveredCellFromPoint}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
