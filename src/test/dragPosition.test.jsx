/**
 * Drag precision tests.
 *
 * The real bug: Framer Motion keeps its own internal translateX/Y that
 * accumulates across the lifetime of a mounted component. When we also update
 * CSS `left`/`top` after each drag, BOTH change — so the card visually
 * appears at  cssLeftOffset + fmTranslateX  =  2× the expected offset.
 *
 * The fix: position the card at a fixed CSS origin (left:'50%') and let
 * useMotionValue carry the x/y offset. FM then only applies
 * translateX(motionValue) — no separate accumulation.
 *
 * These tests verify VISUAL position (CSS offset + FM translateX) after each
 * drag and re-render, not just the Zustand store value.
 */

import { render, act } from '@testing-library/react'
import { useRef } from 'react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import useStore from '../store/useStore'
import BrainCard from '../components/BrainCard'
import CalendarView from '../components/CalendarView'

// ---------------------------------------------------------------------------
// Framer Motion mock
//
// • useMotionValue  – backed by useRef so it persists across re-renders, just
//                     like the real FM hook.
// • MotionDiv       – tracks FM's OWN internal fm offset via useRef (this
//                     simulates the real FM internal accumulation that persists
//                     across re-renders and causes the doubling bug).
//                     When the caller provides motion-value objects in
//                     style.x / style.y, those are used instead.
// • exposeOnDragEnd – module-level setter so tests can trigger a drag end.
// ---------------------------------------------------------------------------

let exposeOnDragEnd = null

vi.mock('framer-motion', () => {
  const mockUseMotionValue = (initial) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ref = useRef(null)
    if (ref.current === null) {
      let _val = initial
      ref.current = { get: () => _val, set: (v) => { _val = v } }
    }
    return ref.current
  }

  const MotionDiv = ({ onDragEnd, style, children, ...rest }) => {
    // FM's OWN internal cumulative offset – persists across re-renders via ref.
    // This is what causes the doubling: it doesn't reset when CSS left/top updates.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const fmInternal = useRef({ x: 0, y: 0 })

    const hasMotionX = style?.x && typeof style.x?.get === 'function'
    const hasMotionY = style?.y && typeof style.y?.get === 'function'

    // What FM applies as the CSS transform on the element
    const translateX = hasMotionX ? style.x.get() : fmInternal.current.x
    const translateY = hasMotionY ? style.y.get() : fmInternal.current.y

    // Parse a number out of 'calc(50% + 100px)' → 100, '50%' → 0
    function parseCssOffset(val) {
      if (!val) return 0
      const m = String(val).match(/calc\(50%\s*\+\s*([-\d.]+)px\)/)
      return m ? parseFloat(m[1]) : 0
    }

    const cssOffsetX = parseCssOffset(style?.left)
    const cssOffsetY = parseCssOffset(style?.top)

    // Total visual offset from the 50% centre line
    const visualX = cssOffsetX + translateX
    const visualY = cssOffsetY + translateY

    exposeOnDragEnd = (event, info) => {
      if (hasMotionX) {
        style.x.set(style.x.get() + info.offset.x)
      } else {
        fmInternal.current.x += info.offset.x
      }
      if (hasMotionY) {
        style.y.set(style.y.get() + info.offset.y)
      } else {
        fmInternal.current.y += info.offset.y
      }
      onDragEnd?.(event, info)
    }

    return (
      <div
        data-testid="draggable"
        data-visual-x={visualX}
        data-visual-y={visualY}
        style={style}
        {...rest}
      >
        {children}
      </div>
    )
  }

  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }) => <>{children}</>,
    useMotionValue: mockUseMotionValue,
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(id, x, y) {
  return { id, text: 'test', position: { x, y }, scheduled: null }
}

function fireDrag(offsetX, offsetY, clientX = 9999, clientY = 9999) {
  act(() => {
    exposeOnDragEnd(
      { clientX, clientY },
      { offset: { x: offsetX, y: offsetY } },
    )
  })
}

function getVisualX(container) {
  return parseFloat(container.querySelector('[data-testid="draggable"]').dataset.visualX)
}

function storePos(id) {
  return useStore.getState().items.find((i) => i.id === id).position
}

// ---------------------------------------------------------------------------
// BrainCard
// ---------------------------------------------------------------------------

describe('BrainCard – drag precision', () => {
  beforeEach(() => {
    useStore.setState({ items: [] })
    exposeOnDragEnd = null
  })

  it('store position matches cursor delta after one drag', () => {
    const item = makeItem(1, 50, 30)
    useStore.setState({ items: [item] })
    render(<BrainCard item={item} />)

    fireDrag(75, -40)

    expect(storePos(1)).toEqual({ x: 125, y: -10 })
  })

  it('visual position equals initial + drag offset after one drag (no doubling)', () => {
    const item = makeItem(2, 0, 0)
    useStore.setState({ items: [item] })
    const { container, rerender } = render(<BrainCard item={item} />)

    fireDrag(100, 0)

    const updated = storePos(2)
    rerender(<BrainCard item={{ ...item, position: updated }} />)

    // Correct: 100 | Doubling bug: 200
    expect(getVisualX(container)).toBe(100)
  })

  it('visual position is correct after two consecutive drags (no doubling)', () => {
    const item = makeItem(3, 0, 0)
    useStore.setState({ items: [item] })
    const { container, rerender } = render(<BrainCard item={item} />)

    // Drag 1: +100
    fireDrag(100, 0)
    let updated = storePos(3)
    rerender(<BrainCard item={{ ...item, position: updated }} />)
    expect(getVisualX(container)).toBe(100)

    // Drag 2: +40 more
    fireDrag(40, 0)
    updated = storePos(3)
    rerender(<BrainCard item={{ ...item, position: updated }} />)

    // Correct: 140 | Doubling bug: 240 (cssLeft=140 + translateX=140)
    expect(getVisualX(container)).toBe(140)
  })
})

// ---------------------------------------------------------------------------
// FloatingCalendarCard (inside CalendarView)
// ---------------------------------------------------------------------------

describe('FloatingCalendarCard – drag precision', () => {
  beforeEach(() => {
    useStore.setState({ items: [] })
    exposeOnDragEnd = null
  })

  it('visual position equals initial + drag offset after one drag (no doubling)', () => {
    const item = makeItem(10, 0, 0)
    useStore.setState({ items: [item] })
    const { container } = render(<CalendarView />)

    fireDrag(80, 0)

    // Re-render happens automatically because CalendarView subscribes to the store
    expect(getVisualX(container)).toBe(80)
  })

  it('visual position is correct after two consecutive drags (no doubling)', () => {
    const item = makeItem(11, 0, 0)
    useStore.setState({ items: [item] })
    const { container } = render(<CalendarView />)

    // Drag 1: +60
    fireDrag(60, 0)
    expect(getVisualX(container)).toBe(60)

    // Drag 2: +30
    fireDrag(30, 0)

    // Correct: 90 | Doubling bug: 150 (cssLeft=90 + translateX=90)
    expect(getVisualX(container)).toBe(90)
  })
})
