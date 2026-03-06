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

    const S = 300
    const cx = S / 2, cy = S / 2
    const RO = 132   // zodiac ring outer
    const RI = 107   // zodiac ring inner / planet boundary
    const RP = 84    // planet base radius
    const RC = 32    // center circle

    const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']
    const ELEMENTS = ['fire','earth','air','water','fire','earth','air','water','fire','earth','air','water']
    const GLYPHS  = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓']
    const EL_COLOR = { fire:'#FF9060', earth:'#B0FF7F', air:'#7FB8FF', water:'#C49FFF' }

    const P_GLYPH = { Sun:'☉', Moon:'☽', Mercury:'☿', Venus:'♀', Mars:'♂', Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇', TrueNode:'☊', Chiron:'⚷' }
    const P_COLOR = { Sun:'#FFD47F', Moon:'#E0E0FF', Mercury:'#A8C8FF', Venus:'#FFB0CC', Mars:'#FF9090', Jupiter:'#FFD090', Saturn:'#D0B880', Uranus:'#80FFE8', Neptune:'#A08AFF', Pluto:'#C880C8', TrueNode:'rgba(255,255,255,0.55)', Chiron:'#FF99CC' }
    const SIGN_LON = { Aries:0,Taurus:30,Gemini:60,Cancer:90,Leo:120,Virgo:150,Libra:180,Scorpio:210,Sagittarius:240,Capricorn:270,Aquarius:300,Pisces:330 }

    const asc = chart.positions.ASC
    const mc  = chart.positions.MC
    const ascLon = asc ? (SIGN_LON[asc.sign]||0) + asc.degree + (asc.minute||0)/60 : 0
    const mcLon  = mc  ? (SIGN_LON[mc.sign]||0)  + mc.degree  + (mc.minute||0)/60  : null

    function lonToAngle(lon) { return (180 - lon + 3600) % 360 }
    function pt(deg, r) {
      const rad = deg * Math.PI / 180
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
    }

    // Full pie sector from center to radius r
    function fullSector(i, r) {
      const s = lonToAngle(i * 30), e = lonToAngle((i + 1) * 30)
      const [x1,y1] = pt(s, r), [x2,y2] = pt(e, r)
      return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,0 ${x2},${y2} Z`
    }

    // Ring sector (RI to RO)
    function ringSector(i) {
      const s = lonToAngle(i * 30), e = lonToAngle((i + 1) * 30)
      const [ox1,oy1] = pt(s, RO), [ox2,oy2] = pt(e, RO)
      const [ix1,iy1] = pt(s, RI), [ix2,iy2] = pt(e, RI)
      return `M${ox1},${oy1} A${RO},${RO} 0 0,0 ${ox2},${oy2} L${ix2},${iy2} A${RI},${RI} 0 0,1 ${ix1},${iy1} Z`
    }

    // Planet spread — alternate radii for planets within 10°
    const rawPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','TrueNode','Chiron']
      .filter(n => chart.positions[n])
      .map(n => { const p = chart.positions[n]; return { name: n, lon: (SIGN_LON[p.sign]||0) + p.degree + (p.minute||0)/60 } })
      .sort((a, b) => a.lon - b.lon)

    const planets = []
    for (let i = 0; i < rawPlanets.length; i++) {
      const p = rawPlanets[i]
      const prev = planets[i - 1] || null
      const prevR = prev ? prev.r : RP
      let r = RP
      if (prev) {
        const diff = Math.min(Math.abs(p.lon - prev.lon), 360 - Math.abs(p.lon - prev.lon))
        if (diff < 10) r = (prevR === RP || prevR === RP + 12) ? RP - 12 : RP + 12
      }
      const angle = lonToAngle(p.lon)
      const [x, y] = pt(angle, r)
      planets.push({ ...p, angle, r, x, y })
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
          <defs>
            <radialGradient id="natalVoidMask" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#050510" stopOpacity="1"/>
              <stop offset="52%"  stopColor="#050510" stopOpacity="1"/>
              <stop offset="78%"  stopColor="#050510" stopOpacity="0.82"/>
              <stop offset="96%"  stopColor="#050510" stopOpacity="0.3"/>
              <stop offset="100%" stopColor="#050510" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="natalCenter" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#0a0120"/>
              <stop offset="100%" stopColor="#050510"/>
            </radialGradient>
            <filter id="natalSectorBlur" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="8"/>
            </filter>
            <filter id="natalPlanetGlow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Dark background */}
          <circle cx={cx} cy={cy} r={RO + 6} fill="#050510"/>

          {/* Rotate chart so ASC sits at 9 o'clock */}
          <g transform={`rotate(${ascLon}, ${cx}, ${cy})`}>

            {/* Element-colored sectors — solid + blurred glow layer (like VibeCircle) */}
            {SIGNS.map((sign, i) => {
              const c = EL_COLOR[ELEMENTS[i]]
              return (
                <g key={sign}>
                  <path d={fullSector(i, RI)} fill={c} fillOpacity={0.30}/>
                  <path d={fullSector(i, RI)} fill={c} fillOpacity={0.14} filter="url(#natalSectorBlur)"/>
                </g>
              )
            })}

            {/* Void gradient mask — fades sectors toward center */}
            <circle cx={cx} cy={cy} r={RI} fill="url(#natalVoidMask)"/>

            {/* Concentric dashed rings (like VibeCircle) */}
            {[0.35, 0.65].map(f => (
              <circle key={f} cx={cx} cy={cy} r={RI * f}
                fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={0.5} strokeDasharray="2,8"/>
            ))}

            {/* Radial spoke lines center → RI, element-colored */}
            {SIGNS.map((_, i) => {
              const c = EL_COLOR[ELEMENTS[i]]
              const [x, y] = pt(lonToAngle(i * 30), RI)
              return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={c} strokeWidth={0.35} strokeOpacity={0.2}/>
            })}

            {/* Inner ring border */}
            <circle cx={cx} cy={cy} r={RI} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5}/>

            {/* Zodiac band (RI → RO) — element-colored ring sectors */}
            {SIGNS.map((sign, i) => (
              <path key={sign} d={ringSector(i)} fill={EL_COLOR[ELEMENTS[i]]} fillOpacity={0.14}/>
            ))}

            {/* Sign dividers in the band */}
            {SIGNS.map((_, i) => {
              const angle = lonToAngle(i * 30)
              const [x1,y1] = pt(angle, RI), [x2,y2] = pt(angle, RO)
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.18)" strokeWidth={0.5}/>
            })}

            {/* Outer ring border */}
            <circle cx={cx} cy={cy} r={RO} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5}/>

            {/* Zodiac glyphs — counter-rotated to stay upright */}
            {SIGNS.map((sign, i) => {
              const c = EL_COLOR[ELEMENTS[i]]
              const [x, y] = pt(lonToAngle(i * 30 + 15), (RO + RI) / 2)
              return (
                <text key={sign} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                  fontSize={12} fill={c} fillOpacity={0.9}
                  transform={`rotate(${-ascLon}, ${x}, ${y})`}>
                  {GLYPHS[i]}
                </text>
              )
            })}

            {/* ASC / DSC axis */}
            {asc && <line x1={cx-RO} y1={cy} x2={cx+RO} y2={cy} stroke="rgba(196,159,255,0.55)" strokeWidth={1} strokeDasharray="3,2"/>}

            {/* MC / IC axis */}
            {mcLon != null && (() => {
              const a = lonToAngle(mcLon)
              const [x1,y1] = pt(a, RO), [x2,y2] = pt((a + 180) % 360, RO)
              return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(127,184,255,0.38)" strokeWidth={1} strokeDasharray="3,2"/>
            })()}

            {/* ASC label */}
            {asc && (() => {
              const [x, y] = pt(180, RI - 17)
              return <text x={x} y={y} textAnchor="end" dominantBaseline="central"
                fontSize={7.5} fill="rgba(196,159,255,0.9)" letterSpacing="0.1em"
                transform={`rotate(${-ascLon}, ${x}, ${y})`}>ASC</text>
            })()}

            {/* MC label */}
            {mcLon != null && (() => {
              const [x, y] = pt(lonToAngle(mcLon) - 1, RI - 17)
              return <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
                fontSize={7.5} fill="rgba(127,184,255,0.9)" letterSpacing="0.1em"
                transform={`rotate(${-ascLon}, ${x}, ${y})`}>MC</text>
            })()}

            {/* Planets with glow */}
            {planets.map(p => (
              <text key={p.name} x={p.x} y={p.y}
                textAnchor="middle" dominantBaseline="central"
                fontSize={14} fill={P_COLOR[p.name]}
                filter="url(#natalPlanetGlow)"
                transform={`rotate(${-ascLon}, ${p.x}, ${p.y})`}>
                {P_GLYPH[p.name]}
              </text>
            ))}

            {/* Center void */}
            <circle cx={cx} cy={cy} r={RC} fill="url(#natalCenter)" stroke="rgba(255,255,255,0.07)" strokeWidth={0.5}/>
          </g>

          {/* Center label — outside rotation so it stays upright */}
          <text x={cx} y={cy - 7} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.22)" letterSpacing="0.2em">NATAL</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.22)" letterSpacing="0.2em">CHART</text>
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
