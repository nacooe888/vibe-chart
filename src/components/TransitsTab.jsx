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
  Jupiter:'♃', Saturn:'♄', Uranus:'♅', Neptune:'♆', Pluto:'♇',
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

const TIMELINE_PLANETS = ['Sun','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];

const PLANET_WEIGHT = {
  Pluto: 10, Neptune: 9, Uranus: 8, Saturn: 7, Jupiter: 6,
  Mars: 4, Venus: 3, Mercury: 2, Sun: 2,
};

// Typical retrograde durations and station distances (degrees) for multi-pass arc estimation
const RETRO_INFO = {
  Mercury:  { rxDays: 21,  stationDeg: 12 },
  Venus:    { rxDays: 42,  stationDeg: 15 },
  Mars:     { rxDays: 75,  stationDeg: 18 },
  Jupiter:  { rxDays: 120, stationDeg: 10 },
  Saturn:   { rxDays: 138, stationDeg: 7 },
  Uranus:   { rxDays: 150, stationDeg: 4 },
  Neptune:  { rxDays: 158, stationDeg: 2.5 },
  Pluto:    { rxDays: 160, stationDeg: 2.5 },
};

function computeTransitWindows(transitPositions, natalPositions, reciprocals) {
  if (!transitPositions || !natalPositions) return [];
  const windows = [];
  const now = new Date();
  const DAY = 86400000;
  const natalPlanets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','ASC','MC'];
  const reciprocalSet = new Set((reciprocals || []).map(r => r.title));

  TIMELINE_PLANETS.forEach(tp => {
    const tpos = transitPositions[tp];
    if (!tpos) return;
    const tAbs = toAbs(tpos.sign, tpos.degree, tpos.minute);
    const speed = AVG_DAILY_MOTION[tp] || 0.01;
    const isRx = tpos.retrograde === true;
    const maxOrb = OUTER_PLANETS.includes(tp) ? 5 : 2;
    const retro = RETRO_INFO[tp];

    natalPlanets.forEach(np => {
      const npos = natalPositions[np];
      if (!npos) return;
      const nAbs = toAbs(npos.sign, npos.degree, npos.minute);

      ASPECTS.forEach(asp => {
        const orb = Math.abs(orbBetween(tAbs, nAbs) - asp.deg);
        if (orb > maxOrb) return;

        const daysPerDeg = 1 / speed;
        const daysToExact = orb * daysPerDeg;

        // Determine current exact date
        const diff = signedAspectDiff(tAbs, nAbs, asp.deg);
        let exactDate;
        if (Math.abs(diff) < 0.15) {
          exactDate = now;
        } else if ((!isRx && diff < 0) || (isRx && diff > 0)) {
          exactDate = new Date(now.getTime() + daysToExact * DAY);
        } else {
          exactDate = new Date(now.getTime() - daysToExact * DAY);
        }

        // Compute peaks array (multi-pass arc detection)
        let peaks = [exactDate];
        const isMultiPass = retro && ARC_PLANETS.includes(tp) && orb <= retro.stationDeg;

        if (isMultiPass) {
          const halfRx = retro.rxDays * DAY;
          if (isRx) {
            // Currently Rx — this is pass 2, estimate pass 1 and 3
            peaks = [
              new Date(exactDate.getTime() - halfRx),
              exactDate,
              new Date(exactDate.getTime() + halfRx),
            ];
          } else if (diff < 0) {
            // Direct, applying — this will be pass 1, Rx brings it back for 2, direct for 3
            peaks = [
              exactDate,
              new Date(exactDate.getTime() + halfRx * 0.8),
              new Date(exactDate.getTime() + halfRx * 1.6),
            ];
          } else {
            // Direct, separating — could be pass 3 (final), or pass 1 with Rx coming
            // If orb is very tight and separating, more likely pass 1 or 3
            if (OUTER_PLANETS.includes(tp) && orb < 2) {
              peaks = [
                new Date(exactDate.getTime() - halfRx * 1.6),
                new Date(exactDate.getTime() - halfRx * 0.8),
                exactDate,
              ];
            }
          }
        }

        // Window spans from first peak - windowHalf to last peak + windowHalf
        const windowHalf = maxOrb * daysPerDeg * DAY;
        const start = new Date(peaks[0].getTime() - windowHalf);
        const end = new Date(peaks[peaks.length - 1].getTime() + windowHalf);

        const aspWeight = asp.deg === 0 ? 2 : asp.deg === 180 ? 1.5 : 1;
        const score = (PLANET_WEIGHT[tp] || 1) * (1 / Math.max(orb, 0.1)) * aspWeight;

        const isReciprocal = reciprocalSet.has(`${tp} ↔ ${np} reciprocal`) ||
                             reciprocalSet.has(`${np} ↔ ${tp} reciprocal`);

        const rowLabel = `${PLANET_GLYPHS[tp] || tp} ${asp.glyph} ${PLANET_GLYPHS[np] || np}`;
        const rowName = `${tp} ${asp.name} ${np}`;

        windows.push({
          transit: tp, natal: np, aspect: asp, orb,
          start, end, peaks,
          color: PLANET_COLORS[tp],
          rowLabel, rowName,
          isRx, score, isReciprocal,
          isMultiPass: peaks.length > 1,
        });
      });
    });
  });

  windows.sort((a, b) => b.score - a.score);
  return windows.slice(0, 15);
}

// ── Timeline Chart Component ────────────────────────────────────────────────
// Month = current calendar month. Quarter = prev/current/next month. Year = full year.

function getCalendarRange(scale) {
  const now = new Date();
  if (scale === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    };
  } else if (scale === 'quarter') {
    // Current month in the middle: prev month, current month, next month
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 2, 0),
    };
  } else {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: new Date(now.getFullYear(), 11, 31),
    };
  }
}

