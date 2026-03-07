import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { saveProfile } from '../lib/profileStorage'
import { saveChart } from '../lib/chartStorage'
import { capture } from '../lib/analytics'

const STEPS = ['welcome', 'birth', 'sidereal', 'experience', 'depth', 'transits', 'tutorial']

export default function Onboarding({ onComplete }) {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Birth info
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [birthTime, setBirthTime] = useState('')
  const [birthTimeUnknown, setBirthTimeUnknown] = useState(false)
  const [birthLocation, setBirthLocation] = useState('')

  // Preferences
  const [experienceLevel, setExperienceLevel] = useState(null)
  const [depthPreference, setDepthPreference] = useState(null)
  const [transitPreference, setTransitPreference] = useState(null)

  const currentStep = STEPS[step]
  const isLastStep = step === STEPS.length - 1

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

  function OptionCard({ selected, onClick, emoji, label, description }) {
    return (
      <div
        onClick={onClick}
        style={{
          padding: '18px 20px',
          borderRadius: 16,
          border: selected ? '1px solid rgba(196,159,255,0.6)' : '1px solid rgba(255,255,255,0.08)',
          background: selected ? 'rgba(196,159,255,0.15)' : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {emoji && <span style={{ fontSize: 22 }}>{emoji}</span>}
          <div>
            <div style={{ fontSize: 16, color: selected ? 'white' : 'rgba(255,255,255,0.85)', fontWeight: 400 }}>
              {label}
            </div>
            {description && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {description}
              </div>
            )}
          </div>
        </div>
      </div>
    )
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
        experience_level: experienceLevel || 'new',
        depth_preference: depthPreference || 'adaptive',
        transit_preference: transitPreference || 'adaptive',
      })

      // Generate natal chart if birth info is provided
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
          }
        } catch (chartErr) {
          console.warn('Natal chart generation failed:', chartErr)
        }
      }

      capture('onboarding_completed', {
        has_birth_date: !!birthDate,
        has_birth_time: !!birthTime && !birthTimeUnknown,
        has_birth_location: !!birthLocation,
        experience_level: experienceLevel || 'new',
        depth_preference: depthPreference || 'adaptive',
        transit_preference: transitPreference || 'adaptive',
      })

      onComplete()
    } catch (err) {
      setError(err.message || 'Failed to save')
      setSaving(false)
    }
  }

  function canProceed() {
    if (currentStep === 'welcome') return true
    if (currentStep === 'birth') return true // all optional
    if (currentStep === 'sidereal') return true
    if (currentStep === 'experience') return experienceLevel !== null
    if (currentStep === 'depth') return depthPreference !== null
    if (currentStep === 'transits') return transitPreference !== null
    if (currentStep === 'tutorial') return true
    return true
  }

  function handleNext() {
    if (isLastStep) {
      handleComplete()
    } else {
      setStep(step + 1)
    }
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
        maxWidth: 420,
        animation: 'fadeIn 0.6s ease',
      }}>

        {/* ─── Welcome Screen ─── */}
        {currentStep === 'welcome' && (
          <div style={{ textAlign: 'center', animation: 'fadeIn 0.6s ease' }}>
            <h1 style={{
              fontWeight: 300,
              fontSize: 52,
              margin: 0,
              letterSpacing: '0.02em',
              marginBottom: 20,
            }}>
              vibe chart
            </h1>
            <div style={{
              fontSize: 18,
              color: 'rgba(255,255,255,0.6)',
              fontStyle: 'italic',
              lineHeight: 1.6,
              marginBottom: 48,
              padding: '0 20px',
            }}>
              map the shape of your inner sky
            </div>
            <button
              onClick={handleNext}
              style={{
                padding: '16px 48px',
                borderRadius: 99,
                border: '1px solid rgba(196,159,255,0.5)',
                background: 'rgba(196,159,255,0.18)',
                color: 'white',
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: 15,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: '0 0 30px rgba(196,159,255,0.25)',
              }}
            >
              let's begin
            </button>
          </div>
        )}

        {/* ─── Birth Info Screen ─── */}
        {currentStep === 'birth' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <StepHeader
              step={1}
              total={6}
              title="when were you born?"
              subtitle="this helps us calculate your chart"
            />
            <ProgressBar current={1} total={6} />

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding: '24px 22px',
            }}>
              <label style={labelStyle}>your name</label>
              <input
                type="text"
                placeholder="how should we address you?"
                value={name}
                onChange={e => setName(e.target.value)}
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
                style={{ ...inputStyle, marginBottom: 0 }}
              />
            </div>

            <NavButtons step={step} setStep={setStep} canProceed={canProceed()} onNext={handleNext} saving={saving} isLastStep={isLastStep} />
          </div>
        )}

        {/* ─── Sidereal Explanation Screen ─── */}
        {currentStep === 'sidereal' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <StepHeader
              step={2}
              total={6}
              title="a different sky"
              subtitle="how we read your chart"
            />
            <ProgressBar current={2} total={6} />

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding: '28px 24px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 20, opacity: 0.8 }}>✦</div>
              <div style={{
                fontSize: 16,
                lineHeight: 1.9,
                color: 'rgba(255,255,255,0.75)',
                fontWeight: 300,
              }}>
                Vibe Chart uses the <span style={{ color: '#C49FFF' }}>sidereal zodiac</span> with
                Fagan-Allen ayanamsa — aligned to where the stars actually are in the sky today.
                It might look different if you're used to western tropical astrology, which is based on the seasons of the earth rather than the stars in the sky.
              </div>
              <div style={{
                fontSize: 14,
                color: 'rgba(255,255,255,0.4)',
                marginTop: 20,
                fontStyle: 'italic',
              }}>
                Your signs may shift. Your chart becomes more precise.
              </div>
              <div style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.3)',
                marginTop: 20,
                padding: '12px 16px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 10,
              }}>
                tropical zodiac option coming soon
              </div>
            </div>

            <NavButtons step={step} setStep={setStep} canProceed={canProceed()} onNext={handleNext} saving={saving} isLastStep={isLastStep} />
          </div>
        )}

        {/* ─── Experience Level Screen ─── */}
        {currentStep === 'experience' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <StepHeader
              step={3}
              total={6}
              title="how well do you know your chart?"
              subtitle="this shapes how we explain things"
            />
            <ProgressBar current={3} total={6} />

            <div>
              <OptionCard
                selected={experienceLevel === 'new'}
                onClick={() => setExperienceLevel('new')}
                emoji="🌱"
                label="I'm new to astrology"
                description="Start with the essentials"
              />
              <OptionCard
                selected={experienceLevel === 'basics'}
                onClick={() => setExperienceLevel('basics')}
                emoji="🌙"
                label="I know the basics"
                description="Sun, moon, rising — let's go deeper"
              />
              <OptionCard
                selected={experienceLevel === 'advanced'}
                onClick={() => setExperienceLevel('advanced')}
                emoji="✨"
                label="I dream in aspects"
                description="Give me the full picture"
              />
            </div>

            <NavButtons step={step} setStep={setStep} canProceed={canProceed()} onNext={handleNext} saving={saving} isLastStep={isLastStep} />
          </div>
        )}

        {/* ─── Reading Depth Screen ─── */}
        {currentStep === 'depth' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <StepHeader
              step={4}
              total={6}
              title="how do you like your cosmic intel?"
              subtitle="we'll tailor your readings"
            />
            <ProgressBar current={4} total={6} />

            <div>
              <OptionCard
                selected={depthPreference === 'light'}
                onClick={() => setDepthPreference('light')}
                emoji="🌙"
                label="Keep it light"
                description="Quick hits, gentle guidance"
              />
              <OptionCard
                selected={depthPreference === 'deep'}
                onClick={() => setDepthPreference('deep')}
                emoji="⚡"
                label="Go deep"
                description="I want the full download"
              />
              <OptionCard
                selected={depthPreference === 'adaptive'}
                onClick={() => setDepthPreference('adaptive')}
                emoji="✨"
                label="Start gentle, deepen over time"
                description="Let it unfold naturally"
              />
            </div>

            <NavButtons step={step} setStep={setStep} canProceed={canProceed()} onNext={handleNext} saving={saving} isLastStep={isLastStep} />
          </div>
        )}

        {/* ─── Hard Transits Screen ─── */}
        {currentStep === 'transits' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <StepHeader
              step={5}
              total={6}
              title="how do you receive hard transits?"
              subtitle="when the sky gets intense"
            />
            <ProgressBar current={5} total={6} />

            <div>
              <OptionCard
                selected={transitPreference === 'soft'}
                onClick={() => setTransitPreference('soft')}
                emoji="🌸"
                label="Soften it"
                description="Gentle framing, focus on growth"
              />
              <OptionCard
                selected={transitPreference === 'direct'}
                onClick={() => setTransitPreference('direct')}
                emoji="⚡"
                label="Tell me straight"
                description="No sugar coating needed"
              />
              <OptionCard
                selected={transitPreference === 'adaptive'}
                onClick={() => setTransitPreference('adaptive')}
                emoji="🌊"
                label="Read the room"
                description="Match the intensity to my vibe"
              />
            </div>

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

            <NavButtons step={step} setStep={setStep} canProceed={canProceed()} onNext={handleNext} saving={saving} isLastStep={isLastStep} />
          </div>
        )}

        {/* ─── Vibe Wheel Tutorial Screen ─── */}
        {currentStep === 'tutorial' && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <StepHeader
              step={6}
              total={6}
              title="your vibe wheel"
              subtitle="how to map your inner sky"
            />
            <ProgressBar current={6} total={6} />

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding: '24px 22px',
            }}>
              {/* Mini vibe wheel illustration */}
              <div style={{
                width: 140,
                height: 140,
                margin: '0 auto 24px',
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, #FF6B8A, #FFB366, #FFE066, #8AE68A, #66D9E8, #C49FFF, #FF99CC, #FF6B8A)',
                opacity: 0.6,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute',
                  inset: '40%',
                  borderRadius: '50%',
                  background: '#050510',
                }} />
              </div>

              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.7)',
                  lineHeight: 1.8,
                  marginBottom: 16,
                }}>
                  The vibe wheel is your emotional compass.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12,
                }}>
                  <span style={{ fontSize: 18 }}>👆</span>
                  <div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
                      Tap to plot
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                      Touch anywhere on the wheel to mark where your energy is
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12,
                }}>
                  <span style={{ fontSize: 18 }}>✍️</span>
                  <div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
                      Draw to express
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                      Switch to draw mode for a more fluid, gestural entry
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 12,
                }}>
                  <span style={{ fontSize: 18 }}>🌈</span>
                  <div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
                      Colors are vibes
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                      Each region represents a different emotional quality
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.4)',
                textAlign: 'center',
                marginTop: 20,
                fontStyle: 'italic',
              }}>
                you can always revisit this from the profile menu
              </div>
            </div>

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

            <NavButtons step={step} setStep={setStep} canProceed={canProceed()} onNext={handleNext} saving={saving} isLastStep={isLastStep} />
          </div>
        )}

      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}

