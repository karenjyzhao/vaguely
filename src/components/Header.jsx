import useStore from '../store/useStore'

export default function Header() {
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const name = useStore((s) => s.name)

  const toggle = () => setMode(mode === 'brainstorm' ? 'calendar' : 'brainstorm')

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-white border-b border-gray-100">
      <div className="flex-1" />
      <h1 className="font-serif italic text-2xl tracking-tight text-gray-800 flex-1 text-center">
        {name ? `${name}'s brain` : 'brain'}
      </h1>
      <div className="flex-1 flex items-center justify-end gap-2">
        <span
          className={`text-sm font-medium cursor-pointer select-none ${
            mode === 'brainstorm' ? 'text-gray-900' : 'text-gray-400'
          }`}
          onClick={() => setMode('brainstorm')}
        >
          Brainstorm
        </span>
        <button
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
            mode === 'calendar' ? 'bg-gray-800' : 'bg-gray-300'
          }`}
          style={{ border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              mode === 'calendar' ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium cursor-pointer select-none ${
            mode === 'calendar' ? 'text-gray-900' : 'text-gray-400'
          }`}
          onClick={() => setMode('calendar')}
        >
          Calendar
        </span>
      </div>
    </header>
  )
}
