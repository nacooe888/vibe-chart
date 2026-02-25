import { createContext, useContext, useState } from 'react'

const VibeContext = createContext({})

export function useVibe() {
  return useContext(VibeContext)
}

export function VibeProvider({ children }) {
  // The most recent vibe transmission from the Map tab
  const [latestVibe, setLatestVibe] = useState(null)

  // Called when user saves a vibe on the Map tab
  function recordVibe(vibeData) {
    setLatestVibe({
      ...vibeData,
      recordedAt: Date.now(),
    })
  }

  // Clear the latest vibe (e.g., after it's been used by Report)
  function clearLatestVibe() {
    setLatestVibe(null)
  }

  // Check if the latest vibe is recent (within last 5 minutes)
  function hasRecentVibe() {
    if (!latestVibe) return false
    const fiveMinutes = 5 * 60 * 1000
    return Date.now() - latestVibe.recordedAt < fiveMinutes
  }

  const value = {
    latestVibe,
    recordVibe,
    clearLatestVibe,
    hasRecentVibe,
  }

  return (
    <VibeContext.Provider value={value}>
      {children}
    </VibeContext.Provider>
  )
}