function getCalendarTicks(scale, rangeStart, rangeEnd, toPercent) {
  const ticks = [];
  if (scale === 'month') {
    for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 7)) {
      const t = new Date(d);
      ticks.push({ pos: toPercent(t), label: `${t.getDate()}` });
    }
  } else if (scale === 'quarter') {
    for (let m = -1; m <= 1; m++) {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() + m, 1);
      ticks.push({ pos: toPercent(d), label: d.toLocaleDateString('en-US', { month: 'short' }) });
    }
  } else {
    for (let m = 0; m < 12; m++) {
      const d = new Date(rangeStart.getFullYear(), m, 1);
      ticks.push({ pos: toPercent(d), label: d.toLocaleDateString('en-US', { month: 'short' }).slice(0, 3) });
    }
  }
  return ticks;
}

// Build SVG gradient with multiple peaks for multi-pass arcs
function multiPeakGradient(id, color, peakPcts) {
  // Build stops: start at 0 opacity, rise to each peak, dip between peaks, end at 0
  const stops = [];
  stops.push(<stop key="s" offset="0%" stopColor={color} stopOpacity="0" />);

  if (peakPcts.length === 1) {
    const p = Math.max(2, Math.min(98, peakPcts[0]));
    stops.push(<stop key="p0" offset={`${p}%`} stopColor={color} stopOpacity="0.5" />);
  } else {
    peakPcts.forEach((p, i) => {
      const clamped = Math.max(2, Math.min(98, p));
      // Dip before peak (unless first)
      if (i > 0) {
        const mid = (peakPcts[i - 1] + clamped) / 2;
        stops.push(<stop key={`d${i}`} offset={`${mid}%`} stopColor={color} stopOpacity="0.08" />);
      }
      stops.push(<stop key={`p${i}`} offset={`${clamped}%`} stopColor={color} stopOpacity="0.5" />);
    });
  }

  stops.push(<stop key="e" offset="100%" stopColor={color} stopOpacity="0" />);

  return <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="0%">{stops}</linearGradient>;
}

