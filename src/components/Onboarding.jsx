import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { saveProfile } from '../lib/profileStorage'
import { saveChart } from '../lib/chartStorage'

export default function Onboarding({ onComplete }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false)
  const [birthLocation, setBirthLocation] = useState('')

  const totalSteps = 2

  const inputStyle = {
    width: '100%',
    padding: '14px 18px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12,
    color: 'white',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 16,
    marginBottom: 14,
  }

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 8,
  }

  async function handleComplete() {
    setSaving(true)
    setError(null)

    try {
      await saveProfile(user.id, {
        name: name || null,
        birth_date: birthDate || null,
        birth_time: birthTimeUnknown ? null : (birthTime || null),
        birth_time_unknown: birthTimeUnknown,
        birth_location: birthLocation || null,
      })

      // Generate natal chart if birth info is provided (non-blocking)
      if (birthDate && birthLocation) {
        try {
          const res = await fetch('/api/astro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PostHog-Distinct-Id': user.id },
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
          }
        } catch (chartErr) {
          console.warn('Natal chart generation failed, continuing:', chartErr)
        }
      }

      onComplete()
    } catch (err) {
      setError(err.message || 'Failed to save profile')
      setSaving(false)
    }
  }

  function handleSkip() {
    onComplete()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 40% 35%, rgba(196,159,255,0.12) 0%, transparent 55%), #050510',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: "'Cormorant Garamond', serif",
      color: 'white',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        animation: 'fadeIn 0.6s ease',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
            marginBottom: 10,
          }}>
            step {step} of {totalSteps}
          </div>
          <h1 style={{
            fontWeight: 300,
            fontSize: 32,
            margin: 0,
            letterSpacing: '0.04em',
          }}>
            {step === 1 && 'who are you?'}
            {step === 2 && 'when were you born?'}
          </h1>
          <div style={{
            fontSize: 13,
            color: 'rgba(255,255,255,0.4)',
            marginTop: 10,
            fontStyle: 'italic',
          }}>
            {step === 1 && 'we use this to personalize your readings'}
            {step === 2 && 'for accurate chart calculations'}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 2,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 99,
          marginBottom: 32,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${(step / totalSteps) * 100}%`,
            background: 'linear-gradient(90deg, #C49FFF, #7FB8FF)',
            borderRadius: 99,
            transition: 'width 0.4s ease',
          }} />
        </div>

        {/* Form content */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20,
          padding: '28px 24px',
        }}>
          {step === 1 && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
              <label style={labelStyle}>your name</label>
              <input
                type="text"
                placeholder="how should we address you?"
                value={name}
                onChange={e => setName(e.target.value)}
                style={inputStyle}
                autoFocus
              />
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.25)',
                textAlign: 'center',
                marginTop: 8,
                fontStyle: 'italic',
              }}>
                optional — you can skip this
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={{ animation: 'fadeIn 0.4s ease' }}>
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
                style={{
                  ...inputStyle,
                  colorScheme: 'dark',
                  opacity: birthTimeUnknown ? 0.4 : 1,
                }}
              />
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 20,
                cursor: 'pointer',
              }}>
                <input
                  type="checkbox"
                  checked={birthTimeUnknown}
                  onChange={e => setBirthTimeUnknown(e.target.checked)}
                  style={{ accentColor: '#C49FFF' }}
                />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                  I don't know my birth time
                </span>
              </label>

              <label style={labelStyle}>birth location</label>
              <input
                type="text"
                placeholder="city, state/country"
                value={birthLocation}
                onChange={e => setBirthLocation(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}

          {error && (
            <div style={{
              color: '#FF7F9B',
              fontSize: 13,
              marginTop: 16,
              textAlign: 'center',
              fontStyle: 'italic',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 24,
        }}>
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{
                flex: 1,
                padding: '14px 24px',
                borderRadius: 99,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'transparent',
                color: 'rgba(255,255,255,0.5)',
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 13,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              back
            </button>
          )}
          <button
            onClick={() => {
              if (step < totalSteps) setStep(step + 1)
              else handleComplete()
            }}
            disabled={saving}
            style={{
              flex: step === 1 ? 1 : 2,
              padding: '14px 24px',
              borderRadius: 99,
              border: '1px solid rgba(196,159,255,0.5)',
              background: 'rgba(196,159,255,0.18)',
              color: 'white',
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 13,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: saving ? 'wait' : 'pointer',
              boxShadow: '0 0 24px rgba(196,159,255,0.2)',
            }}
          >
            {saving ? '...' : step < totalSteps ? 'continue' : 'enter the map'}
          </button>
        </div>

        {/* Skip option */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={handleSkip}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.25)',
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: 12,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            skip for now
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
