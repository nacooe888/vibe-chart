import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { loadChart, saveChart } from "../lib/chartStorage";
import { loadProfile } from "../lib/profileStorage";
import { buildSkyContext, getSkyContext } from "./EnergyReport";
import { patternDetailPrompt } from "../lib/prompts";
import { supabase } from "../lib/supabase";

async function claudeFetch(body) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { "Authorization": `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

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

// ── Pattern Detection ────────────────────────────────────────────────────────

function getAllAspects(transitPositions, natalPositions) {
  if (!transitPositions || !natalPositions) return [];
  const all = [];
  const transitPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
  const natalPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','ASC','MC'];

  transitPlanets.forEach(tp => {
    const tpos = transitPositions[tp];
    if (!tpos) return;
    const tAbs = toAbs(tpos.sign, tpos.degree, tpos.minute);

    natalPlanets.forEach(np => {
      const npos = natalPositions[np];
      if (!npos) return;
      const nAbs = toAbs(npos.sign, npos.degree, npos.minute);

      ASPECTS.forEach(asp => {
        const orb = Math.abs(orbBetween(tAbs, nAbs) - asp.deg);
        if (orb <= 5) {
          all.push({ transit: tp, natal: np, aspect: asp, orb });
        }
      });
    });
  });
  return all;
}

function detectPatterns(transitPositions, natalPositions) {
  const patterns = [];
  const allAspects = getAllAspects(transitPositions, natalPositions);
  if (allAspects.length === 0) return patterns;

  // 1. Mass activation — one transit planet aspecting 3+ natal points (orb ≤ 4)
  const byTransit = {};
  allAspects.filter(a => a.orb <= 4).forEach(a => {
    if (!byTransit[a.transit]) byTransit[a.transit] = [];
    byTransit[a.transit].push(a);
  });
  Object.entries(byTransit).forEach(([planet, aspects]) => {
    if (aspects.length >= 3) {
      aspects.sort((a, b) => a.orb - b.orb);
      patterns.push({
        type: 'mass-activation',
        icon: '◎',
        planet,
        color: PLANET_COLORS[planet] || '#C49FFF',
        title: `${planet} is activating ${aspects.length} natal points`,
        subtitle: aspects.map(a => `${a.aspect.name} ${a.natal} (${a.orb.toFixed(1)}°)`).join(' · '),
      });
    }
  });

  // 2. Reciprocal transits — planet A aspects natal B AND planet B aspects natal A
  const seen = new Set();
  allAspects.filter(a => a.orb <= 5).forEach(a => {
    const mirror = allAspects.find(b =>
      b.transit === a.natal && b.natal === a.transit && b.orb <= 5
    );
    if (mirror) {
      const key = [a.transit, a.natal].sort().join('-');
      if (!seen.has(key)) {
        seen.add(key);
        patterns.push({
          type: 'reciprocal',
          icon: '⟡',
          planet: a.transit,
          color: PLANET_COLORS[a.transit] || '#C49FFF',
          color2: PLANET_COLORS[a.natal] || '#C49FFF',
          title: `${a.transit} ↔ ${a.natal} reciprocal`,
          subtitle: `${a.transit} ${a.aspect.name} natal ${a.natal} (${a.orb.toFixed(1)}°) — ${a.natal} ${mirror.aspect.name} natal ${a.transit} (${mirror.orb.toFixed(1)}°)`,
        });
      }
    }
  });

  // 3. Convergence — 2+ transit planets hitting the same natal point (orb ≤ 4)
  const byNatal = {};
  allAspects.filter(a => a.orb <= 4).forEach(a => {
    if (!byNatal[a.natal]) byNatal[a.natal] = [];
    byNatal[a.natal].push(a);
  });
  Object.entries(byNatal).forEach(([natal, aspects]) => {
    if (aspects.length >= 2) {
      aspects.sort((a, b) => a.orb - b.orb);
      patterns.push({
        type: 'convergence',
        icon: '✦',
        planet: natal,
        color: PLANET_COLORS[natal] || '#C49FFF',
        title: `${aspects.length} transits hitting natal ${natal}`,
        subtitle: aspects.map(a => `${a.transit} ${a.aspect.name} (${a.orb.toFixed(1)}°)`).join(' · '),
      });
    }
  });

  // Sort: reciprocals first, then mass-activation, then convergence
  const typeOrder = { 'reciprocal': 0, 'mass-activation': 1, 'convergence': 2 };
  patterns.sort((a, b) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9));

  return patterns;
}

const PATTERN_LABELS = {
  'mass-activation': 'mass activation',
  'reciprocal': 'reciprocal transit',
  'convergence': 'convergence',
};

// ── Timeline: average daily motion (degrees) for estimating transit windows ──

const AVG_DAILY_MOTION = {
  Sun: 0.9856, Mercury: 1.2, Venus: 1.2, Mars: 0.524,
  Jupiter: 0.0831, Saturn: 0.0335, Uranus: 0.0119, Neptune: 0.006, Pluto: 0.004,
};

// Skip Moon (too fast to be useful on a monthly+ chart)
const TIMELINE_PLANETS = ['Sun','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

function computeTransitWindows(transitPositions, natalPositions) {
  if (!transitPositions || !natalPositions) return [];
  const windows = [];
  const now = new Date();
  const natalPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','ASC','MC'];

  TIMELINE_PLANETS.forEach(tp => {
    const tpos = transitPositions[tp];
    if (!tpos) return;
    const tAbs = toAbs(tpos.sign, tpos.degree, tpos.minute);
    const speed = AVG_DAILY_MOTION[tp] || 0.01;
    const isRx = tpos.retrograde === true;
    const maxOrb = OUTER_PLANETS.includes(tp) ? 5 : 2;

    natalPlanets.forEach(np => {
      const npos = natalPositions[np];
      if (!npos) return;
      const nAbs = toAbs(npos.sign, npos.degree, npos.minute);

      ASPECTS.forEach(asp => {
        const orb = Math.abs(orbBetween(tAbs, nAbs) - asp.deg);
        if (orb > maxOrb) return;

        // Estimate days from now to enter/leave orb
        // For retrograde planets, the window is roughly 2x because they pass, reverse, pass again
        const rxMultiplier = isRx ? 2.5 : 1;
        const daysPerDeg = 1 / speed;
        const daysToExact = orb * daysPerDeg;
        const windowHalf = maxOrb * daysPerDeg * rxMultiplier;

        // Determine if applying or separating to place the exact date
        const diff = signedAspectDiff(tAbs, nAbs, asp.deg);
        let exactDate;
        if (Math.abs(diff) < 0.15) {
          exactDate = now;
        } else if ((!isRx && diff < 0) || (isRx && diff > 0)) {
          // applying
          exactDate = new Date(now.getTime() + daysToExact * 86400000);
        } else {
          // separating
          exactDate = new Date(now.getTime() - daysToExact * 86400000);
        }

        const start = new Date(exactDate.getTime() - windowHalf * 86400000);
        const end = new Date(exactDate.getTime() + windowHalf * 86400000);

        windows.push({
          transit: tp,
          natal: np,
          aspect: asp,
          orb,
          start,
          end,
          exact: exactDate,
          color: PLANET_COLORS[tp],
          label: `${asp.glyph} ${np}`,
          isRx,
        });
      });
    });
  });

  // Sort by planet order, then by start date
  const order = Object.fromEntries(TIMELINE_PLANETS.map((p, i) => [p, i]));
  windows.sort((a, b) => (order[a.transit] ?? 99) - (order[b.transit] ?? 99) || a.start - b.start);
  return windows;
}

// ── Timeline Chart Component ────────────────────────────────────────────────

function useTimelineData(windows, scale) {
  const now = new Date();
  let rangeStart, rangeEnd;

  if (scale === 'month') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (scale === 'quarter') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  } else {
    rangeStart = new Date(now.getFullYear(), 0, 1);
    rangeEnd = new Date(now.getFullYear(), 11, 31);
  }

  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const toPercent = (date) => {
    const clamped = Math.max(rangeStart.getTime(), Math.min(rangeEnd.getTime(), date.getTime()));
    return ((clamped - rangeStart.getTime()) / totalMs) * 100;
  };

  const visible = windows.filter(w => w.end >= rangeStart && w.start <= rangeEnd);
  const planetGroups = {};
  visible.forEach(w => {
    if (!planetGroups[w.transit]) planetGroups[w.transit] = [];
    planetGroups[w.transit].push(w);
  });
  const rows = [];
  TIMELINE_PLANETS.forEach(p => {
    if (planetGroups[p]) rows.push({ planet: p, windows: planetGroups[p] });
  });

  const ticks = [];
  if (scale === 'month') {
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 7)) {
      ticks.push({ pos: toPercent(new Date(d)), label: d.getDate().toString() });
    }
  } else if (scale === 'quarter') {
    for (let m = 0; m < 3; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
      ticks.push({ pos: toPercent(d), label: d.toLocaleDateString('en-US', { month: 'short' }) });
    }
  } else {
    for (let m = 0; m < 12; m++) {
      const d = new Date(now.getFullYear(), m, 1);
      ticks.push({ pos: toPercent(d), label: d.toLocaleDateString('en-US', { month: 'short' }).charAt(0) });
    }
  }

  return { rows, ticks, toPercent, nowPercent: toPercent(now), rangeStart, rangeEnd };
}

// Mini preview for the sky tab — tappable, no controls
function TimelinePreview({ windows, onClick }) {
  const { rows, ticks, toPercent, nowPercent } = useTimelineData(windows, 'quarter');
  if (rows.length === 0) return null;

  const ROW_H = 22;
  const GLYPH_W = 28;

  return (
    <div onClick={onClick} style={{
      cursor: "pointer",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      padding: "14px 14px 8px",
      transition: "border-color 0.2s",
    }}>
      <div style={{ position: "relative", marginLeft: GLYPH_W + 6 }}>
        <div style={{ position: "relative", height: 14, marginBottom: 4 }}>
          {ticks.map((t, i) => (
            <div key={i} style={{
              position: "absolute", left: `${t.pos}%`, fontSize: 8,
              color: "rgba(255,255,255,0.15)", transform: "translateX(-50%)", whiteSpace: "nowrap",
            }}>{t.label}</div>
          ))}
        </div>
        <div style={{
          position: "absolute", left: `${nowPercent}%`, top: 14, bottom: 0,
          width: 1, background: "rgba(255,255,255,0.12)", zIndex: 1,
        }}/>
      </div>

      {rows.map((row) => (
        <div key={row.planet} style={{ display: "flex", alignItems: "center", height: ROW_H }}>
          <div style={{
            width: GLYPH_W, textAlign: "center", fontSize: 14,
            color: PLANET_COLORS[row.planet], flexShrink: 0, opacity: 0.7,
          }}>{PLANET_GLYPHS[row.planet]}</div>
          <div style={{ flex: 1, position: "relative", height: 12, marginLeft: 6 }}>
            <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.025)" }}/>
            {row.windows.map((w, wi) => {
              const left = toPercent(w.start);
              const right = toPercent(w.end);
              const width = Math.max(right - left, 0.5);
              return (
                <div key={wi} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 1, bottom: 1 }}>
                  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${w.color}00, ${w.color}30, ${w.color}00)`, borderRadius: 3 }}/>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{
        textAlign: "center", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.2)", marginTop: 6, paddingTop: 6,
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}>
        tap to expand timeline
      </div>
    </div>
  );
}