// Mini preview — compact tappable Gantt
function TimelinePreview({ windows, onClick }) {
  const now = new Date();
  const { start: rangeStart, end: rangeEnd } = getCalendarRange('quarter');
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const toPercent = (d) => ((Math.max(rangeStart.getTime(), Math.min(rangeEnd.getTime(), d.getTime())) - rangeStart.getTime()) / totalMs) * 100;
  const nowPct = toPercent(now);
  const visible = windows.filter(w => w.end >= rangeStart && w.start <= rangeEnd).slice(0, 8);
  const ticks = getCalendarTicks('quarter', rangeStart, rangeEnd, toPercent);

  if (visible.length === 0) return null;

  const LABEL_W = 70;
  const ROW_H = 20;

  return (
    <div onClick={onClick} style={{
      cursor: "pointer", background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
      padding: "14px 14px 8px", transition: "border-color 0.2s",
    }}>
      <div style={{ position: "relative", marginLeft: LABEL_W + 6, height: 14, marginBottom: 4 }}>
        {ticks.map((t, i) => (
          <div key={i} style={{
            position: "absolute", left: `${t.pos}%`, fontSize: 8,
            color: "rgba(255,255,255,0.15)", transform: "translateX(-50%)", whiteSpace: "nowrap",
          }}>{t.label}</div>
        ))}
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", left: LABEL_W + 6, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", left: `${nowPct}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.1)" }}/>
        </div>

        {visible.map((w, i) => {
          const left = toPercent(w.start);
          const right = toPercent(w.end);
          const width = Math.max(right - left, 0.8);
          const peakPcts = w.peaks.map(p => width > 0 ? ((toPercent(p) - left) / width) * 100 : 50);
          const gId = `prev-${i}`;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", height: ROW_H }}>
              <div style={{
                width: LABEL_W, fontSize: 9, color: w.color, opacity: 0.6,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                letterSpacing: "0.04em", flexShrink: 0,
              }}>{w.rowLabel}</div>
              <div style={{ flex: 1, position: "relative", height: 10, marginLeft: 6 }}>
                <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.02)" }}/>
                <svg style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 0, height: "100%" }} preserveAspectRatio="none" viewBox="0 0 100 10">
                  <defs>{multiPeakGradient(gId, w.color, peakPcts)}</defs>
                  <rect x="0" y="1" width="100" height="8" rx="3" fill={`url(#${gId})`} />
                  {peakPcts.map((p, j) => <line key={j} x1={p} y1="0" x2={p} y2="10" stroke={w.color} strokeWidth="1" opacity="0.7" />)}
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        textAlign: "center", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "rgba(255,255,255,0.2)", marginTop: 8, paddingTop: 6,
        borderTop: "1px solid rgba(255,255,255,0.04)",
      }}>
        tap to expand · {windows.length} transits
      </div>
    </div>
  );
}

