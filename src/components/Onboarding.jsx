import { useState } from 'react'
import { motion } from 'framer-motion'
import useStore from '../store/useStore'

export default function Onboarding() {
  const [value, setValue] = useState('')
  const setName = useStore((s) => s.setName)
  const skipOnboarding = useStore((s) => s.skipOnboarding)

  const submit = () => {
    const trimmed = value.trim()
    setName(trimmed || null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') skipOnboarding()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 px-10 py-10 flex flex-col items-center gap-6"
        style={{ width: '360px' }}
      >
        <div className="text-center">
          <h2 className="font-serif italic text-3xl tracking-tight text-gray-800 mb-2">welcome.</h2>
          <p className="text-gray-400 text-sm">what should we call your brain?</p>
        </div>

        <div className="flex gap-2 w-full">
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="your name"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 placeholder-gray-300 focus:outline-none focus:border-gray-400 transition-colors"
          />
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ border: 'none', cursor: value.trim() ? 'pointer' : 'default' }}
          >
            go
          </button>
        </div>

        <button
          onClick={skipOnboarding}
          className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
          style={{ border: 'none', background: 'none', cursor: 'pointer' }}
        >
          skip
        </button>

        <p className="text-xs text-gray-300 text-center">
          your ideas stay on your device — nothing is stored on our servers.
        </p>
      </motion.div>
    </div>
  )
}
