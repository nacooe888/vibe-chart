import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { VibeProvider } from './contexts/VibeContext'
import Auth from './components/Auth'
import VibeCircle from './components/VibeCircle'
import EnergyReport from './components/EnergyReport'
import RitualTab from './components/RitualTab'
import CyclesTab from './components/CyclesTab'

const TABS = [
  { id: 'map', label: '✦ map' },
  { id: 'report', label: '◎ report' },
  { id: 'ritual', label: '⟡ ritual' },
  { id: 'cycles', label: '◈ cycles' },
]

function TabNav({ activeTab, onTabChange }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'linear-gradient(to top, #050510 0%, #050510 85%, transparent 100%)',
      padding: '20px 16px 24px',
      zIndex: 50,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 6,
        maxWidth: 400,
        margin: '0 auto',
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              style={{
                flex: 1,
                padding: '10px 8px',
                borderRadius: 12,
                border: 'none',
                background: isActive ? 'rgba(196,159,255,0.2)' : 'rgba(255,255,255,0.04)',
                color: isActive ? 'white' : 'rgba(255,255,255,0.35)',
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 11,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.25s',
                boxShadow: isActive ? '0 0 20px rgba(196,159,255,0.15)' : 'none',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function MainApp() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState('map')

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Sign out button - positioned absolutely */}
      <div style={{
        position: 'fixed',
        top: 36,
        right: 20,
        zIndex: 40,
      }}>
        <button
          onClick={signOut}
          style={{
            padding: '6px 12px',
            borderRadius: 99,
            border: '1px solid rgba(255,255,255,0.09)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.32)',
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          sign out
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'map' && <VibeCircle showSignOut={false} />}
      {activeTab === 'report' && <EnergyReport />}
      {activeTab === 'ritual' && <RitualTab />}
      {activeTab === 'cycles' && <CyclesTab />}

      {/* Tab navigation */}
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

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

  return <MainApp />
}

export default function App() {
  return (
    <AuthProvider>
      <VibeProvider>
        <AppContent />
      </VibeProvider>
    </AuthProvider>
  )
}