function StepHeader({ step, total, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={{
        fontSize: 11,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)',
        marginBottom: 10,
      }}>
        step {step} of {total}
      </div>
      <h1 style={{
        fontWeight: 300,
        fontSize: 26,
        margin: 0,
        letterSpacing: '0.02em',
        lineHeight: 1.3,
      }}>
        {title}
      </h1>
      {subtitle && (
        <div style={{
          fontSize: 13,
          color: 'rgba(255,255,255,0.4)',
          marginTop: 8,
          fontStyle: 'italic',
        }}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ current, total }) {
  return (
    <div style={{
      height: 2,
      background: 'rgba(255,255,255,0.08)',
      borderRadius: 99,
      marginBottom: 24,
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${(current / total) * 100}%`,
        background: 'linear-gradient(90deg, #C49FFF, #7FB8FF)',
        borderRadius: 99,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

function NavButtons({ step, setStep, canProceed, onNext, saving, isLastStep }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
      {step > 0 && (
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
        onClick={onNext}
        disabled={!canProceed || saving}
        style={{
          flex: step === 0 ? 1 : 2,
          padding: '14px 24px',
          borderRadius: 99,
          border: '1px solid rgba(196,159,255,0.5)',
          background: canProceed ? 'rgba(196,159,255,0.18)' : 'rgba(255,255,255,0.05)',
          color: canProceed ? 'white' : 'rgba(255,255,255,0.3)',
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: 13,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          cursor: canProceed && !saving ? 'pointer' : 'default',
          boxShadow: canProceed ? '0 0 24px rgba(196,159,255,0.2)' : 'none',
          opacity: canProceed ? 1 : 0.6,
        }}
      >
        {saving ? '...' : isLastStep ? 'enter the map' : 'continue'}
      </button>
    </div>
  )
}
