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

  const BirthChartWheel = ({ chart }) => {
    if (!chart?.positions) return null

    const SIZE = 286
    const cx = SIZE / 2, cy = SIZE / 2
    const RO = 124  // zodiac ring outer
    const RI = 97   // zodiac ring inner
    const RP = 76   // planet base radius
    const RC = 40   // center circle

    const ZODIAC_GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓']
    const ELEMENTS = ['fire','earth','air','water','fire','earth','air','water','fire','earth','air','water']
    const EL_FILL   = { fire:'rgba(255,140,75,0.14)',  earth:'rgba(127,200,127,0.11)', air:'rgba(127,184,255,0.13)', water:'rgba(196,159,255,0.17)' }
    const EL_STROKE = { fire:'rgba(255,140,75,0.32)',  earth:'rgba(127,200,127,0.28)', air:'rgba(127,184,255,0.28)', water:'rgba(196,159,255,0.38)' }

    const GLYPH  = { Sun:'☉', Moon:'☽', Mercury:'☿', Venus:'♀', Mars:'♂', Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇', TrueNode:'☊', Chiron:'⚷' }
    const PCOLOR = { Sun:'#FFD47F', Moon:'#E0E0FF', Mercury:'#A8C8FF', Venus:'#FFB0CC', Mars:'#FF9090', Jupiter:'#FFD090', Saturn:'#D0B880', Uranus:'#80FFE8', Neptune:'#A08AFF', Pluto:'#C880C8', TrueNode:'rgba(255,255,255,0.6)', Chiron:'#FF99CC' }
    const SIGNS_LON = { Aries:0,Taurus:30,Gemini:60,Cancer:90,Leo:120,Virgo:150,Libra:180,Scorpio:210,Sagittarius:240,Capricorn:270,Aquarius:300,Pisces:330 }

    const asc = chart.positions.ASC
    const mc  = chart.positions.MC
    const ascLon = asc ? (SIGNS_LON[asc.sign]||0) + asc.degree + (asc.minute||0)/60 : 0
    const mcLon  = mc  ? (SIGNS_LON[mc.sign]||0)  + mc.degree  + (mc.minute||0)/60  : null

    function pt(deg, r) {
      const rad = deg * Math.PI / 180
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
    }
    // In base orientation (pre-rotation), 0° Aries is at SVG 180° (left)
    // Zodiac increases counterclockwise; group rotates by ascLon° to place ASC at left
    function lonToAngle(lon) { return (180 - lon + 3600) % 360 }

    function sectorPath(i) {
      const s = 180 - i * 30, e = s - 30
      const [x1,y1] = pt(s, RO), [x2,y2] = pt(e, RO)
      const [xi1,yi1] = pt(s, RI), [xi2,yi2] = pt(e, RI)
      return `M ${x1} ${y1} A ${RO} ${RO} 0 0 0 ${x2} ${y2} L ${xi2} ${yi2} A ${RI} ${RI} 0 0 1 ${xi1} ${yi1} Z`
    }

    // Build planet list, sort by longitude, spread close conjunctions to alternate radii
    const rawPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','TrueNode','Chiron']
      .filter(n => chart.positions[n])
      .map(n => { const p = chart.positions[n]; return { name: n, lon: (SIGNS_LON[p.sign]||0) + p.degree + (p.minute||0)/60 } })
      .sort((a, b) => a.lon - b.lon)

    const planets = []
    for (let i = 0; i < rawPlanets.length; i++) {
      const p = rawPlanets[i]
      const prev = planets[i - 1] || null
      const prevR = prev ? prev.r : RP
      let r = RP
      if (prev) {
        const diff = Math.min(Math.abs(p.lon - prev.lon), 360 - Math.abs(p.lon - prev.lon))
        if (diff < 10) r = (prevR === RP || prevR === RP + 14) ? RP - 13 : RP + 14
      }
      const angle = lonToAngle(p.lon)
      const [x, y] = pt(angle, r)
      planets.push({ ...p, angle, r, x, y })
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Rotate entire chart so ASC lands at SVG 180° (left / 9 o'clock) */}
          <g transform={`rotate(${ascLon}, ${cx}, ${cy})`}>

            {/* Zodiac ring */}
            {Array.from({length:12}, (_,i) => (
              <path key={i} d={sectorPath(i)} fill={EL_FILL[ELEMENTS[i]]} stroke={EL_STROKE[ELEMENTS[i]]} strokeWidth={0.5} />
            ))}

            {/* Sign dividers */}
            {Array.from({length:12}, (_,i) => {
              const [x1,y1] = pt(180 - i*30, RI), [x2,y2] = pt(180 - i*30, RO)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
            })}

            {/* Zodiac glyphs — counter-rotated so they read upright */}
            {Array.from({length:12}, (_,i) => {
              const [x,y] = pt(165 - i*30, (RO+RI)/2)
              return (
                <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={11} fill="rgba(255,255,255,0.5)"
                  transform={`rotate(${-ascLon}, ${x}, ${y})`}>
                  {ZODIAC_GLYPHS[i]}
                </text>
              )
            })}

            {/* Inner ring border */}
            <circle cx={cx} cy={cy} r={RI} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={0.5} />

            {/* ASC / DSC axis */}
            {asc && <line x1={cx-RO} y1={cy} x2={cx+RO} y2={cy} stroke="rgba(196,159,255,0.5)" strokeWidth={1} strokeDasharray="3,2" />}

            {/* MC / IC axis */}
            {mcLon != null && (() => {
              const a = lonToAngle(mcLon)
              const [x1,y1] = pt(a, RO), [x2,y2] = pt((a+180)%360, RO)
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(127,184,255,0.35)" strokeWidth={1} strokeDasharray="3,2" />
            })()}

            {/* ASC label */}
            {asc && (() => {
              const [x,y] = pt(178, RI - 10)
              return <text x={x} y={y} textAnchor="end" dominantBaseline="central" fontSize={7} fill="rgba(196,159,255,0.85)" transform={`rotate(${-ascLon}, ${x}, ${y})`}>ASC</text>
            })()}

            {/* MC label */}
            {mcLon != null && (() => {
              const [x,y] = pt(lonToAngle(mcLon) - 2, RI - 10)
              return <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={7} fill="rgba(127,184,255,0.85)" transform={`rotate(${-ascLon}, ${x}, ${y})`}>MC</text>
            })()}

            {/* Planets */}
            {planets.map(p => (
              <text key={p.name} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                fontSize={12} fill={PCOLOR[p.name]}
                transform={`rotate(${-ascLon}, ${p.x}, ${p.y})`}>
                {GLYPH[p.name]}
              </text>
            ))}

            {/* Center fill */}
            <circle cx={cx} cy={cy} r={RC} fill="rgba(5,5,16,0.92)" stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} />
          </g>

          {/* Center label (not rotated) */}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.22)" letterSpacing="0.18em">NATAL</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.22)" letterSpacing="0.18em">CHART</text>
        </svg>
      </div>
    )
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
                background: 'rgba(196,159,255,0.04)',
                border: '1px solid rgba(196,159,255,0.13)',
                borderRadius: 16,
                padding: '20px 20px',
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(196,159,255,0.6)', marginBottom: 4 }}>natal chart</div>
                <BirthChartWheel chart={natalChart} />
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
