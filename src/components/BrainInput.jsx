import { useState } from 'react'
import useStore from '../store/useStore'

export default function BrainInput() {
  const [text, setText] = useState('')
  const addItem = useStore((s) => s.addItem)

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    addItem(trimmed)
    setText('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      className="relative bg-white rounded-2xl shadow-md border border-gray-200 w-80"
      style={{ minHeight: '100px' }}
    >
      <textarea
        className="w-full h-full resize-none rounded-2xl p-4 pb-10 text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
        placeholder="what's on your mind?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        style={{ background: 'transparent' }}
      />
      <button
        onClick={handleSubmit}
        className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-gray-900 text-white text-sm flex items-center justify-center hover:bg-gray-700 transition-colors"
        style={{ border: 'none', cursor: 'pointer', lineHeight: 1 }}
      >
        &gt;
      </button>
    </div>
  )
}
