import { AuthProvider, useAuth } from './contexts/AuthContext'
import Auth from './components/Auth'
import VibeCircle from './components/VibeCircle'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#050510',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Cormorant Garamond', serif",
        color: 'rgba(255,255,255,0.3)',
        fontSize: 16,
        fontStyle: 'italic',
      }}>
        <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
          entering the void...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Auth />
  }

  return <VibeCircle />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
