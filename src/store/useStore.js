import { create } from 'zustand'

function loadItems() {
  try {
    const raw = localStorage.getItem('planb-items')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveItems(items) {
  try {
    localStorage.setItem('planb-items', JSON.stringify(items))
  } catch {}
}

const useStore = create((set) => ({
  items: loadItems(),
  mode: 'brainstorm',

  addItem: (text) =>
    set((state) => {
      const angle = Math.random() * 2 * Math.PI
      const radius = 120 + Math.random() * 120
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      const items = [
        ...state.items,
        { id: Date.now(), text, position: { x, y }, scheduled: null },
      ]
      saveItems(items)
      return { items }
    }),

  removeItem: (id) =>
    set((state) => {
      const items = state.items.filter((item) => item.id !== id)
      saveItems(items)
      return { items }
    }),

  scheduleItem: (id, day, hour, duration = 1) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, scheduled: { day, hour, duration } } : item
      )
      saveItems(items)
      return { items }
    }),

  unscheduleItem: (id) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, scheduled: null } : item
      )
      saveItems(items)
      return { items }
    }),

  resizeScheduledItem: (id, hour, duration) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, scheduled: { ...item.scheduled, hour, duration } } : item
      )
      saveItems(items)
      return { items }
    }),

  setMode: (mode) => set({ mode }),

  updatePosition: (id, position) =>
    set((state) => {
      const items = state.items.map((item) =>
        item.id === id ? { ...item, position } : item
      )
      saveItems(items)
      return { items }
    }),
}))

export default useStore
