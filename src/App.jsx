import Header from './components/Header'
import BrainstormCanvas from './components/BrainstormCanvas'
import CalendarView from './components/CalendarView'
import useStore from './store/useStore'

export default function App() {
  const mode = useStore((s) => s.mode)

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main style={{ paddingTop: '64px' }}>
        {mode === 'brainstorm' ? <BrainstormCanvas /> : <CalendarView />}
      </main>
    </div>
  )
}
