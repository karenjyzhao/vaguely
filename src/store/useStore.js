import { create } from 'zustand'

const CARD_COLORS = [
  '#DBEAFE', // blue
  '#D1FAE5', // green
  '#FEF3C7', // yellow
  '#FCE7F3', // pink
  '#EDE9FE', // purple
  '#FFEDD5', // orange
  '#CFFAFE', // cyan
]

function loadItems() {
  try {
    const raw = localStorage.getItem('vaguely-items')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function loadName() {
  try { return localStorage.getItem('vaguely-name') ?? null } catch { return null }
}

function loadOnboarded() {
  try { return localStorage.getItem('vaguely-onboarded') === 'true' } catch { return false }
}

function saveItems(items) {
  try {
    localStorage.setItem('vaguely-items', JSON.stringify(items))
  } catch {}
}

// Push current items onto history, capped at 50 entries
function pushHistory(state) {
  return [...state.history.slice(-49), state.items]
}

const useStore = create((set) => ({
  items: loadItems(),
  name: loadName(),
  hasOnboarded: loadOnboarded(),
  mode: 'brainstorm',
  history: [],

  undo: () =>
    set((state) => {
      if (state.history.length === 0) return {}
      const items = state.history[state.history.length - 1]
      const history = state.history.slice(0, -1)
      saveItems(items)
      return { items, history }
    }),

  setName: (name) => {
    try {
      localStorage.setItem('vaguely-name', name ?? '')
      localStorage.setItem('vaguely-onboarded', 'true')
    } catch {}
    set({ name, hasOnboarded: true })
  },

  skipOnboarding: () => {
    try { localStorage.setItem('vaguely-onboarded', 'true') } catch {}
    set({ hasOnboarded: true })
  },

  addItem: (text) =>
    set((state) => {
      const angle = Math.random() * 2 * Math.PI
      const radius = 120 + Math.random() * 120
      const items = [
        ...state.items,
        {
          id: Date.now(),
          text,
          position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
          scheduled: null,
          color: CARD_COLORS[state.items.length % CARD_COLORS.length],
        },
      ]
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),

  addScheduledItem: (text, day, hour, minute = 0) =>
    set((state) => {
      const items = [
        ...state.items,
        {
          id: Date.now(),
          text,
          position: { x: 0, y: 0 },
          scheduled: { day, hour, minute, duration: 1 },
          color: CARD_COLORS[state.items.length % CARD_COLORS.length],
        },
      ]
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),

  removeItem: (id) =>
    set((state) => {
      const items = state.items.filter((item) => item.id !== id)
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),

  scheduleItem: (id, day, hour, minute = 0, duration = 1) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, scheduled: { day, hour, minute, duration } } : item
      )
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),

  unscheduleItem: (id) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, scheduled: null } : item
      )
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),

  resizeScheduledItem: (id, hour, minute, duration) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, scheduled: { ...item.scheduled, hour, minute, duration } } : item
      )
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),

  setMode: (mode) => set({ mode }),

  updatePosition: (id, position) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, position } : item
      )
      saveItems(items)
      return { items, history: pushHistory(state) }
    }),
}))

export default useStore