// Full-screen Gantt — clickable rows, multi-peak arcs, calendar ranges
function TimelineFull({ windows, onBack, onSelectTransit }) {
  const [scale, setScale] = useState('quarter');
  const now = new Date();
  const { start: rangeStart, end: rangeEnd } = getCalendarRange(scale);
  const totalMs = rangeEnd.getTime() - rangeStart.getTime();
  const toPercent = (d) => ((Math.max(rangeStart.getTime(), Math.min(rangeEnd.getTime(), d.getTime())) - rangeStart.getTime()) / totalMs) * 100;
  const nowPct = toPercent(now);
  const visible = windows.filter(w => w.end >= rangeStart && w.start <= rangeEnd);
  const ticks = getCalendarTicks(scale, rangeStart, rangeEnd, toPercent);

  const scaleLabels = {
    month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    quarter: 'this quarter',
    year: `${new Date().getFullYear()}`,
  };

  const LABEL_W = 120;
  const ROW_H = 52;

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 40% 25%, rgba(160,138,255,0.1) 0%, transparent 55%), #050510",
      fontFamily: "'Cormorant Garamond', serif",
      color: "white",
      padding: "36px 16px 100px",
    }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
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
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 6 }}>
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
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", marginBottom: 20, fontStyle: "italic" }}>
          {scaleLabels[scale]} · {visible.length} active
        </div>

        {/* Chart */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 18,
          padding: "20px 16px 14px",
        }}>
          {/* Time axis */}
          <div style={{ position: "relative", marginLeft: LABEL_W + 10, height: 22, marginBottom: 6 }}>
            {ticks.map((t, i) => (
              <div key={i} style={{
                position: "absolute", left: `${t.pos}%`, fontSize: 10,
                color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em",
                transform: "translateX(-50%)", whiteSpace: "nowrap",
              }}>{t.label}</div>
            ))}
          </div>

          {/* Rows */}
          <div style={{ position: "relative" }}>
            {/* Now line */}
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: LABEL_W + 10, right: 0, pointerEvents: "none",
            }}>
              <div style={{
                position: "absolute", left: `${nowPct}%`, top: -22, bottom: 0,
                width: 1, background: "rgba(255,255,255,0.15)", zIndex: 2,
              }}/>
              <div style={{
                position: "absolute", left: `${nowPct}%`, top: -24,
                transform: "translateX(-50%)", fontSize: 8, letterSpacing: "0.12em",
                color: "rgba(255,255,255,0.4)", textTransform: "uppercase", zIndex: 3,
              }}>now</div>
            </div>

            {visible.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                no active transits in this range
              </div>
            ) : visible.map((w, ri) => {
              const left = toPercent(w.start);
              const right = toPercent(w.end);
              const width = Math.max(right - left, 0.8);
              const peakPcts = w.peaks
                .filter(p => p >= rangeStart && p <= rangeEnd)
                .map(p => width > 0 ? ((toPercent(p) - left) / width) * 100 : 50);
              const gId = `full-${ri}`;

              return (
                <div key={ri} onClick={() => onSelectTransit && onSelectTransit(w)} style={{
                  display: "flex", alignItems: "center", height: ROW_H,
                  borderTop: ri > 0 ? "1px solid rgba(255,255,255,0.03)" : "none",
                  animation: `fadeUp 0.3s ${ri * 0.03}s ease both`,
                  cursor: "pointer",
                }}>
                  {/* Label */}
                  <div style={{ width: LABEL_W, flexShrink: 0, paddingRight: 8 }}>
                    <div style={{
                      fontSize: 14, color: w.color, letterSpacing: "0.04em",
                      lineHeight: 1.3, display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <span>{w.rowLabel}</span>
                      {w.isReciprocal && <span style={{ fontSize: 9, opacity: 0.5 }}>↔</span>}
                    </div>
                    <div style={{
                      fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.06em", marginTop: 2,
                    }}>
                      {w.orb.toFixed(1)}° orb{w.isRx ? ' · Rx' : ''}{w.isMultiPass ? ' · arc' : ''}
                    </div>
                  </div>

                  {/* Bar */}
                  <div style={{ flex: 1, position: "relative", height: 30, marginLeft: 10 }}>
                    <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.025)" }}/>
                    <svg style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 3, height: 24 }} preserveAspectRatio="none" viewBox="0 0 100 24">
                      <defs>{multiPeakGradient(gId, w.color, peakPcts)}</defs>
                      <rect x="0" y="2" width="100" height="20" rx="5" fill={`url(#${gId})`} />
                      {peakPcts.map((p, j) => (
                        <line key={j} x1={p} y1="0" x2={p} y2="24" stroke={w.color} strokeWidth="1.5" opacity="0.85" />
                      ))}
                    </svg>
                    {/* Peak date labels */}
                    {w.peaks.filter(p => p >= rangeStart && p <= rangeEnd).map((p, j) => (
                      <div key={j} style={{
                        position: "absolute", left: `${toPercent(p)}%`, top: 29,
                        transform: "translateX(-50%)", fontSize: 7, color: w.color,
                        opacity: 0.4, whiteSpace: "nowrap",
                      }}>{p.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 20, textAlign: "center", fontSize: 10,
          color: "rgba(255,255,255,0.2)", letterSpacing: "0.08em", lineHeight: 2.2,
        }}>
          line = exact hit · multiple lines = multi-pass arc<br/>
          tap any transit for details
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
  const [selectedTransit, setSelectedTransit] = useState(null);
  const [transitDetail, setTransitDetail] = useState(null);
  const [transitDetailLoading, setTransitDetailLoading] = useState(false);
  const patternCache = useRef({});
  const transitDetailCache = useRef({});

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
  const reciprocals = patterns.filter(p => p.type === 'reciprocal');
  const transitWindows = computeTransitWindows(positions, natalChart?.positions, reciprocals);

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

  async function openTransitDetail(w) {
    setSelectedTransit(w);
    setShowTimeline(false);
    const cacheKey = `${w.transit}-${w.aspect.name}-${w.natal}`;
    if (transitDetailCache.current[cacheKey]) {
      setTransitDetail(transitDetailCache.current[cacheKey]);
      return;
    }
    setTransitDetail(null);
    setTransitDetailLoading(true);
    try {
      const skyCtx = getSkyContext(natalChart, transitChart);
      const transitName = `${w.transit} ${w.aspect.name} ${w.natal}`;
      const prompt = `You are a warm, direct astrologer. Give a concise reading for this transit.

Transit: ${transitName} (${w.orb.toFixed(1)}° orb${w.isRx ? ', retrograde' : ''}${w.isMultiPass ? ', multi-pass arc' : ''})

${skyCtx}

Respond with ONLY valid JSON:
{
  "duration": "How long this transit is active — when it entered orb and when it fades. 1-2 sentences.",
  "rarity": "How rare this specific aspect is. Be honest. 1-2 sentences.",
  "interpretation": "What this transit means experientially. Warm, direct, no filler. 2-3 sentences.",
  "howToWork": "Practical suggestions for working with this energy. 2-3 sentences."
}`;
      const res = await claudeFetch({
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const json = JSON.parse(text.replace(/```json|```/g, "").trim());
      transitDetailCache.current[cacheKey] = json;
      setTransitDetail(json);
    } catch (e) {
      console.error('[transit detail]', e);
      setTransitDetail({ error: true });
    }
    setTransitDetailLoading(false);
  }

  // Timeline full view
  if (showTimeline) {
    return <TimelineFull windows={transitWindows} onBack={() => setShowTimeline(false)} onSelectTransit={openTransitDetail} />;
  }

  // Transit detail from timeline
  if (selectedTransit) {
    const w = selectedTransit;
    const color = w.color;
    return (
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at 40% 25%, rgba(160,138,255,0.1) 0%, transparent 55%), #050510",
        fontFamily: "'Cormorant Garamond', serif",
        color: "white",
        padding: "36px 20px 100px",
      }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <button onClick={() => { setSelectedTransit(null); setTransitDetail(null); setShowTimeline(true); }}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontFamily: "'Cormorant Garamond',serif", fontSize: 14, letterSpacing: "0.1em", cursor: "pointer", marginBottom: 24 }}>
            ← back to timeline
          </button>

          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ fontSize: 28, color, marginBottom: 8 }}>{PLANET_GLYPHS[w.transit]} {w.aspect.glyph} {PLANET_GLYPHS[w.natal]}</div>
            <h2 style={{ fontWeight: 300, fontSize: 24, margin: 0, letterSpacing: "0.04em", lineHeight: 1.4 }}>
              {w.transit} {w.aspect.name} {w.natal}
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 10, letterSpacing: "0.06em" }}>
              {w.orb.toFixed(1)}° orb{w.isRx ? ' · retrograde' : ''}{w.isMultiPass ? ' · multi-pass arc' : ''}
            </div>
            {w.isMultiPass && (
              <div style={{ fontSize: 11, color, opacity: 0.5, marginTop: 6, letterSpacing: "0.08em" }}>
                exact hits: {w.peaks.map(p => p.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(' · ')}
              </div>
            )}
          </div>

          {transitDetailLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)" }}>
              <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>reading this transit...</div>
            </div>
          ) : transitDetail?.error ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
              couldn't load detail — try again later
            </div>
          ) : transitDetail ? (
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
                    {transitDetail[key]}
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