// Full-screen detailed timeline with scale toggle and labels
function TimelineFull({ windows, onBack }) {
  const [scale, setScale] = useState('quarter');
  const { rows, ticks, toPercent, nowPercent } = useTimelineData(windows, scale);

  const ROW_H = 44;
  const GLYPH_W = 40;

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 40% 25%, rgba(160,138,255,0.1) 0%, transparent 55%), #050510",
      fontFamily: "'Cormorant Garamond', serif",
      color: "white",
      padding: "36px 20px 100px",
    }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.4)",
          fontFamily: "'Cormorant Garamond',serif", fontSize: 14, letterSpacing: "0.1em",
          cursor: "pointer", marginBottom: 24,
        }}>← back to sky</button>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.34em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
            transit timeline
          </div>
          <h1 style={{ fontWeight: 300, fontSize: 34, margin: 0, letterSpacing: "0.06em" }}>overlap</h1>
          <div style={{ width: 36, height: 1, background: "rgba(255,255,255,0.1)", margin: "15px auto 0" }}/>
        </div>

        {/* Scale toggle */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 24 }}>
          {['month', 'quarter', 'year'].map(s => (
            <button key={s} onClick={() => setScale(s)} style={{
              padding: "6px 18px", borderRadius: 99,
              border: `1px solid ${scale === s ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
              background: scale === s ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: scale === s ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)',
              fontFamily: "'Cormorant Garamond',serif", fontSize: 13, letterSpacing: "0.12em",
              cursor: "pointer", transition: "all 0.2s",
            }}>{s}</button>
          ))}
        </div>

        {/* Chart */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 18,
          padding: "20px 18px 14px",
        }}>
          {/* Time axis */}
          <div style={{ position: "relative", marginLeft: GLYPH_W + 10 }}>
            <div style={{ position: "relative", height: 20, marginBottom: 8 }}>
              {ticks.map((t, i) => (
                <div key={i} style={{
                  position: "absolute", left: `${t.pos}%`, fontSize: 10,
                  color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em",
                  transform: "translateX(-50%)", whiteSpace: "nowrap",
                }}>{t.label}</div>
              ))}
            </div>
            <div style={{
              position: "absolute", left: `${nowPercent}%`, top: 20, bottom: 0,
              width: 1, background: "rgba(255,255,255,0.18)", zIndex: 2,
            }}/>
            {/* "now" label */}
            <div style={{
              position: "absolute", left: `${nowPercent}%`, top: 6,
              transform: "translateX(-50%)", fontSize: 8, letterSpacing: "0.15em",
              color: "rgba(255,255,255,0.35)", textTransform: "uppercase", zIndex: 3,
            }}>now</div>
          </div>

          {rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
              no active transits in this range
            </div>
          ) : rows.map((row, ri) => (
            <div key={row.planet} style={{
              display: "flex", alignItems: "center", height: ROW_H,
              animation: `fadeUp 0.3s ${ri * 0.04}s ease both`,
              borderTop: ri > 0 ? "1px solid rgba(255,255,255,0.03)" : "none",
            }}>
              {/* Planet glyph + name */}
              <div style={{ width: GLYPH_W, textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontSize: 22, color: PLANET_COLORS[row.planet], lineHeight: 1, opacity: 0.85 }}>
                  {PLANET_GLYPHS[row.planet]}
                </div>
                <div style={{ fontSize: 8, color: PLANET_COLORS[row.planet], opacity: 0.4, letterSpacing: "0.06em", marginTop: 2 }}>
                  {row.planet.slice(0, 3)}
                </div>
              </div>

              {/* Bar area */}
              <div style={{ flex: 1, position: "relative", height: 24, marginLeft: 10 }}>
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.03)" }}/>

                {row.windows.map((w, wi) => {
                  const left = toPercent(w.start);
                  const right = toPercent(w.end);
                  const width = Math.max(right - left, 0.8);
                  const exactPos = toPercent(w.exact);
                  const exactInBar = width > 0 ? ((exactPos - left) / width) * 100 : 50;

                  return (
                    <div key={wi} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 2, bottom: 2 }}>
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: 5,
                        background: `linear-gradient(90deg, ${w.color}00, ${w.color}40, ${w.color}00)`,
                      }}/>
                      {/* Exact date marker */}
                      <div style={{
                        position: "absolute", left: `${exactInBar}%`, top: 0, bottom: 0,
                        width: 2, background: w.color, borderRadius: 1, opacity: 0.8,
                      }}/>
                      {/* Aspect label */}
                      {width > 3 && (
                        <div style={{
                          position: "absolute", top: "50%", left: "50%",
                          transform: "translate(-50%, -50%)", fontSize: 9,
                          color: w.color, opacity: 0.8, whiteSpace: "nowrap", letterSpacing: "0.06em",
                        }}>{w.label}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 20, textAlign: "center", fontSize: 10,
          color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", lineHeight: 2,
        }}>
          bright line = exact date · gradient bar = active window (within orb)
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}

export default function TransitsTab() {
  const { user } = useAuth();
  const [transitChart, setTransitChart] = useState(null);
  const [natalChart, setNatalChart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPattern, setSelectedPattern] = useState(null);
  const [patternDetail, setPatternDetail] = useState(null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const patternCache = useRef({});

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

    // Load transit chart — always fetches independently
    (async () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const lsKey = `vibe_transit_${user.id}`;
      let cached = null;

      // 1. Check localStorage (instant)
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const age = Date.now() - new Date(parsed.fetchedAt).getTime();
          if (age < ONE_HOUR_MS && parsed.positions) {
            setTransitChart(parsed);
            setLoading(false);
            return;
          }
          cached = parsed; // stale but usable as fallback
        }
      } catch (e) { /* ignore */ }

      // 2. Check Supabase
      if (!cached) {
        const fromDb = await loadChart(user.id, 'transits');
        if (fromDb) {
          cached = fromDb;
          const age = fromDb.fetchedAt ? Date.now() - new Date(fromDb.fetchedAt).getTime() : Infinity;
          if (age < ONE_HOUR_MS && fromDb.positions) {
            setTransitChart(fromDb);
            try { localStorage.setItem(lsKey, JSON.stringify(fromDb)); } catch (e) {}
            setLoading(false);
            return;
          }
        }
      }

      // 3. Fetch fresh from API
      try {
        console.log('[sky] fetching fresh transits from /api/astro');
        const res = await fetch('/api/astro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PostHog-Distinct-Id': user.id },
          body: JSON.stringify({ type: 'transits' }),
        });
        if (res.ok) {
          const fresh = await res.json();
          console.log('[sky] got fresh transits:', Object.keys(fresh.positions || {}));
          saveChart(user.id, 'transits', fresh);
          try { localStorage.setItem(lsKey, JSON.stringify(fresh)); } catch (e) {}
          setTransitChart(fresh);
        } else {
          const errText = await res.text();
          console.error('[sky] /api/astro failed:', res.status, errText);
          if (cached) setTransitChart(cached);
        }
      } catch (err) {
        console.error('[sky] fetch error:', err);
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
  const patterns = detectPatterns(positions, natalChart?.positions);
  const transitWindows = computeTransitWindows(positions, natalChart?.positions);

  async function openPatternDetail(pattern) {
    setSelectedPattern(pattern);
    const cacheKey = `${pattern.type}-${pattern.planet}-${pattern.title}`;
    if (patternCache.current[cacheKey]) {
      setPatternDetail(patternCache.current[cacheKey]);
      return;
    }
    setPatternDetail(null);
    setPatternLoading(true);
    try {
      const skyCtx = getSkyContext(natalChart, transitChart);
      const prompt = patternDetailPrompt(pattern, skyCtx);
      const res = await claudeFetch({
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const json = JSON.parse(text.replace(/```json|```/g, "").trim());
      patternCache.current[cacheKey] = json;
      setPatternDetail(json);
    } catch (e) {
      console.error('[pattern detail]', e);
      setPatternDetail({ error: true });
    }
    setPatternLoading(false);
  }

  // Timeline full view
  if (showTimeline) {
    return <TimelineFull windows={transitWindows} onBack={() => setShowTimeline(false)} />;
  }

  // Pattern detail overlay
  if (selectedPattern) {
    const p = selectedPattern;
    const color = p.color;
    return (
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 40% 25%, rgba(160,138,255,0.1) 0%, transparent 55%), #050510",
        fontFamily: "'Cormorant Garamond', serif",
        color: "white",
        padding: "36px 20px 100px",
      }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <button onClick={() => { setSelectedPattern(null); setPatternDetail(null); }}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontFamily: "'Cormorant Garamond',serif", fontSize: 14, letterSpacing: "0.1em", cursor: "pointer", marginBottom: 24 }}>
            ← back to sky
          </button>

          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ fontSize: 32, color, marginBottom: 8 }}>{p.icon}</div>
            <div style={{
              fontSize: 9,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color,
              opacity: 0.7,
              marginBottom: 10,
            }}>
              {PATTERN_LABELS[p.type]}
            </div>
            <h2 style={{ fontWeight: 300, fontSize: 26, margin: 0, letterSpacing: "0.04em", lineHeight: 1.4 }}>
              {p.title}
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 10, letterSpacing: "0.06em", lineHeight: 1.7 }}>
              {p.subtitle}
            </div>
          </div>

          {patternLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>
              <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>reading this pattern...</div>
            </div>
          ) : patternDetail?.error ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
              couldn't load detail — try again later
            </div>
          ) : patternDetail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { key: 'duration', label: 'how long it\'s active', icon: '◷' },
                { key: 'rarity', label: 'how rare this is', icon: '◇' },
                { key: 'interpretation', label: 'what it means', icon: '◎' },
                { key: 'howToWork', label: 'how to work with it', icon: '⟡' },
              ].map(({ key, label, icon }, i) => (
                <div key={key} style={{
                  background: `${color}08`,
                  border: `1px solid ${color}15`,
                  borderRadius: 14,
                  padding: "16px 20px",
                  animation: `fadeUp 0.4s ${i * 0.1}s ease both`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 16, color, opacity: 0.6 }}>{icon}</span>
                    <span style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color, opacity: 0.6 }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", lineHeight: 1.8, letterSpacing: "0.02em" }}>
                    {patternDetail[key]}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
          @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.8} }
        `}</style>
      </div>
    );
  }

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
            couldn't load transit data — try refreshing the page
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Patterns section */}
            {patterns.length > 0 && (
              <>
                <div style={{
                  fontSize: 10,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.2)",
                  textAlign: "center",
                  marginBottom: 4,
                }}>
                  active patterns
                </div>
                {patterns.map((p, i) => (
                  <div key={i} onClick={() => openPatternDetail(p)} style={{
                    background: p.type === 'reciprocal'
                      ? `linear-gradient(135deg, ${p.color}12, ${p.color2}12)`
                      : `${p.color}12`,
                    border: `1px solid ${p.color}30`,
                    borderRadius: 16,
                    padding: "18px 20px",
                    animation: `fadeUp 0.5s ${i * 0.08}s ease both`,
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{
                        fontSize: 24,
                        color: p.color,
                        width: 32,
                        textAlign: "center",
                        flexShrink: 0,
                      }}>
                        {p.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: 9,
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          color: p.color,
                          opacity: 0.7,
                          marginBottom: 4,
                        }}>
                          {PATTERN_LABELS[p.type]}
                        </div>
                        <div style={{
                          fontSize: 16,
                          color: "rgba(255,255,255,0.85)",
                          letterSpacing: "0.04em",
                          lineHeight: 1.4,
                        }}>
                          {p.title}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      letterSpacing: "0.06em",
                      lineHeight: 1.7,
                      paddingLeft: 44,
                    }}>
                      {p.subtitle}
                    </div>
                  </div>
                ))}
                <div style={{
                  width: 36,
                  height: 1,
                  background: "rgba(255,255,255,0.06)",
                  margin: "10px auto 6px",
                }}/>
              </>
            )}

            {/* Transit Timeline Preview */}
            {transitWindows.length > 0 && (
              <>
                <div style={{
                  fontSize: 10,
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.2)",
                  textAlign: "center",
                  marginTop: 10,
                  marginBottom: 8,
                }}>
                  transit timeline
                </div>
                <TimelinePreview windows={transitWindows} onClick={() => setShowTimeline(true)} />
                <div style={{
                  width: 36,
                  height: 1,
                  background: "rgba(255,255,255,0.06)",
                  margin: "14px auto 6px",
                }}/>
              </>
            )}

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
