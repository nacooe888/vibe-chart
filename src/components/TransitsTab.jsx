import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { loadChart, saveChart } from "../lib/chartStorage";
import { loadProfile } from "../lib/profileStorage";

const PLANET_ORDER = ['Moon','Sun','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

const PLANET_GLYPHS = {
  Moon:'☽', Sun:'☉', Mercury:'☿', Venus:'♀', Mars:'♂',
  Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'⯓',
  Chiron:'⚷', TrueNode:'☊',
};

const PLANET_COLORS = {
  Moon:'#E0E0FF', Sun:'#FFD47F', Mercury:'#A8C8FF', Venus:'#FFB0CC', Mars:'#FF9090',
  Jupiter:'#FFD090', Saturn:'#D0B880', Uranus:'#80FFE8', Neptune:'#A08AFF', Pluto:'#C49FFF',
  Chiron:'#D0C8A0', TrueNode:'#B0B0B0',
};

const SIGN_GLYPHS = {
  Aries:'♈', Taurus:'♉', Gemini:'♊', Cancer:'♋', Leo:'♌', Virgo:'♍',
  Libra:'♎', Scorpio:'♏', Sagittarius:'♐', Capricorn:'♑', Aquarius:'♒', Pisces:'♓',
};

const ELEMENTS = {
  Aries:'fire', Taurus:'earth', Gemini:'air', Cancer:'water',
  Leo:'fire', Virgo:'earth', Libra:'air', Scorpio:'water',
  Sagittarius:'fire', Capricorn:'earth', Aquarius:'air', Pisces:'water',
};

const EL_COLOR = { fire:'#FF9060', earth:'#B0FF7F', air:'#7FB8FF', water:'#C49FFF' };

const SIGNS_DEG = {
  Aries:0, Taurus:30, Gemini:60, Cancer:90, Leo:120, Virgo:150,
  Libra:180, Scorpio:210, Sagittarius:240, Capricorn:270, Aquarius:300, Pisces:330,
};

const ASPECTS = [
  { deg:0, name:'conjunct', glyph:'☌' },
  { deg:60, name:'sextile', glyph:'⚹' },
  { deg:90, name:'square', glyph:'□' },
  { deg:120, name:'trine', glyph:'△' },
  { deg:180, name:'opposite', glyph:'☍' },
];

// Planets that can retrograde and form multi-pass arcs
const ARC_PLANETS = ['Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
// Outer planets have wide retrograde arcs — if within orb while Rx, likely multi-pass
const OUTER_PLANETS = ['Jupiter','Saturn','Uranus','Neptune','Pluto'];

const SPEED_LABELS = {
  Moon: 'fastest · ~2.5 days per sign',
  Sun: '~30 days per sign',
  Mercury: '~15–60 days per sign',
  Venus: '~23–60 days per sign',
  Mars: '~6 weeks per sign',
  Jupiter: '~1 year per sign',
  Saturn: '~2.5 years per sign',
  Uranus: '~7 years per sign',
  Neptune: '~14 years per sign',
  Pluto: '~12–30 years per sign',
};

function toAbs(sign, deg, min = 0) {
  return (SIGNS_DEG[sign] || 0) + deg + min / 60;
}

function orbBetween(a, b) {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

// Determine the signed angular difference from transit to the exact aspect point
// Positive = transit is ahead of the aspect degree (separating if direct)
// Negative = transit is behind (applying if direct)
function signedAspectDiff(tAbs, nAbs, aspectDeg) {
  // Find which direction the aspect is
  let diff = (tAbs - nAbs + 360) % 360;
  if (diff > 180) diff -= 360;
  // How far from exact aspect
  const fromAspect = Math.abs(diff) - aspectDeg;
  return fromAspect;
}

function findAspects(planet, transitPos, natalPositions) {
  if (!natalPositions) return [];
  const tAbs = toAbs(transitPos.sign, transitPos.degree, transitPos.minute);
  const isRetrograde = transitPos.retrograde === true;
  const speed = transitPos.speed;
  const canArc = ARC_PLANETS.includes(planet);
  const isOuter = OUTER_PLANETS.includes(planet);
  const results = [];
  const natalPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','ASC','MC'];

  natalPlanets.forEach(np => {
    const npos = natalPositions[np];
    if (!npos) return;
    const nAbs = toAbs(npos.sign, npos.degree, npos.minute);

    ASPECTS.forEach(asp => {
      const orb = Math.abs(orbBetween(tAbs, nAbs) - asp.deg);
      if (orb <= 5) {
        // Determine applying vs separating
        // If speed is available, use it: the transit is applying if it's moving toward the exact aspect
        let status = null;
        if (speed != null && speed !== 0) {
          const diff = signedAspectDiff(tAbs, nAbs, asp.deg);
          // If moving forward (speed > 0) and diff < 0, we're approaching = applying
          // If moving forward and diff > 0, we've passed = separating
          // Retrograde reverses this
          if (Math.abs(diff) < 0.1) {
            status = 'exact';
          } else if (speed > 0) {
            status = diff < 0 ? 'applying' : 'separating';
          } else {
            status = diff > 0 ? 'applying' : 'separating';
          }
        }

        // Arc detection for planets that retrograde
        let arc = null;
        if (canArc && orb <= 5) {
          if (isRetrograde) {
            // Currently retrograde and within orb = likely in a multi-pass arc (2nd pass)
            arc = { type: 'multi-pass', phase: 'retrograde pass' };
          } else if (isOuter && orb <= 3 && status === 'applying') {
            // Outer planet, direct, tight orb, applying — could be 1st or 3rd pass
            // We can't fully distinguish without historical data, but we flag it
            arc = { type: 'possible arc', phase: 'direct pass' };
          }
        }

        results.push({ natal: np, aspect: asp, orb, status, arc, isRetrograde });
      }
    });
  });
  results.sort((a, b) => a.orb - b.orb);
  return results;
}

export default function TransitsTab() {
  const { user } = useAuth();
  const [transitChart, setTransitChart] = useState(null);
  const [natalChart, setNatalChart] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    // Load natal chart
    loadChart(user.id, 'natal').then(async existing => {
      if (existing) { setNatalChart(existing); return; }
      try {
        const profile = await loadProfile(user.id);
        if (profile?.birth_date && profile?.birth_location) {
          const res = await fetch('/api/astro', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-PostHog-Distinct-Id': user.id },
            body: JSON.stringify({
              type: 'natal',
              name: profile.name || undefined,
              birthDate: profile.birth_date,
              birthTime: profile.birth_time_unknown ? null : (profile.birth_time || null),
              birthLocation: profile.birth_location,
            }),
          });
          if (res.ok) {
            const chartData = await res.json();
            await saveChart(user.id, 'natal', chartData);
            setNatalChart(chartData);
          }
        }
      } catch (e) {
        console.warn('[natal] auto-generate failed:', e);
      }
    });

    // Load transit chart (same logic as EnergyReport)
    (async () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const lsKey = `vibe_transit_${user.id}`;

      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const age = Date.now() - new Date(parsed.fetchedAt).getTime();
          if (age < ONE_HOUR_MS) {
            setTransitChart(parsed);
            setLoading(false);
            return;
          }
        }
      } catch (e) { /* ignore */ }

      const cached = await loadChart(user.id, 'transits');
      const isStale = !cached?.fetchedAt || Date.now() - new Date(cached.fetchedAt).getTime() > ONE_HOUR_MS;
      if (!isStale) {
        setTransitChart(cached);
        try { localStorage.setItem(lsKey, JSON.stringify(cached)); } catch (e) {}
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/astro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PostHog-Distinct-Id': user.id },
          body: JSON.stringify({ type: 'transits' }),
        });
        if (res.ok) {
          const fresh = await res.json();
          saveChart(user.id, 'transits', fresh);
          try { localStorage.setItem(lsKey, JSON.stringify(fresh)); } catch (e) {}
          setTransitChart(fresh);
        } else if (cached) {
          setTransitChart(cached);
        }
      } catch (err) {
        console.error('[transits] fetch error:', err);
        if (cached) setTransitChart(cached);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  // Failsafe — give Vercel serverless function time to cold-start
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 30000);
    return () => clearTimeout(t);
  }, []);

  const positions = transitChart?.positions;
  const dateLabel = transitChart?.date || 'today';

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 40% 25%, rgba(160,138,255,0.1) 0%, transparent 55%), #050510",
      fontFamily: "'Cormorant Garamond', serif",
      color: "white",
      padding: "36px 20px 100px",
    }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.25)",
            marginBottom: 10,
          }}>
            today's sky
          </div>
          <h1 style={{
            fontWeight: 300,
            fontSize: 40,
            margin: 0,
            letterSpacing: "0.06em",
          }}>transits</h1>
          <div style={{
            width: 36,
            height: 1,
            background: "rgba(255,255,255,0.1)",
            margin: "15px auto 0",
          }}/>
          {!loading && positions && (
            <div style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.3)",
              marginTop: 12,
              letterSpacing: "0.12em",
              fontStyle: "italic",
            }}>
              sidereal fagan-allen · {dateLabel}
            </div>
          )}
        </div>

        {loading ? (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "rgba(255,255,255,0.3)",
          }}>
            <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
              reading the sky...
            </div>
          </div>
        ) : !positions ? (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "rgba(255,255,255,0.3)",
            fontSize: 14,
            lineHeight: 1.8,
          }}>
            no transit data available yet — try visiting the report tab first, then come back
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PLANET_ORDER.map((planet, i) => {
              const pos = positions[planet];
              if (!pos) return null;
              const color = PLANET_COLORS[planet];
              const signColor = EL_COLOR[ELEMENTS[pos.sign]] || 'rgba(255,255,255,0.6)';
              const aspects = findAspects(planet, pos, natalChart?.positions);
              const tightAspects = aspects.filter(a => a.orb <= 3);
              const isRx = pos.retrograde === true;

              return (
                <div key={planet} style={{
                  background: `${color}08`,
                  border: `1px solid ${color}1a`,
                  borderRadius: 16,
                  padding: "18px 20px",
                  animation: `fadeUp 0.5s ${i * 0.06}s ease both`,
                }}>
                  {/* Planet row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{
                      fontSize: 30,
                      color,
                      fontFamily: "serif",
                      width: 38,
                      textAlign: "center",
                      lineHeight: 1,
                      flexShrink: 0,
                    }}>
                      {PLANET_GLYPHS[planet]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        marginBottom: 3,
                        flexWrap: "wrap",
                      }}>
                        <div style={{
                          fontSize: 17,
                          color,
                          letterSpacing: "0.06em",
                          fontWeight: 400,
                        }}>
                          {planet}
                        </div>
                        <div style={{
                          fontSize: 14,
                          color: "rgba(255,255,255,0.35)",
                          letterSpacing: "0.04em",
                        }}>
                          {pos.degree}°{pos.minute ? pos.minute + "'" : ''} {pos.sign}
                        </div>
                        <div style={{
                          fontSize: 16,
                          color: signColor,
                          opacity: 0.7,
                        }}>
                          {SIGN_GLYPHS[pos.sign]}
                        </div>
                        {isRx && (
                          <div style={{
                            fontSize: 10,
                            color: '#FF9090',
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            border: '1px solid rgba(255,144,144,0.25)',
                            borderRadius: 6,
                            padding: '2px 6px',
                            lineHeight: 1.4,
                          }}>
                            Rx
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.2)",
                        letterSpacing: "0.1em",
                      }}>
                        {SPEED_LABELS[planet]}
                      </div>
                    </div>
                  </div>

                  {/* Natal aspects */}
                  {tightAspects.length > 0 && (
                    <div style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: `1px solid ${color}12`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}>
                      {tightAspects.slice(0, 4).map((a, j) => (
                        <div key={j}>
                          <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.55)",
                          }}>
                            <span style={{ color, opacity: 0.6, fontSize: 14, width: 16, textAlign: "center" }}>
                              {a.aspect.glyph}
                            </span>
                            <span>
                              {a.aspect.name} natal {a.natal}
                            </span>
                            {a.status && (
                              <span style={{
                                fontSize: 10,
                                color: a.status === 'exact' ? color : 'rgba(255,255,255,0.3)',
                                letterSpacing: "0.08em",
                                fontStyle: "italic",
                              }}>
                                {a.status}
                              </span>
                            )}
                            <span style={{
                              color: a.orb < 1 ? color : "rgba(255,255,255,0.25)",
                              fontSize: 11,
                              marginLeft: "auto",
                            }}>
                              {a.orb.toFixed(1)}°
                            </span>
                            {a.orb < 1 && (
                              <span style={{
                                fontSize: 9,
                                color,
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                opacity: 0.7,
                              }}>
                                exact
                              </span>
                            )}
                          </div>
                          {/* Arc indicator */}
                          {a.arc && (
                            <div style={{
                              marginLeft: 24,
                              marginTop: 3,
                              fontSize: 10,
                              letterSpacing: "0.1em",
                              color: a.arc.type === 'multi-pass' ? '#FF9090' : 'rgba(255,255,255,0.25)',
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}>
                              <span style={{ opacity: 0.6 }}>↻</span>
                              <span>
                                {a.arc.type === 'multi-pass'
                                  ? `multi-pass arc — ${a.arc.phase}`
                                  : `${a.arc.phase} — watch for retrograde arc`
                                }
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
