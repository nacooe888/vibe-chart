import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { loadProfile, saveProfile } from '../lib/profileStorage'
import { loadChart, saveChart } from '../lib/chartStorage'

export default function ProfileScreen({ onClose }) {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState(null)
  const [natalChart, setNatalChart] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Edit form state
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false)
  const [birthLocation, setBirthLocation] = useState('')

  useEffect(() => {
    if (!user?.id) return
    Promise.all([
      loadProfile(user.id),
      loadChart(user.id, 'natal'),
    ]).then(([profileData, chartData]) => {
      setProfile(profileData)
      setNatalChart(chartData)
      if (profileData) {
        setName(profileData.name || '')
        setBirthDate(profileData.birth_date || '')
        setBirthTime(profileData.birth_time || '')
        setBirthTimeUnknown(profileData.birth_time_unknown || false)
        setBirthLocation(profileData.birth_location || '')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user?.id])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await saveProfile(user.id, {
        name: name || null,
        birth_date: birthDate || null,
        birth_time: birthTimeUnknown ? null : (birthTime || null),
        birth_time_unknown: birthTimeUnknown,
        birth_location: birthLocation || null,
      })
      setProfile(updated)
      setEditing(false)

      // Regenerate natal chart if birth info changed
      if (birthDate && birthLocation) {
        try {
          const res = await fetch('/api/astro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'natal',
              name: name || undefined,
              birthDate,
              birthTime: birthTimeUnknown ? null : (birthTime || null),
              birthLocation,
            }),
          })
          if (res.ok) {
            const chartData = await res.json()
            await saveChart(user.id, 'natal', chartData)
            setNatalChart(chartData)
          }
        } catch (chartErr) {
          console.warn('Natal chart regeneration failed:', chartErr)
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to save')
    }
    setSaving(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: 'white',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 15,
    marginBottom: 12,
  }

  const labelStyle = {
    display: 'block',
    fontSize: 10,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 6,
  }

  const infoRow = (label, value) => (
    <div style={{ marginBottom: 16 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 17, color: value ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.25)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || 'not set'}
      </div>
    </div>
  )

  function formatDate(dateStr) {
    if (!dateStr) return null
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  function formatTime(timeStr) {
    if (!timeStr) return null
    try {
      const [h, m] = timeStr.split(':')
      const hour = parseInt(h, 10)
      const ampm = hour >= 12 ? 'PM' : 'AM'
      const hour12 = hour % 12 || 12
      return `${hour12}:${m} ${ampm}`
    } catch {
      return timeStr
    }
  }

  const PlanetList = ({ chart }) => {
    if (!chart?.positions) return null
    const planets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'ASC', 'MC']
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {planets.filter(p => chart.positions[p]).map(p => {
          const pos = chart.positions[p]
          return (
            <div key={p} style={{
              background: 'rgba(196,159,255,0.08)',
              border: '1px solid rgba(196,159,255,0.2)',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 11,
              color: 'rgba(255,255,255,0.7)',
            }}>
              {p} {pos.sign?.slice(0, 3)} {pos.degree}°
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5,5,16,0.96)',
      zIndex: 100,
      overflow: 'auto',
      fontFamily: "'Cormorant Garamond', serif",
      color: 'white',
    }}>
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 12,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: 0,
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            ← back
          </button>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.5)',
                fontSize: 11,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                padding: '6px 12px',
                fontFamily: "'Cormorant Garamond', serif",
              }}
            >
              edit
            </button>
          )}
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>
            profile
          </div>
          <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: '0.04em' }}>
            {profile?.name || 'your details'}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
            loading...
          </div>
        ) : editing ? (
          /* Edit Mode */
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: '24px 20px',
              marginBottom: 20,
            }}>
              <label style={labelStyle}>name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="your name"
                style={inputStyle}
              />

              <label style={labelStyle}>birth date</label>
              <input
                type="date"
                value={birthDate}
                onChange={e => setBirthDate(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
              />

              <label style={labelStyle}>birth time</label>
              <input
                type="time"
                value={birthTime}
                onChange={e => setBirthTime(e.target.value)}
                disabled={birthTimeUnknown}
                style={{ ...inputStyle, colorScheme: 'dark', opacity: birthTimeUnknown ? 0.4 : 1 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={birthTimeUnknown}
                  onChange={e => setBirthTimeUnknown(e.target.checked)}
                  style={{ accentColor: '#C49FFF' }}
                />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>I don't know my birth time</span>
              </label>

              <label style={labelStyle}>birth location</label>
              <input
                type="text"
                value={birthLocation}
                onChange={e => setBirthLocation(e.target.value)}
                placeholder="city, state/country"
                style={inputStyle}
              />
            </div>

            {error && (
              <div style={{ color: '#FF7F9B', fontSize: 13, marginBottom: 16, textAlign: 'center', fontStyle: 'italic' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setEditing(false)}
                style={{
                  flex: 1,
                  padding: '14px',
                  borderRadius: 99,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.5)',
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 13,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: '14px',
                  borderRadius: 99,
                  border: '1px solid rgba(196,159,255,0.5)',
                  background: 'rgba(196,159,255,0.18)',
                  color: 'white',
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 13,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? '...' : 'save'}
              </button>
            </div>
          </div>
        ) : (
          /* View Mode */
          <div style={{ animation: 'fadeIn 0.3s ease' }}>
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: '24px 20px',
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>birth info</div>
              {infoRow('name', profile?.name)}
              {infoRow('birth date', formatDate(profile?.birth_date))}
              {infoRow('birth time', profile?.birth_time_unknown ? 'unknown' : formatTime(profile?.birth_time))}
              {infoRow('birth location', profile?.birth_location)}
            </div>

            {natalChart && (
              <div style={{
                background: 'rgba(196,159,255,0.05)',
                border: '1px solid rgba(196,159,255,0.15)',
                borderRadius: 16,
                padding: '20px 20px',
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(196,159,255,0.7)', marginBottom: 12 }}>natal chart uploaded</div>
                <PlanetList chart={natalChart} />
              </div>
            )}

            {/* Sign out */}
            <div style={{ marginTop: 40, textAlign: 'center' }}>
              <button
                onClick={signOut}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,127,155,0.3)',
                  borderRadius: 99,
                  color: 'rgba(255,127,155,0.7)',
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 12,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: '10px 24px',
                }}
              >
                sign out
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  )
}
