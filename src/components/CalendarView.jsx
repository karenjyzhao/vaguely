import { useRef, useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import useStore from '../store/useStore'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDates(offset = 0) {
  const now = new Date()
  const dow = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}
const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const START_HOUR = 0
const END_HOUR = 24
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const CELL_HEIGHT = 40 // px — must match the rendered row height

function formatHour(h) {
  if (h === 0) return '12 AM'
  if (h === 12) return '12 PM'
  if (h > 12) return `${h - 12} PM`
  return `${h} AM`
}

function formatTime(h, m = 0) {
  const total = h * 60 + m
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  if (hh === 0 && mm === 0) return '12 AM'
  if (hh === 12 && mm === 0) return '12 PM'
  const period = hh >= 12 ? 'PM' : 'AM'
  const dh = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return mm === 0 ? `${dh} ${period}` : `${dh}:30 ${period}`
}

// Compute overlap columns for all scheduled items, grouped by day.
// Returns a map of item.id -> { colIndex, colCount }
function computeOverlapLayout(scheduledItems) {
  const layout = {}
  const byDay = {}
  scheduledItems.forEach((item) => {
    const d = item.scheduled.day
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(item)
  })

  for (const items of Object.values(byDay)) {
    const sorted = [...items].sort((a, b) => a.scheduled.hour - b.scheduled.hour)
    const columns = [] // columns[c] = array of items in that column

    sorted.forEach((item) => {
      const start = item.scheduled.hour
      const end = start + (item.scheduled.duration ?? 1)
      let placed = false
      for (let c = 0; c < columns.length; c++) {
        const last = columns[c][columns[c].length - 1]
        const lastEnd = last.scheduled.hour + (last.scheduled.duration ?? 1)
        if (start >= lastEnd) { columns[c].push(item); placed = true; break }
      }
      if (!placed) columns.push([item])
    })

    sorted.forEach((item) => {
      const start = item.scheduled.hour
      const end = start + (item.scheduled.duration ?? 1)
      const colIndex = columns.findIndex((col) => col.some((i) => i.id === item.id))
      const colCount = columns.filter((col) =>
        col.some((i) => {
          const s = i.scheduled.hour; const e = s + (i.scheduled.duration ?? 1)
          return s < end && e > start
        })
      ).length
      layout[item.id] = { colIndex, colCount }
    })
  }
  return layout
}

// A scheduled card inside the calendar grid.
// Uses raw pointer events for both body-drag and resize so the two
// interactions never conflict with each other.
function ScheduledCard({ item, cellRefs, containerRef, colIndex, colCount, onDragStart, onDragEnd, onDragMove }) {
  const scheduleItem = useStore((s) => s.scheduleItem)
  const unscheduleItem = useStore((s) => s.unscheduleItem)
  const removeItem = useStore((s) => s.removeItem)
  const resizeScheduledItem = useStore((s) => s.resizeScheduledItem)
  const updatePosition = useStore((s) => s.updatePosition)

  const duration = item.scheduled.duration ?? 1
  const baseHeight = duration * CELL_HEIGHT
  const minuteOffset = ((item.scheduled.minute ?? 0) / 60) * CELL_HEIGHT

  // Live visual state during interactions (not committed to store yet)
  const [dragDelta, setDragDelta] = useState(null)   // {x, y} while body-dragging
  const [resizePx, setResizePx] = useState(null)     // {topOffset, height} while resizing
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)

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
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      setDragDelta({ x: dx, y: dy })
      dragX.set(dx)
      dragY.set(dy)
      onDragMoveRef.current?.(me.clientX, me.clientY)
    }

    const onUp = (me) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragDelta(null)
      dragX.set(0)
      dragY.set(0)
      onDragEndRef.current?.()

      const dropX = me.clientX
      const dropY = me.clientY
      let dropped = false

      for (const [key, ref] of Object.entries(cellRefs.current)) {
        if (!ref) continue
        const rect = ref.getBoundingClientRect()
        if (dropX >= rect.left && dropX <= rect.right && dropY >= rect.top && dropY <= rect.bottom) {
          const [day, hourStr] = key.split('_')
          const minute = (dropY - rect.top) >= CELL_HEIGHT / 2 ? 30 : 0
          scheduleItem(item.id, day, parseInt(hourStr, 10), minute, duration)
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
      const HALF = CELL_HEIGHT / 2
      const deltaSlots = Math.round((me.clientY - startY) / HALF)
      const startMinutes = item.scheduled.hour * 60 + (item.scheduled.minute ?? 0)
      const newStartMinutes = Math.max(
        START_HOUR * 60,
        Math.min(startMinutes + deltaSlots * 30, startMinutes + (duration - 0.5) * 60)
      )
      const snapped = Math.round(newStartMinutes / 30) * 30
      const newHour = Math.floor(snapped / 60)
      const newMinute = snapped % 60
      const newDuration = Math.max(0.5, (startMinutes + duration * 60 - snapped) / 60)
      resizeScheduledItem(item.id, newHour, newMinute, newDuration)
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
      const HALF = CELL_HEIGHT / 2
      const deltaSlots = Math.round((me.clientY - startY) / HALF)
      const maxSlots = (END_HOUR - item.scheduled.hour) * 2
      const newSlots = Math.max(1, Math.min((duration * 2) + deltaSlots, maxSlots))
      resizeScheduledItem(item.id, item.scheduled.hour, item.scheduled.minute ?? 0, newSlots * 0.5)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [item, duration, baseHeight, resizeScheduledItem])

  return (
    <motion.div
      className="absolute rounded-lg shadow-sm select-none"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: isDragging ? 0.5 : 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      style={{
        left: `calc(${(colIndex / colCount) * 100}% + 1px)`,
        width: `calc(${(1 / colCount) * 100}% - 2px)`,
        top: `${minuteOffset + 1 + topOffset}px`,
        height: `${height}px`,
        zIndex: isDragging ? 50 : 5,
        x: dragX,
        y: dragY,
        cursor: isDragging ? 'grabbing' : 'default',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : undefined,
        backgroundColor: item.color ?? '#DBEAFE',
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

      {/* Content — grab cursor lives here, not on the resize handles */}
      <div
        className="pt-3 pb-3 px-2 h-full overflow-hidden"
        style={{ cursor: isDragging ? 'grabbing' : 'grab', pointerEvents: 'none' }}
      >
        <p className="text-xs text-gray-700 pr-4 break-words leading-tight">{item.text}</p>
        <p className="text-xs text-gray-400 mt-0.5">{formatTime(item.scheduled.hour, item.scheduled.minute ?? 0)} – {formatTime(item.scheduled.hour + Math.floor(((item.scheduled.minute ?? 0) + (item.scheduled.duration ?? 1) * 60) / 60), ((item.scheduled.minute ?? 0) + (item.scheduled.duration ?? 1) * 60) % 60)}</p>
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
    </motion.div>
  )
}

// A floating unscheduled card around the calendar edges
function FloatingCalendarCard({ item, cellRefs, parkingPosition, animDelay, onDragStart, onDragEnd, onDragMove }) {
  const scheduleItem = useStore((s) => s.scheduleItem)
  const updatePosition = useStore((s) => s.updatePosition)

  const x = useMotionValue(item.position?.x ?? 0)
  const y = useMotionValue(item.position?.y ?? 0)
  const rotate = useMotionValue(0)

  // Spring-animate to parking position when entering calendar view
  useEffect(() => {
    const spring = { type: 'spring', stiffness: 120, damping: 22, delay: animDelay ?? 0 }
    const cx = animate(x, parkingPosition.x, spring)
    const cy = animate(y, parkingPosition.y, spring)
    const cr = animate(rotate, parkingPosition.rotate ?? 0, spring)
    return () => { cx.stop(); cy.stop(); cr.stop() }
  }, [parkingPosition.x, parkingPosition.y, parkingPosition.rotate]) // eslint-disable-line react-hooks/exhaustive-deps

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
          const minute = (dropY - rect.top) >= CELL_HEIGHT / 2 ? 30 : 0
          scheduleItem(item.id, day, parseInt(hourStr, 10), minute)
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
      className="absolute rounded-xl shadow-sm p-3 text-sm text-gray-700 cursor-grab active:cursor-grabbing select-none"
      style={{
        width: '130px',
        minHeight: '56px',
        zIndex: 20,
        left: '50%',
        top: '50%',
        marginLeft: '-65px',
        marginTop: '-28px',
        backgroundColor: item.color ?? '#DBEAFE',
        x,
        y,
        rotate,
      }}
      whileDrag={{ zIndex: 100, scale: 1.05, rotate: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
    >
      <p className="pr-4 break-words leading-snug">{item.text}</p>
    </motion.div>
  )
}

// Deterministic pseudo-random based on item id — same result every render
function seeded(id, salt) {
  const v = Math.sin(id * 9301 + salt * 49297) * 10000
  return v - Math.floor(v) // 0..1
}

function computeParkingPositions(items, containerWidth) {
  const calHalfWidth = Math.min(containerWidth * 0.45, 450)
  const CAL_HALF_H = 310
  const ABOVE_Y = -(CAL_HALF_H + 55)
  const BELOW_Y = CAL_HALF_H + 55
  const LEFT_X = -(calHalfWidth + 85)
  const RIGHT_X = calHalfWidth + 85
  const H_SPACING = 150
  const V_SPACING = 100

  // Classify each item to its nearest edge
  const edges = { top: [], bottom: [], left: [], right: [] }
  items.forEach((item, i) => {
    const px = item.position?.x ?? 0
    const py = item.position?.y ?? 0
    const nx = Math.abs(px) / calHalfWidth
    const ny = Math.abs(py) / CAL_HALF_H
    let edge
    if (nx > ny) {
      edge = px >= 0 ? 'right' : 'left'
    } else {
      edge = py >= 0 ? 'bottom' : 'top'
    }
    edges[edge].push(i)
  })

  const result = new Array(items.length)

  for (const [edge, fixedY] of [['top', ABOVE_Y], ['bottom', BELOW_Y]]) {
    const group = edges[edge]
    const n = group.length
    group.forEach((itemIndex, slot) => {
      const item = items[itemIndex]
      const jx = (seeded(item.id, 0) - 0.5) * 30  // ±15px along edge
      const jy = (seeded(item.id, 1) - 0.5) * 20  // ±10px toward/away
      const rotate = (seeded(item.id, 2) - 0.5) * 10 // ±5deg
      result[itemIndex] = {
        x: -((n - 1) / 2) * H_SPACING + slot * H_SPACING + jx,
        y: fixedY + jy,
        rotate,
      }
    })
  }

  for (const [edge, fixedX] of [['left', LEFT_X], ['right', RIGHT_X]]) {
    const group = edges[edge]
    const n = group.length
    group.forEach((itemIndex, slot) => {
      const item = items[itemIndex]
      const jx = (seeded(item.id, 0) - 0.5) * 20  // ±10px toward/away
      const jy = (seeded(item.id, 1) - 0.5) * 30  // ±15px along edge
      const rotate = (seeded(item.id, 2) - 0.5) * 10
      result[itemIndex] = {
        x: fixedX + jx,
        y: -((n - 1) / 2) * V_SPACING + slot * V_SPACING + jy,
        rotate,
      }
    })
  }

  return result
}

const DAY_OFFSET = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6 }

const pad = (n) => String(n).padStart(2, '0')

function buildEventDate(weekDates, day, hour, minute = 0) {
  const date = new Date(weekDates[DAY_OFFSET[day] ?? 0])
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(hour)}${pad(minute)}00`
}

function googleCalendarUrl(item, weekDates) {
  const start = buildEventDate(weekDates, item.scheduled.day, item.scheduled.hour, item.scheduled.minute ?? 0)
  const totalMins = (item.scheduled.hour * 60 + (item.scheduled.minute ?? 0)) + (item.scheduled.duration ?? 1) * 60
  const endHour = Math.floor(totalMins / 60)
  const endMin = totalMins % 60
  const end = buildEventDate(weekDates, item.scheduled.day, endHour, endMin)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: item.text,
    dates: `${start}/${end}`,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

function exportIcs(items, weekDates) {
  const scheduled = items.filter((i) => i.scheduled)
  if (scheduled.length === 0) return

  const now = new Date()
  const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}Z`

  const events = scheduled.map((item) => {
    const start = buildEventDate(weekDates, item.scheduled.day, item.scheduled.hour, item.scheduled.minute ?? 0)
    const totalMins = (item.scheduled.hour * 60 + (item.scheduled.minute ?? 0)) + (item.scheduled.duration ?? 1) * 60
    const end = buildEventDate(weekDates, item.scheduled.day, Math.floor(totalMins / 60), totalMins % 60)
    return [
      'BEGIN:VEVENT',
      `UID:${item.id}@vaguely`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${item.text.replace(/\n/g, '\\n')}`,
      'END:VEVENT',
    ].join('\r\n')
  })

  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//vaguely//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'vaguely-calendar.ics'
  a.click()
  URL.revokeObjectURL(url)
}

export default function CalendarView() {
  const items = useStore((s) => s.items)
  const addScheduledItem = useStore((s) => s.addScheduledItem)
  const cellRefs = useRef({})
  const containerRef = useRef(null)
  const scrollRef = useRef(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [showIcsModal, setShowIcsModal] = useState(false)
  const weekDates = getWeekDates(weekOffset)
  const [hoveredCell, setHoveredCell] = useState(null)
  const [draggingInfo, setDraggingInfo] = useState(null) // { duration, color } while dragging
  const [creatingInCell, setCreatingInCell] = useState(null) // { day, hour, minute }
  const [newEventText, setNewEventText] = useState('')
  const ignoreCellClickRef = useRef(false)
  const [containerWidth, setContainerWidth] = useState(() => window.innerWidth)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const obs = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Update current time every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return
    const handler = () => setExportOpen(false)
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [exportOpen])

  // Scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current) {
      const top = (now.getHours() + now.getMinutes() / 60) * CELL_HEIGHT - 120
      scrollRef.current.scrollTop = Math.max(0, top)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Find which cell key contains the given point and update hovered state
  const updateHoveredCellFromPoint = useCallback((clientX, clientY) => {
    for (const [key, ref] of Object.entries(cellRefs.current)) {
      if (!ref) continue
      const rect = ref.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        const [day, hourStr] = key.split('_')
        const minute = (clientY - rect.top) >= CELL_HEIGHT / 2 ? 30 : 0
        setHoveredCell({ day, hour: parseInt(hourStr, 10), minute })
        return
      }
    }
    setHoveredCell(null)
  }, [])

  const unscheduledItems = items.filter((i) => !i.scheduled)
  const scheduledItems = items.filter((i) => i.scheduled)
  const overlapLayout = computeOverlapLayout(scheduledItems)

  const isDragging = draggingInfo !== null
  const nowTop = (now.getHours() + now.getMinutes() / 60) * CELL_HEIGHT

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
      <div className="flex justify-center items-start pt-28 pb-28">
        <div
          className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white"
          style={{ minWidth: '700px', maxWidth: '900px', width: '90vw' }}
        >
          {/* Toolbar: week nav + export */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                style={{ border: 'none', cursor: 'pointer', background: 'none', fontSize: '14px' }}
              >
                ‹
              </button>
              <span className="text-xs text-gray-500 font-medium select-none" style={{ minWidth: '120px', textAlign: 'center' }}>
                {weekDates[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {weekDates[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                style={{ border: 'none', cursor: 'pointer', background: 'none', fontSize: '14px' }}
              >
                ›
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
                  style={{ border: 'none', cursor: 'pointer', background: 'none' }}
                >
                  today
                </button>
              )}
            </div>
            <button
              onClick={() => { exportIcs(items, weekDates); setShowIcsModal(true) }}
              className="text-xs text-gray-500 hover:text-gray-800 transition-colors px-3 py-1 rounded-lg hover:bg-gray-100"
              style={{ border: '1px solid #e5e7eb', cursor: 'pointer', background: 'white' }}
            >
              Export .ics
            </button>
          </div>
          {/* Header */}
          <div className="grid" style={{ gridTemplateColumns: '56px repeat(7, 1fr)' }}>
            <div className="border-b border-r border-gray-200 bg-gray-50 h-14" />
            {DAYS.map((day, i) => {
              const date = weekDates[i]
              const isToday = date.toDateString() === new Date().toDateString()
              return (
                <div
                  key={day}
                  className="border-b border-r border-gray-200 bg-gray-50 h-14 flex flex-col items-center justify-center gap-0.5 last:border-r-0"
                >
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{day}</span>
                  <span
                    className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-gray-900 text-white' : 'text-gray-600'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Hour rows */}
          <div ref={scrollRef} className="overflow-y-auto relative" style={{ maxHeight: '65vh' }}>
            {/* Current time indicator */}
            <div
              className="absolute pointer-events-none"
              style={{ top: `${nowTop}px`, left: 0, right: 0, zIndex: 20 }}
            >
              <div className="flex items-center" style={{ marginLeft: '56px' }}>
                <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" style={{ marginLeft: '-4px' }} />
                <div className="flex-1 h-px bg-red-400" />
              </div>
            </div>

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
                    const isDragging = draggingInfo !== null
                    const isHovered = isDragging && hoveredCell?.day === day && hoveredCell?.hour === hour
                    return (
                      <div
                        key={day}
                        ref={(el) => { cellRefs.current[cellKey] = el }}
                        data-cell={cellKey}
                        className={`border-b border-r border-gray-100 relative transition-colors ${di === 6 ? 'border-r-0' : ''}`}
                        style={{ height: `${CELL_HEIGHT}px`, overflow: 'visible' }}
                        onClick={() => {
                          if (ignoreCellClickRef.current || cellItems.length > 0) return
                          setCreatingInCell({ day, hour, minute: 0 })
                          setNewEventText('')
                        }}
                      >
                        {/* Ghost preview while dragging */}
                        {isHovered && draggingInfo && (
                          <div
                            className="absolute inset-x-0.5 rounded pointer-events-none"
                            style={{
                              top: `${hoveredCell.minute === 30 ? CELL_HEIGHT / 2 : 0}px`,
                              height: `${draggingInfo.duration * CELL_HEIGHT - 2}px`,
                              backgroundColor: draggingInfo.color ?? '#DBEAFE',
                              opacity: 0.35,
                              border: '2px dashed rgba(0,0,0,0.15)',
                              zIndex: 15,
                            }}
                          />
                        )}
                        {/* Inline create input */}
                        {creatingInCell?.day === day && creatingInCell?.hour === hour && (
                          <div className="absolute inset-x-0.5 rounded bg-white border border-gray-300 shadow-sm z-30" style={{ top: '1px', minHeight: `${CELL_HEIGHT - 2}px` }}>
                            <input
                              autoFocus
                              className="w-full px-2 py-1 text-xs text-gray-700 bg-transparent focus:outline-none"
                              placeholder="event name"
                              value={newEventText}
                              onChange={(e) => setNewEventText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const text = newEventText.trim()
                                  if (text) addScheduledItem(text, day, hour, creatingInCell.minute)
                                  setCreatingInCell(null)
                                  setNewEventText('')
                                } else if (e.key === 'Escape') {
                                  setCreatingInCell(null)
                                  setNewEventText('')
                                }
                              }}
                              onBlur={() => {
                                const text = newEventText.trim()
                                if (text) addScheduledItem(text, day, hour, creatingInCell?.minute ?? 0)
                                setCreatingInCell(null)
                                setNewEventText('')
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        )}
                        {cellItems.map((sItem) => (
                          <ScheduledCard
                            key={`${sItem.id}-${sItem.scheduled.day}-${sItem.scheduled.hour}`}
                            item={sItem}
                            cellRefs={cellRefs}
                            containerRef={containerRef}
                            colIndex={overlapLayout[sItem.id]?.colIndex ?? 0}
                            colCount={overlapLayout[sItem.id]?.colCount ?? 1}
                            onDragStart={() => { setDraggingInfo({ duration: sItem.scheduled.duration ?? 1, color: sItem.color }); ignoreCellClickRef.current = true; setTimeout(() => { ignoreCellClickRef.current = false }, 150) }}
                            onDragEnd={() => { setDraggingInfo(null); setHoveredCell(null) }}
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
        {(() => {
          const parkingPositions = computeParkingPositions(unscheduledItems, containerWidth)
          return unscheduledItems.map((item, i) => (
            <FloatingCalendarCard
              key={item.id}
              item={item}
              cellRefs={cellRefs}
              parkingPosition={parkingPositions[i]}
              animDelay={i * 0.05}
              onDragStart={() => { setDraggingInfo({ duration: 1, color: item.color }); ignoreCellClickRef.current = true; setTimeout(() => { ignoreCellClickRef.current = false }, 150) }}
              onDragEnd={() => { setDraggingInfo(null); setHoveredCell(null) }}
              onDragMove={updateHoveredCellFromPoint}
            />
          ))
        })()}
      </AnimatePresence>

      {/* ICS import helper modal */}
      <AnimatePresence>
        {showIcsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowIcsModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 200, damping: 24 }}
              className="bg-white rounded-2xl shadow-xl border border-gray-100 px-8 py-8 flex flex-col gap-4"
              style={{ width: '340px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <p className="text-sm font-medium text-gray-800 mb-1">File downloaded!</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  To import into Google Calendar, head to your settings and upload the file.
                </p>
              </div>
              <a
                href="https://calendar.google.com/calendar/u/0/r/settings/export"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-xs text-gray-700 font-medium"
                style={{ textDecoration: 'none' }}
              >
                <span>Open Google Calendar import</span>
                <span className="text-gray-400">↗</span>
              </a>
              <button
                onClick={() => setShowIcsModal(false)}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors text-center"
                style={{ border: 'none', background: 'none', cursor: 'pointer' }}
              >
                dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
