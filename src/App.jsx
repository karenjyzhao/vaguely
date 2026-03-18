import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Header from './components/Header'
import BrainstormCanvas from './components/BrainstormCanvas'
import CalendarView from './components/CalendarView'
import Onboarding from './components/Onboarding'
import useStore from './store/useStore'

export default function App() {
  const mode = useStore((s) => s.mode)
  const name = useStore((s) => s.name)
  const undo = useStore((s) => s.undo)
  const [showUndoToast, setShowUndoToast] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        setShowUndoToast(true)
        setTimeout(() => setShowUndoToast(false), 1500)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo])

  const hasOnboarded = useStore((s) => s.hasOnboarded)

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main style={{ paddingTop: '64px' }}>
        {mode === 'brainstorm' ? <BrainstormCanvas /> : <CalendarView />}
      </main>
      {!hasOnboarded && <Onboarding />}

      {/* Undo toast */}
      <AnimatePresence>
        {showUndoToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-medium shadow-lg pointer-events-none"
          >
            undone
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
