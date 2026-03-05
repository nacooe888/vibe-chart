import { useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useVibe } from "../contexts/VibeContext";
import { loadChart, saveChart } from "../lib/chartStorage";
import { loadProfile } from "../lib/profileStorage";
import { supabase } from "../lib/supabase";
import { capture } from "../lib/analytics";

// Authenticated fetch wrapper — adds Supabase JWT so the server can rate-limit
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

const ALL_VIBES = ["Expansive","Inspired","Energized","Sharp","Lit","Directive","Contracted","Uninspired","Depleted","Foggy","Volatile","Receptive"];

const VIBE_COLORS = {
  Foggy:"#FF7FD4", Receptive:"#E07FFF", Depleted:"#FF7F9B",
  Expansive:"#C49FFF", Inspired:"#A89FFF", Energized:"#7FB8FF",
  Sharp:"#7FE8FF", Lit:"#B0FF7F", Directive:"#7FFFD4",
  Contracted:"#FFD47F", Uninspired:"#FFB07F", Volatile:"#FF7FFF",
};

// Fallback defaults when no real vibe data is available
const VIBE_DEFAULTS = {
  Expansive:   { intensity:78, vibesPresent:["Expansive","Inspired"],          verticalBias:"expansive",   horizontalBias:"receptive",  note:"feeling open, like something is lifting" },
  Inspired:    { intensity:72, vibesPresent:["Inspired","Energized"],          verticalBias:"expansive",   horizontalBias:"directive",  note:"ideas coming fast" },
  Energized:   { intensity:85, vibesPresent:["Energized","Sharp"],             verticalBias:"expansive",   horizontalBias:"directive",  note:"ready to move" },
  Sharp:       { intensity:80, vibesPresent:["Sharp","Directive"],             verticalBias:"expansive",   horizontalBias:"directive",  note:"unusually clear" },
  Lit:         { intensity:75, vibesPresent:["Lit","Inspired"],                verticalBias:"expansive",   horizontalBias:"receptive",  note:"warm and alive" },
  Directive:   { intensity:70, vibesPresent:["Directive","Sharp"],             verticalBias:"expansive",   horizontalBias:"directive",  note:"focused on what's next" },
  Contracted:  { intensity:60, vibesPresent:["Contracted","Uninspired"],       verticalBias:"contractive", horizontalBias:"receptive",  note:"pulling inward" },
  Uninspired:  { intensity:45, vibesPresent:["Uninspired","Depleted"],         verticalBias:"contractive", horizontalBias:"receptive",  note:"flat, nothing catching" },
  Depleted:    { intensity:35, vibesPresent:["Depleted","Contracted"],         verticalBias:"contractive", horizontalBias:"receptive",  note:"running on empty" },
  Foggy:       { intensity:58, vibesPresent:["Foggy","Receptive","Depleted"],  verticalBias:"contractive", horizontalBias:"receptive",  note:"something moving through me I can't quite name" },
  Volatile:    { intensity:82, vibesPresent:["Volatile","Energized"],          verticalBias:"expansive",   horizontalBias:"directive",  note:"charged, edge of something" },
  Receptive:   { intensity:55, vibesPresent:["Receptive","Foggy"],             verticalBias:"contractive", horizontalBias:"receptive",  note:"soft, taking things in" },
};

// Convert chart JSON to SKY_CONTEXT string for the AI reading prompts
function buildSkyContext(natal, transits) {
  if (!natal && !transits) return null;

  const SIGNS_DEG = { Aries:0,Taurus:30,Gemini:60,Cancer:90,Leo:120,Virgo:150,
    Libra:180,Scorpio:210,Sagittarius:240,Capricorn:270,Aquarius:300,Pisces:330 };

  function toAbs(sign, deg, min=0) {
    return (SIGNS_DEG[sign] || 0) + deg + min/60;
  }

  function orbBetween(a, b) {
    let diff = Math.abs(a - b) % 360;
    if (diff > 180) diff = 360 - diff;
    return diff;
  }

  const ASPECTS = [{deg:0,name:'conjunct'},{deg:60,name:'sextile'},{deg:90,name:'square'},
    {deg:120,name:'trine'},{deg:180,name:'opposite'}];
  const SLOW = ['Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron'];

  let ctx = '';

  // Current sky summary
  if (transits?.positions) {
    const p = transits.positions;
    const date = transits.date || 'current';
    const loc = transits.location || '';
    ctx += `Current sky (sidereal Fagan-Allen · ${loc} · ${date}):\n`;
    const planets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','Chiron'];
    const grouped = {};
    planets.forEach(pl => {
      if (p[pl]) {
        const s = p[pl].sign;
        if (!grouped[s]) grouped[s] = [];
        grouped[s].push(`${pl} ${p[pl].degree}°${p[pl].minute ? p[pl].minute+"'" : ''}`);
      }
    });
    Object.entries(grouped).forEach(([sign, pls]) => {
      ctx += `- ${pls.join(' · ')} — ${sign}\n`;
    });

    // Eclipse detection: full/new moon near True Node
    if (p.Sun && p.Moon && p.TrueNode) {
      const sunAbs = toAbs(p.Sun.sign, p.Sun.degree, p.Sun.minute);
      const moonAbs = toAbs(p.Moon.sign, p.Moon.degree, p.Moon.minute);
      const nodeAbs = toAbs(p.TrueNode.sign, p.TrueNode.degree, p.TrueNode.minute);
      const sunMoonOrb = orbBetween(sunAbs, moonAbs);
      const moonNodeOrb = Math.min(orbBetween(moonAbs, nodeAbs), orbBetween(moonAbs, (nodeAbs + 180) % 360));
      if (moonNodeOrb <= 12) {
        if (sunMoonOrb <= 12) ctx += `\nECLIPSE — SOLAR ECLIPSE: new moon conjunct True Node (${moonNodeOrb.toFixed(1)}° orb) — portal energy, major endings and beginnings\n`;
        else if (sunMoonOrb >= 168) ctx += `\nECLIPSE — TOTAL LUNAR ECLIPSE (blood moon): full moon conjunct True Node (${moonNodeOrb.toFixed(1)}° orb) — peak revelation, shadow made visible\n`;
      } else if (moonNodeOrb <= 18) {
        if (sunMoonOrb <= 15) ctx += `\nECLIPSE SEASON — partial solar eclipse approaching\n`;
        else if (sunMoonOrb >= 165) ctx += `\nECLIPSE SEASON — partial lunar eclipse approaching\n`;
      }
    }

    ctx += '\n';
  }

  // Natal chart
  if (natal?.positions) {
    const p = natal.positions;
    ctx += `Natal chart (${natal.ayanamsa || 'sidereal Fagan-Allen'} · ${natal.date || ''} · ${natal.location || ''}):\n`;
    const planets = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','ASC','MC'];
    planets.forEach(pl => {
      if (p[pl]) {
        ctx += `- Natal ${pl}: ${p[pl].sign} ${p[pl].degree}°${p[pl].minute ? p[pl].minute+"'" : ''}${p[pl].house ? ' · ' + p[pl].house + 'th house' : ''}\n`;
      }
    });
    ctx += '\n';
  }

  // Calculate aspects if both charts available
  if (natal?.positions && transits?.positions) {
    const aspects = [];
    Object.entries(transits.positions).forEach(([tp, tpos]) => {
      const tAbs = toAbs(tpos.sign, tpos.degree, tpos.minute);
      const maxOrb = SLOW.includes(tp) ? 5 : 2;
      Object.entries(natal.positions).forEach(([np, npos]) => {
        const nAbs = toAbs(npos.sign, npos.degree, npos.minute);
        const diff = orbBetween(tAbs, nAbs);
        ASPECTS.forEach(asp => {
          const orb = Math.abs(diff - asp.deg);
          if (orb <= maxOrb) {
            aspects.push({ orb, tp, asp: asp.name, np });
          }
        });
      });
    });
    aspects.sort((a,b) => a.orb - b.orb);
    if (aspects.length > 0) {
      ctx += 'TRANSIT-TO-NATAL ASPECTS (calculated, tight orbs only):\n';
      aspects.slice(0, 15).forEach((a, i) => {
        ctx += `${i+1}. Transit ${a.tp} ${a.asp} Natal ${a.np} — ${a.orb.toFixed(2)}° orb\n`;
      });
    }
  }

  return ctx;
}

const HARDCODED_SKY_CONTEXT = `Current sky (sidereal Fagan-Allen · San Francisco · Feb 25 2026 · 7:36 AM):
- Sun 11°56' Aquarius · Mercury 27°25' Aquarius · Venus 23°55' Aquarius · Mars 0°59' Aquarius — four planets in Aquarius
- Saturn 6°13' Pisces · Neptune 5°49' Pisces — both in Pisces
- Moon 26°52' Taurus · Jupiter 20°16' Gemini · Uranus 2°33' Taurus · Pluto 9°20' Capricorn · Chiron 28°47' Pisces

Nicole's natal chart (sidereal Fagan-Allen · Oct 28 1988 · 11:35pm EDT · Newark DE · Campanus):
- Natal Moon: Gemini 3°16' · 12th house
- Natal Sun: Libra 11°21' · 4th house
- Natal Mercury: Virgo 23°15' · 4th house
- Natal Venus: Virgo 4°25' · 3rd house
- Natal Mars: Pisces 5°17' · 9th house
- Natal Jupiter: Taurus 9°36' · 11th house
- Natal Saturn: Sagittarius 4°05' · 6th house
- Natal Uranus: Sagittarius 3°39' · 6th house
- Natal Neptune: Sagittarius 13°16' · 6th house
- Natal Pluto: Libra 17°39' · 4th house
- ASC: Cancer 6°30' · MC: Pisces 22°34'

REAL TRANSIT-TO-NATAL ASPECTS (calculated to the minute, Feb 25 2026):
1. Transit Pluto TRINE Natal Jupiter — 0.28° orb — near exact
2. Transit Saturn TRINE Natal ASC — 0.29° orb — near exact
3. Transit Neptune CONJUNCT Natal Mars — 0.52° orb — exact, major
4. Transit Sun TRINE Natal Sun — 0.58° orb — exact this week
5. Transit Neptune TRINE Natal ASC — 0.69° orb — exact
6. Transit Saturn CONJUNCT Natal Mars — 0.92° orb — exact, major
7. Transit Sun SEXTILE Natal Neptune — 1.34° orb — active
8. Transit Neptune OPPOSITE Natal Venus — 1.39° orb — active
9. Transit Neptune SQUARE Natal Saturn — 1.73° orb — active
10. Transit Saturn OPPOSITE Natal Venus — 1.79° orb — active
11. Transit Uranus TRINE Natal Venus — 1.87° orb — active
12. Transit Saturn SQUARE Natal Saturn — 2.13° orb — active (exact was Feb 6)
13. Transit Neptune SQUARE Natal Uranus — 2.17° orb — active
14. Transit Jupiter SQUARE Natal MC — 2.30° orb — active
15. Transit Neptune SQUARE Natal Moon — 2.54° orb — active

KEY INSIGHTS:
- Both Saturn AND Neptune are conjunct natal Mars simultaneously — once-in-a-lifetime overlap
- Saturn trine ASC + Neptune trine ASC — both exact — identity and presence being restructured with support
- Pluto trine natal Jupiter exact — deep transformation of beliefs, expansion, abundance
- Four Aquarius planets activating natal chart through the 12th house (hidden, dissolving, spiritual)
- This is an extraordinarily active chart — multiple near-exact aspects across several planets`;

// Build context from uploaded charts, falling back to hardcoded
function getSkyContext(natalChart, transitChart) {
  if (natalChart || transitChart) {
    const dynamic = buildSkyContext(natalChart, transitChart);
    if (dynamic) return dynamic;
  }
  return HARDCODED_SKY_CONTEXT;
}

// Get vibe data - use real vibe from context if available, otherwise use defaults
function getVibeData(vibe, latestVibe) {
  // If we have a recent vibe transmission matching this vibe, use its real data
  if (latestVibe && latestVibe.dominant_vibe === vibe) {
    return {
      intensity: latestVibe.intensity,
      vibesPresent: latestVibe.vibes_present || [vibe],
      verticalBias: latestVibe.vertical_bias || "balanced",
      horizontalBias: latestVibe.horizontal_bias || "balanced",
      note: latestVibe.note || VIBE_DEFAULTS[vibe]?.note || "",
    };
  }
  // Otherwise use defaults
  return VIBE_DEFAULTS[vibe] || VIBE_DEFAULTS.Expansive;
}

// Generate short report: headline + 1-2 sentence description
async function generateShortReport(vibe, vibeData, skyContext) {
  const prompt = `You are a personal astrologer writing a brief energy report.

Vibe transmission: ${vibe} at ${vibeData.intensity}% intensity
Vibes present: ${vibeData.vibesPresent.join(", ")}
Energy: ${vibeData.verticalBias}, ${vibeData.horizontalBias}
Note: "${vibeData.note}"

${skyContext}

Respond with ONLY valid JSON, no markdown:
{
  "headline": "3-6 word poetic lowercase headline for this moment. Examples: 'you are in the fog' · 'the mind catches fire' · 'something is opening'. Must feel personal and true to the ${vibe} energy.",
  "description": "1-2 sentences only. Connects the ${vibe} transmission to the most relevant planetary dynamic active right now. Specific, warm, uncanny. No generic astrology. Make them feel seen."
}`;

  const res = await claudeFetch({
    model:"claude-haiku-4-5-20251001",
    max_tokens:400,
    messages:[{role:"user",content:prompt}],
  });
  const data = await res.json();
  const text = data.content?.[0]?.text||"{}";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { headline:"something is moving", description:"The sky is speaking to exactly where you are right now." }; }
}

// Generate deep reading: paragraph + transit list
async function generateDeepReport(vibe, vibeData, skyContext) {
  const prompt = `You are a personal astrologer writing a deeper reading.

Vibe transmission: ${vibe} at ${vibeData.intensity}% intensity
Vibes present: ${vibeData.vibesPresent.join(", ")}
Energy: ${vibeData.verticalBias}, ${vibeData.horizontalBias}
Note: "${vibeData.note}"

${skyContext}

Respond with ONLY valid JSON, no markdown:
{
  "paragraph": "2 sentences MAX. One sentence names what's happening in the chart. One sentence lands the personal truth of the ${vibe} transmission. Specific, warm, uncanny. No filler.",
  "transits": [
    {
      "glyph": "planet glyph(s) e.g. ♄♆ or ☽♃",
      "name": "transit name e.g. Neptune trine natal Sun",
      "color": "hex color fitting the planetary energy",
      "line": "one sentence — what this specific transit means given the ${vibe} transmission"
    }
  ]
}

IMPORTANT: Only include transits that are explicitly listed in the TRANSIT-TO-NATAL ASPECTS section of the context above. Do NOT calculate or invent aspects yourself. If no TRANSIT-TO-NATAL ASPECTS section is present, return "transits": []. If aspects are listed, include 3-4 with the tightest orbs (under 5° only).`;

  const res = await claudeFetch({
    model:"claude-sonnet-4-6",
    max_tokens:1000,
    messages:[{role:"user",content:prompt}],
  });
  const data = await res.json();
  const text = data.content?.[0]?.text||"{}";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return { paragraph:"The sky is speaking to exactly where you are.", transits:[] }; }
}

// Generate full reading for a single transit
async function generateTransitDeep(vibe, vibeData, transit, skyContext) {
  const prompt = `You are a personal astrologer writing a full reading on one specific transit.

Vibe transmission: ${vibe} at ${vibeData.intensity}% intensity
Note: "${vibeData.note}"

The transit to explore: ${transit.name}

${skyContext}

Respond with ONLY valid JSON, no markdown:
{
  "strength": "Strengthening or Weakening — is this transit applying (getting tighter) or separating (moving apart)?",
  "exactDate": "The date this transit is exact or was most recently exact — e.g. 'exact February 28, 2026' or 'exact January 14, 2026 · now separating'",
  "cycle": "Is this a one-hit transit or multi-pass? e.g. 'one-hit only' or 'three-pass: first hit Dec 2025, exact again June 2026 (retrograde), final pass Oct 2026' — give the full story of this transit's timeline",
  "para1": "2 sentences. What this transit means + how it specifically hits the natal chart right now.",
  "para2": "2 sentences. Why the ${vibe} transmission makes sense in this context + what this transit is opening or asking."
}`;

  const res = await claudeFetch({
    model:"claude-sonnet-4-6",
    max_tokens:1200,
    messages:[{role:"user",content:prompt}],
  });
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// Generate transit-specific ritual options
async function generateTransitRitualOptions(vibe, vibeData, transit, skyContext) {
  const prompt = `You are a ritual guide writing practices specifically for working with a planetary transit.

Vibe: ${vibe} at ${vibeData.intensity}% intensity
Note: "${vibeData.note}"
Transit: ${transit.name}

${skyContext}

Generate four ritual paths specifically for working with ${transit.name}. Respond with ONLY valid JSON:
{
  "honor": {
    "title": "4-6 word title for honoring this transit energy",
    "description": "1 sentence — what honoring ${transit.name} looks like right now",
    "steps": ["step 1 — specific to this transit", "step 2", "step 3"]
  },
  "release": {
    "title": "4-6 word title for releasing what this transit is dissolving",
    "description": "1 sentence — what ${transit.name} is asking you to let go of",
    "steps": ["step 1", "step 2", "step 3"]
  },
  "shift": {
    "title": "4-6 word title for shifting the energy of this transit",
    "description": "1 sentence — how to work constructively with ${transit.name}",
    "steps": ["step 1", "step 2", "step 3"]
  },
  "channel": {
    "title": "4-6 word title for channeling this transit productively",
    "description": "1 sentence — where ${transit.name} wants to direct your energy",
    "steps": ["step 1", "step 2", "step 3"]
  }
}

Make each practice SPECIFIC to ${transit.name} — not generic vibe work. Reference what this specific planetary energy is doing.`;

  const res = await claudeFetch({ model:"claude-sonnet-4-6", max_tokens:1200, messages:[{role:"user",content:prompt}] });
  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return null; }
}

const transitRitualCache = {};

// ─── Transit Ritual Screen ───
function TransitRitualScreen({ vibe, vibeColor, transit, onBack, skyContext, latestVibe }) {
  const vibeData = getVibeData(vibe, latestVibe);
  const cacheKey = `transit-${vibe}-${transit.name}`;
  const [options, setOptions] = useState(transitRitualCache[cacheKey] || null);
  const [loading, setLoading] = useState(!transitRitualCache[cacheKey]);
  const [selected, setSelected] = useState(null);

  const PATH_META = {
    honor:   { label:"honor it",   icon:"◎", fallback:"be consciously inside this transit energy" },
    release: { label:"release it", icon:"⚡", fallback:"let this transit dissolve what needs to go" },
    shift:   { label:"shift it",   icon:"→", fallback:"redirect this transit energy constructively" },
    channel: { label:"channel it", icon:"⟡", fallback:"give this transit somewhere useful to go" },
  };

  useEffect(() => {
    if (transitRitualCache[cacheKey]) { setOptions(transitRitualCache[cacheKey]); setLoading(false); return; }
    generateTransitRitualOptions(vibe, vibeData, transit, skyContext)
      .then(d => { transitRitualCache[cacheKey] = d; setOptions(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [cacheKey]);

  return (
    <div style={{ minHeight:"100vh", padding:"48px 28px 80px", fontFamily:"'Cormorant Garamond',serif", color:"white", maxWidth:480, margin:"0 auto" }}>
      <button onClick={() => { setSelected(null); onBack(); }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.45)", fontFamily:"'Cormorant Garamond',serif", fontSize:12, letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer", padding:0, marginBottom:40, display:"block" }}>← back</button>

      <div style={{ textAlign:"center", marginBottom:32, animation:"fadeUp 0.5s ease" }}>
        <div style={{ fontSize:32, color:transit.color, marginBottom:8, fontFamily:"serif" }}>{transit.glyph}</div>
        <div style={{ fontSize:13, color:transit.color, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:8, fontWeight:400 }}>ritual for</div>
        <div style={{ fontSize:22, fontWeight:300, letterSpacing:"0.04em", color:"rgba(255,255,255,0.92)", lineHeight:1.3 }}>
          {selected && options?.[selected] ? options[selected].title : transit.name.toLowerCase()}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign:"center", padding:"60px 0" }}>
          <div style={{ fontSize:28, color:transit.color, animation:"spin-slow 4s linear infinite", display:"inline-block" }}>⟡</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:14, letterSpacing:"0.2em" }}>preparing your ritual</div>
        </div>
      )}

      {options && !selected && (
        <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeUp 0.5s ease" }}>
          {["honor", "release", "shift", "channel"].map(p => {
            const meta = PATH_META[p];
            const opt = options[p];
            return (
              <div key={p} onClick={() => { capture('ritual_generated', { vibe, path: p, transit: transit.name }); setSelected(p); }}
                style={{ background:`${transit.color}0e`, border:`1px solid ${transit.color}2e`, borderRadius:16, padding:"18px 22px", cursor:"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", gap:14 }}
                onMouseEnter={e=>e.currentTarget.style.background=`${transit.color}1c`}
                onMouseLeave={e=>e.currentTarget.style.background=`${transit.color}0e`}
              >
                <div style={{ fontSize:26, color:transit.color, flexShrink:0, width:34, textAlign:"center" }}>{meta.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, color:transit.color, letterSpacing:"0.04em", marginBottom:4, fontWeight:400 }}>{meta.label}</div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.62)", lineHeight:1.5 }}>{opt?.description || meta.fallback}</div>
                </div>
                <div style={{ fontSize:14, color:"rgba(255,255,255,0.25)" }}>→</div>
              </div>
            );
          })}
        </div>
      )}

      {options && selected && (
        <div style={{ animation:"fadeUp 0.5s ease" }}>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.62)", textAlign:"center", marginBottom:28, lineHeight:1.8 }}>
            {options[selected]?.description}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:36 }}>
            {options[selected]?.steps?.map((step, i) => (
              <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", border:`1px solid ${transit.color}55`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                  <span style={{ fontSize:12, color:transit.color, fontWeight:400 }}>{i+1}</span>
                </div>
                <div style={{ fontSize:15, color:"rgba(255,255,255,0.85)", lineHeight:1.85, paddingTop:3 }}>{step}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setSelected(null)} style={{ width:"100%", padding:"14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"rgba(255,255,255,0.45)", fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:"0.18em", textTransform:"uppercase", cursor:"pointer" }}>
            ← choose a different path
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Transit Deep Screen ───
const transitCache = {};

function TransitDeepScreen({ vibe, vibeColor, transit, onBack, onRitual, skyContext, latestVibe }) {
  const vibeData = getVibeData(vibe, latestVibe);
  const cacheKey = `${vibe}-${transit.name}`;
  const [data, setData] = useState(transitCache[cacheKey] || null);
  const [loading, setLoading] = useState(!transitCache[cacheKey]);

  useEffect(() => {
    if (transitCache[cacheKey]) { setData(transitCache[cacheKey]); setLoading(false); return; }
    generateTransitDeep(vibe, vibeData, transit, skyContext)
      .then(r => {
        try {
          const parsed = JSON.parse(r.replace(/```json|```/g,"").trim());
          transitCache[cacheKey] = parsed;
          setData(parsed);
        } catch {
          const fallback = { strength:"unknown", exactDate:"unknown", cycle:"unknown", para1: r, para2:"" };
          transitCache[cacheKey] = fallback;
          setData(fallback);
        }
        setLoading(false);
      })
      .catch(() => {
        const fallback = { strength:"—", exactDate:"—", cycle:"—", para1:"This transit is asking something specific of you right now.", para2:"" };
        transitCache[cacheKey] = fallback;
        setData(fallback);
        setLoading(false);
      });
  }, [cacheKey]);

  return (
    <div style={{ minHeight:"100vh", padding:"48px 28px 80px", fontFamily:"'Cormorant Garamond',serif", color:"white", maxWidth:480, margin:"0 auto" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontFamily:"'Cormorant Garamond',serif", fontSize:12, letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer", padding:0, marginBottom:40 }}>← back</button>

      <div style={{ textAlign:"center", marginBottom:28, animation:"fadeUp 0.5s ease" }}>
        <div style={{ fontSize:44, color:transit.color, marginBottom:8, fontFamily:"serif", lineHeight:1 }}>{transit.glyph}</div>
        <div style={{ fontSize:15, color:transit.color, letterSpacing:"0.12em", marginBottom:4 }}>{transit.name}</div>
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", letterSpacing:"0.18em", textTransform:"uppercase" }}>{vibe} · {vibeData.intensity}%</div>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"60px 0" }}>
          <div style={{ fontSize:28, color:transit.color, animation:"spin-slow 4s linear infinite", display:"inline-block" }}>✦</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.22)", marginTop:14, letterSpacing:"0.22em", fontStyle:"italic" }}>going deeper</div>
        </div>
      ) : (
        <div style={{ animation:"fadeUp 0.6s ease" }}>
          <div style={{ background:`${transit.color}0d`, border:`1px solid ${transit.color}28`, borderRadius:12, padding:"14px 18px", textAlign:"center", marginBottom:20 }}>
            <div style={{ fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", color:"rgba(255,255,255,0.55)", marginBottom:6, fontWeight:400 }}>movement</div>
            <div style={{ fontSize:14, color:transit.color, fontWeight:400 }}>{data?.strength || "—"}</div>
          </div>

          {data?.para1 && (
            <div style={{ fontSize:16, lineHeight:2, color:"rgba(255,255,255,0.88)", fontWeight:300, textAlign:"center", marginBottom:20, padding:"0 4px" }}>
              {data.para1}
            </div>
          )}

          <div style={{ background:`${transit.color}0d`, border:`1px solid ${transit.color}28`, borderRadius:12, padding:"14px 18px", textAlign:"center", marginBottom:20 }}>
            <div style={{ fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", color:"rgba(255,255,255,0.55)", marginBottom:6, fontWeight:400 }}>exact</div>
            <div style={{ fontSize:14, color:transit.color, fontWeight:400, lineHeight:1.5 }}>{data?.exactDate || "—"}</div>
          </div>

          {data?.para2 && (
            <div style={{ fontSize:16, lineHeight:2, color:"rgba(255,255,255,0.88)", fontWeight:300, textAlign:"center", marginBottom:20, padding:"0 4px" }}>
              {data.para2}
            </div>
          )}

          {data?.cycle && (
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"16px 20px", textAlign:"center", marginBottom:24 }}>
              <div style={{ fontSize:10, letterSpacing:"0.22em", textTransform:"uppercase", color:"rgba(255,255,255,0.55)", marginBottom:8, fontWeight:400 }}>the full cycle</div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.8, fontWeight:300 }}>{data.cycle}</div>
            </div>
          )}

          {/* Transit-specific ritual button */}
          {data && !loading && (
            <div
              onClick={onRitual}
              style={{
                background:`${transit.color}0e`,
                border:`1px solid ${transit.color}33`,
                borderRadius:16, padding:"18px 24px",
                cursor:"pointer", transition:"all 0.2s",
                textAlign:"center",
                marginBottom:24,
              }}
              onMouseEnter={e=>e.currentTarget.style.background=`${transit.color}1a`}
              onMouseLeave={e=>e.currentTarget.style.background=`${transit.color}0e`}
            >
              <div style={{ fontSize:11, color:transit.color, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:8, fontWeight:400 }}>ritual</div>
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.7 }}>
                work with {transit.name.toLowerCase()}
              </div>
              <div style={{ marginTop:10, fontSize:16, color:transit.color, opacity:0.6 }}>⟡</div>
            </div>
          )}

          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:"0.22em" }}>sidereal · fagan-allen · natal chart active</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Deep Screen ───
const deepReportCache = {};

function DeepScreen({ vibe, vibeColor, onBack, onTransit, onRitual, skyContext, latestVibe, hasNatal }) {
  const vibeData = getVibeData(vibe, latestVibe);
  const [data, setData] = useState(deepReportCache[vibe] || null);
  const [loading, setLoading] = useState(!deepReportCache[vibe]);

  useEffect(() => {
    if (deepReportCache[vibe]) { setData(deepReportCache[vibe]); setLoading(false); return; }
    setData(null);
    setLoading(true);
    generateDeepReport(vibe, vibeData, skyContext)
      .then(d => { deepReportCache[vibe] = d; setData(d); setLoading(false); })
      .catch(() => { const fallback = { paragraph:"The sky is meeting you exactly where you are.", transits:[] }; deepReportCache[vibe] = fallback; setData(fallback); setLoading(false); });
  }, [vibe, hasNatal]);

  return (
    <div style={{ minHeight:"100vh", padding:"48px 28px 80px", fontFamily:"'Cormorant Garamond',serif", color:"white", maxWidth:480, margin:"0 auto" }}>
      <button onClick={onBack} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", fontFamily:"'Cormorant Garamond',serif", fontSize:12, letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer", padding:0, marginBottom:40 }}>← back</button>

      <div style={{ textAlign:"center", marginBottom:28, animation:"fadeUp 0.5s ease" }}>
        <div style={{ fontSize:13, color:vibeColor, letterSpacing:"0.3em", textTransform:"uppercase", marginBottom:8, opacity:0.7 }}>deeper reading</div>
        <div style={{ fontSize:34, fontWeight:300, color:vibeColor, letterSpacing:"0.04em" }}>{vibe}</div>
      </div>

      {loading ? (
        <div style={{ textAlign:"center", padding:"60px 0" }}>
          <div style={{ fontSize:28, color:vibeColor, animation:"spin-slow 4s linear infinite", display:"inline-block" }}>✦</div>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.22)", marginTop:14, letterSpacing:"0.22em", fontStyle:"italic" }}>reading your chart</div>
        </div>
      ) : (
        <div style={{ animation:"fadeUp 0.6s ease" }}>
          <div style={{ fontSize:17, lineHeight:2, color:"rgba(255,255,255,0.88)", fontWeight:300, textAlign:"center", marginBottom:32, padding:"0 4px" }}>
            {data.paragraph}
          </div>

          {data.transits?.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ fontSize:11, letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", textAlign:"center", marginBottom:8, fontWeight:400 }}>active transits · tap to explore</div>
              {data.transits.map((t, i) => (
                <div key={i} onClick={() => onTransit(t)}
                  style={{
                    background:`${t.color}0a`,
                    border:`1px solid ${t.color}2e`,
                    borderRadius:14, padding:"16px 20px",
                    cursor:"pointer", transition:"all 0.2s",
                    display:"flex", alignItems:"center", gap:16,
                    animation:`fadeUp 0.5s ${0.08 + i*0.08}s ease both`,
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=`${t.color}18`}
                  onMouseLeave={e=>e.currentTarget.style.background=`${t.color}0a`}
                >
                  <div style={{ fontSize:28, color:t.color, fontFamily:"serif", flexShrink:0, width:36, textAlign:"center", lineHeight:1 }}>{t.glyph}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:t.color, letterSpacing:"0.08em", marginBottom:4 }}>{t.name}</div>
                    <div style={{ fontSize:13, color:"rgba(255,255,255,0.7)", lineHeight:1.6 }}>{t.line}</div>
                  </div>
                  <div style={{ fontSize:14, color:"rgba(255,255,255,0.2)", flexShrink:0 }}>→</div>
                </div>
              ))}
            </div>
          )}

          {data && !loading && (
            <div style={{ marginTop:32, animation:"fadeUp 0.5s 0.4s ease both" }}>
              <div
                onClick={() => onRitual(vibe)}
                style={{
                  background:`${vibeColor}0e`,
                  border:`1px solid ${vibeColor}33`,
                  borderRadius:16, padding:"18px 24px",
                  cursor:"pointer", transition:"all 0.2s",
                  textAlign:"center",
                }}
                onMouseEnter={e=>e.currentTarget.style.background=`${vibeColor}1a`}
                onMouseLeave={e=>e.currentTarget.style.background=`${vibeColor}0e`}
              >
                <div style={{ fontSize:11, color:vibeColor, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:8, fontWeight:400 }}>ritual</div>
                <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.7 }}>
                  call in a practice for {vibe.toLowerCase()} — guided by these transits
                </div>
                <div style={{ marginTop:10, fontSize:16, color:vibeColor, opacity:0.6 }}>⟡</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Build a short sky summary line from the transit chart positions
function getSkySubtitle(transitChart) {
  if (!transitChart?.positions) return "upload your chart for a live reading";
  const p = transitChart.positions;
  const parts = [];
  // Moon sign
  if (p.Moon?.sign) parts.push(`moon in ${p.Moon.sign.toLowerCase()}`);
  // Dominant sign (most planets)
  const counts = {};
  Object.values(p).forEach(pos => { if (pos?.sign) counts[pos.sign] = (counts[pos.sign] || 0) + 1; });
  const dominant = Object.entries(counts).sort(([,a],[,b]) => b-a)[0];
  if (dominant && dominant[1] >= 3) parts.push(`${dominant[1]} planets in ${dominant[0].toLowerCase()}`);
  // Date label if available
  const dateLabel = transitChart.date ? ` · ${transitChart.date}` : '';
  return parts.join(' · ') + dateLabel || (transitChart.date || 'current sky');
}

// ─── Report Screen ───
function ReportScreen({ onDeepen, natalChart, transitChart, latestVibe, transitLoading }) {
  const [selectedVibe, setSelectedVibe] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const skyContext = getSkyContext(natalChart, transitChart);
  const hasLiveData = !!(natalChart || transitChart);

  const vibeColor = selectedVibe ? VIBE_COLORS[selectedVibe] : "#9FB4FF";
  const now = new Date();

  // Auto-select vibe if we have a recent transmission
  useEffect(() => {
    if (latestVibe && latestVibe.dominant_vibe && !selectedVibe) {
      setSelectedVibe(latestVibe.dominant_vibe);
    }
  }, [latestVibe]);

  useEffect(() => {
    if (selectedVibe) capture('report_viewed', { vibe: selectedVibe });
  }, [selectedVibe]);

  useEffect(() => {
    if (!selectedVibe || transitLoading) { setReport(null); return; }
    setReport(null);
    setLoading(true);
    const vibeData = getVibeData(selectedVibe, latestVibe);
    generateShortReport(selectedVibe, vibeData, skyContext)
      .then(r => { setReport(r); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedVibe, transitLoading, hasLiveData]);

  return (
    <div style={{ minHeight:"100vh", padding:"0 0 80px" }}>
      <div style={{ maxWidth:480, margin:"0 auto", padding:"40px 28px 0" }}>

        {/* Date */}
        <div style={{ textAlign:"center", marginBottom:32, animation:"fadeUp 0.5s ease" }}>
          <div style={{ fontSize:13, letterSpacing:"0.12em", textTransform:"uppercase", color:"rgba(255,255,255,0.7)", marginBottom:8, fontWeight:400 }}>
            {now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", letterSpacing:"0.04em" }}>
            {transitLoading ? 'reading the sky...' : getSkySubtitle(transitChart)}
          </div>
        </div>

        {/* Recent transmission indicator */}
        {latestVibe && (
          <div style={{ textAlign:"center", marginBottom:20, animation:"fadeUp 0.4s ease" }}>
            <div style={{ display:"inline-block", background:`${VIBE_COLORS[latestVibe.dominant_vibe]}18`, border:`1px solid ${VIBE_COLORS[latestVibe.dominant_vibe]}44`, borderRadius:99, padding:"6px 16px", fontSize:11, color:VIBE_COLORS[latestVibe.dominant_vibe], letterSpacing:"0.1em" }}>
              recent transmission: {latestVibe.dominant_vibe} · {latestVibe.intensity}%
            </div>
          </div>
        )}

        {/* Vibe selector */}
        <div style={{ marginBottom:32, animation:"fadeUp 0.5s 0.1s ease both" }}>
          <div style={{ fontSize:12, letterSpacing:"0.15em", textTransform:"uppercase", color:"rgba(255,255,255,0.6)", marginBottom:12, textAlign:"center", fontWeight:400 }}>
            how are you transmitting?
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center", marginBottom:12 }}>
            {ALL_VIBES.map(v => {
              const c = VIBE_COLORS[v];
              const active = selectedVibe === v;
              const isRecent = latestVibe?.dominant_vibe === v;
              return (
                <button key={v} onClick={() => setSelectedVibe(active ? null : v)} style={{
                  padding:"8px 18px", borderRadius:99,
                  border:`1px solid ${active ? c : c+"66"}`,
                  background: active ? `${c}30` : `${c}14`,
                  color: active ? "#ffffff" : c,
                  fontFamily:"'Cormorant Garamond',serif",
                  fontSize:13, letterSpacing:"0.08em",
                  cursor:"pointer", transition:"all 0.2s",
                  fontWeight: active ? 500 : 400,
                  textShadow: active ? `0 0 16px ${c}` : `0 0 8px ${c}66`,
                  boxShadow: active ? `0 0 24px ${c}44, inset 0 0 12px ${c}22` : isRecent ? `0 0 12px ${c}33` : "none",
                }}>{v}</button>
              );
            })}
          </div>
          <div style={{ textAlign:"center" }}>
            <button onClick={() => setSelectedVibe(null)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.5)", fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:"0.1em", cursor:"pointer", padding:0 }}>
              skip · just read the sky
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign:"center", padding:"48px 0", animation:"fadeUp 0.4s ease" }}>
            <div style={{ fontSize:26, color:vibeColor, animation:"spin-slow 4s linear infinite", display:"inline-block" }}>✦</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.2)", marginTop:12, letterSpacing:"0.22em", fontStyle:"italic" }}>reading the sky</div>
          </div>
        )}

        {/* No vibe — sky only */}
        {!selectedVibe && !loading && (
          <div style={{ textAlign:"center", animation:"fadeUp 0.5s 0.2s ease both" }}>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.55)", lineHeight:1.9, padding:"0 12px" }}>
              {transitChart
                ? "The sky is loaded. Select a vibe above to see how it meets you specifically."
                : "Upload your transit chart in settings to get a reading calibrated to today's sky. Or select a vibe and read from the demo chart."
              }
            </div>
          </div>
        )}

        {/* Report */}
        {report && !loading && (
          <div style={{ animation:"fadeUp 0.5s ease", textAlign:"center" }}>
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:38, fontWeight:300, color:vibeColor, letterSpacing:"0.04em", lineHeight:1.2, textShadow:`0 0 40px ${vibeColor}55` }}>
                {report.headline}
              </div>
            </div>

            <div
              onClick={() => onDeepen(selectedVibe)}
              style={{
                background:`${vibeColor}0e`,
                border:`1px solid ${vibeColor}33`,
                borderRadius:20,
                padding:"24px 28px",
                cursor:"pointer",
                transition:"all 0.25s",
                textAlign:"center",
              }}
              onMouseEnter={e => e.currentTarget.style.background=`${vibeColor}18`}
              onMouseLeave={e => e.currentTarget.style.background=`${vibeColor}0e`}
            >
              <div style={{ fontSize:11, color:vibeColor, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:12, opacity:0.8 }}>
                deepen into this
              </div>
              <div style={{ fontSize:16, color:"rgba(255,255,255,0.88)", lineHeight:1.85, fontWeight:300 }}>
                {report.description}
              </div>
              <div style={{ marginTop:16, fontSize:18, color:vibeColor, opacity:0.5 }}>→</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Generate ritual options for a vibe
async function generateRitualOptions(vibe, vibeData, skyContext) {
  const prompt = `You are a ritual guide writing short practices based on current vibe and active transits.

Vibe: ${vibe} at ${vibeData.intensity}% intensity
Note: "${vibeData.note}"

${skyContext}

Generate three ritual paths. Respond with ONLY valid JSON:
{
  "honor": {
    "title": "4-6 word title for honoring ${vibe} — e.g. 'sit inside the storm'",
    "description": "1 sentence — what honoring this energy means right now",
    "steps": ["step 1 — specific, embodied, 1 sentence", "step 2", "step 3"]
  },
  "shift": {
    "title": "4-6 word title for shifting out of ${vibe}",
    "description": "1 sentence — what planetary energy is available to shift toward",
    "steps": ["step 1", "step 2", "step 3"]
  },
  "release": {
    "title": "4-6 word title for releasing ${vibe} — letting it move through",
    "description": "1 sentence — how to discharge this energy, not redirect it",
    "steps": ["step 1 — somatic, physical, no destination needed", "step 2", "step 3"]
  },
  "channel": {
    "title": "4-6 word title for channeling ${vibe} productively",
    "description": "1 sentence — where this energy wants to go given the current transits",
    "steps": ["step 1", "step 2", "step 3"]
  }
}

Include ALL four paths (honor, release, shift, channel). Each step specific, somatic, doable right now. Informed by the active transits. Not vague. Not toxic positivity.`;

  const res = await claudeFetch({ model:"claude-sonnet-4-6", max_tokens:1200, messages:[{role:"user",content:prompt}] });
  const data = await res.json();
  const text = data.content?.[0]?.text || "{}";
  try { return JSON.parse(text.replace(/```json|```/g,"").trim()); }
  catch { return null; }
}

const ritualCache = {};

// Dynamic paths per vibe
function getPathsForVibe(vibe) {
  const expansive = ["Expansive","Inspired","Energized","Lit","Directive","Sharp"];
  const volatile = ["Volatile"];
  if (volatile.includes(vibe)) return ["honor","release","shift","channel"];
  if (expansive.includes(vibe)) return ["honor","channel","shift"];
  return ["honor","release","shift"];
}

const PATH_META = {
  honor:   { label:"honor it",   icon:"◎", fallback:"be consciously inside this energy" },
  release: { label:"release it", icon:"⚡", fallback:"let it move through and out of you" },
  shift:   { label:"shift it",   icon:"→", fallback:"move toward something else intentionally" },
  channel: { label:"channel it", icon:"⟡", fallback:"give this energy somewhere useful to go" },
};

function RitualScreen({ vibe, vibeColor, onBack, skyContext, latestVibe }) {
  const vibeData = getVibeData(vibe, latestVibe);
  const [options, setOptions] = useState(ritualCache[vibe] || null);
  const [loading, setLoading] = useState(!ritualCache[vibe]);
  const [selected, setSelected] = useState(null);
  const paths = getPathsForVibe(vibe);

  useEffect(() => {
    if (ritualCache[vibe]) { setOptions(ritualCache[vibe]); setLoading(false); return; }
    generateRitualOptions(vibe, vibeData, skyContext)
      .then(d => { ritualCache[vibe] = d; setOptions(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [vibe]);

  return (
    <div style={{ minHeight:"100vh", padding:"48px 28px 80px", fontFamily:"'Cormorant Garamond',serif", color:"white", maxWidth:480, margin:"0 auto" }}>
      <button onClick={() => { setSelected(null); onBack(); }} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.45)", fontFamily:"'Cormorant Garamond',serif", fontSize:12, letterSpacing:"0.2em", textTransform:"uppercase", cursor:"pointer", padding:0, marginBottom:40, display:"block" }}>← back</button>

      <div style={{ textAlign:"center", marginBottom:32, animation:"fadeUp 0.5s ease" }}>
        <div style={{ fontSize:13, color:vibeColor, letterSpacing:"0.28em", textTransform:"uppercase", marginBottom:8, fontWeight:400 }}>ritual</div>
        <div style={{ fontSize:28, fontWeight:300, letterSpacing:"0.04em", color:"rgba(255,255,255,0.92)", lineHeight:1.3 }}>
          {selected && options?.[selected] ? options[selected].title : `what do you want to do\nwith ${vibe.toLowerCase()}?`}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign:"center", padding:"60px 0" }}>
          <div style={{ fontSize:28, color:vibeColor, animation:"spin-slow 4s linear infinite", display:"inline-block" }}>⟡</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:14, letterSpacing:"0.2em" }}>preparing your ritual</div>
        </div>
      )}

      {options && !selected && (
        <div style={{ display:"flex", flexDirection:"column", gap:10, animation:"fadeUp 0.5s ease" }}>
          {paths.map(p => {
            const meta = PATH_META[p];
            const opt = options[p];
            return (
              <div key={p} onClick={() => { capture('ritual_generated', { vibe, path: p }); setSelected(p); }}
                style={{ background:`${vibeColor}0e`, border:`1px solid ${vibeColor}2e`, borderRadius:16, padding:"18px 22px", cursor:"pointer", transition:"all 0.2s", display:"flex", alignItems:"center", gap:14 }}
                onMouseEnter={e=>e.currentTarget.style.background=`${vibeColor}1c`}
                onMouseLeave={e=>e.currentTarget.style.background=`${vibeColor}0e`}
              >
                <div style={{ fontSize:26, color:vibeColor, flexShrink:0, width:34, textAlign:"center" }}>{meta.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, color:vibeColor, letterSpacing:"0.04em", marginBottom:4, fontWeight:400 }}>{meta.label}</div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.62)", lineHeight:1.5 }}>{opt?.description || meta.fallback}</div>
                </div>
                <div style={{ fontSize:14, color:"rgba(255,255,255,0.25)" }}>→</div>
              </div>
            );
          })}
        </div>
      )}

      {options && selected && (
        <div style={{ animation:"fadeUp 0.5s ease" }}>
          <div style={{ fontSize:14, color:"rgba(255,255,255,0.62)", textAlign:"center", marginBottom:28, lineHeight:1.8 }}>
            {options[selected]?.description}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:14, marginBottom:36 }}>
            {options[selected]?.steps?.map((step, i) => (
              <div key={i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:28, height:28, borderRadius:"50%", border:`1px solid ${vibeColor}55`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
                  <span style={{ fontSize:12, color:vibeColor, fontWeight:400 }}>{i+1}</span>
                </div>
                <div style={{ fontSize:15, color:"rgba(255,255,255,0.85)", lineHeight:1.85, paddingTop:3 }}>{step}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setSelected(null)} style={{ width:"100%", padding:"14px", borderRadius:12, border:"1px solid rgba(255,255,255,0.12)", background:"transparent", color:"rgba(255,255,255,0.45)", fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:"0.18em", textTransform:"uppercase", cursor:"pointer" }}>
            ← choose a different path
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───
export default function EnergyReport() {
  const { user } = useAuth();
  const { latestVibe } = useVibe();

  const [screen, setScreen] = useState("report");
  const [deepVibe, setDeepVibe] = useState(null);
  const [activeTransit, setActiveTransit] = useState(null);
  const [ritualVibe, setRitualVibe] = useState(null);
  const [natalChart, setNatalChart] = useState(null);
  const [transitChart, setTransitChart] = useState(null);
  const [transitLoading, setTransitLoading] = useState(true);
  const wasLiveRef = useRef(false);
  const hadNatalRef = useRef(false);

  // Load saved charts on mount; refresh transits if stale (>6h)
  useEffect(() => {
    if (!user?.id) return;
    loadChart(user.id, 'natal').then(async existing => {
      if (existing) { setNatalChart(existing); return; }
      // No chart saved — try generating from profile birth info
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
    (async () => {
      const ONE_HOUR_MS = 60 * 60 * 1000;
      const lsKey = `vibe_transit_${user.id}`;

      // 1. Check localStorage first (instant, no network)
      try {
        const raw = localStorage.getItem(lsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const age = Date.now() - new Date(parsed.fetchedAt).getTime();
          if (age < ONE_HOUR_MS) {
            setTransitChart(parsed);
            setTransitLoading(false);
            return;
          }
        }
      } catch (e) { /* ignore parse errors */ }

      // 2. Check Supabase (1-hour TTL)
      const cached = await loadChart(user.id, 'transits');
      const isStale = !cached?.fetchedAt || Date.now() - new Date(cached.fetchedAt).getTime() > ONE_HOUR_MS;
      if (!isStale) {
        setTransitChart(cached);
        // Backfill localStorage
        try { localStorage.setItem(lsKey, JSON.stringify(cached)); } catch (e) { /* quota */ }
        setTransitLoading(false);
        return;
      }

      // 3. Fetch fresh from AstroApp
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch('/api/astro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-PostHog-Distinct-Id': user.id },
          body: JSON.stringify({ type: 'transits' }),
          signal: controller.signal,
        });
        clearTimeout(abortTimer);
        if (res.ok) {
          const fresh = await res.json();
          saveChart(user.id, 'transits', fresh);
          try { localStorage.setItem(lsKey, JSON.stringify(fresh)); } catch (e) { /* quota */ }
          setTransitChart(fresh);
        } else {
          const errBody = await res.text();
          console.error('[transits] api/astro failed:', res.status, errBody);
          if (cached) setTransitChart(cached);
        }
      } catch (err) {
        clearTimeout(abortTimer);
        console.error('[transits] fetch error:', err.name === 'AbortError' ? 'timed out after 8s' : err);
        if (cached) setTransitChart(cached);
      }
      setTransitLoading(false);
    })();
  }, [user?.id]);

  // Failsafe: never block reports for more than 10s
  useEffect(() => {
    const t = setTimeout(() => setTransitLoading(false), 10000);
    return () => clearTimeout(t);
  }, []);

  // Clear all report caches when live data first arrives or when natal chart newly loads
  useEffect(() => {
    const isLive = !!(natalChart || transitChart);
    const hasNatal = !!natalChart;
    const shouldClear = (isLive && !wasLiveRef.current) || (hasNatal && !hadNatalRef.current);
    if (shouldClear) {
      [deepReportCache, transitCache, ritualCache, transitRitualCache].forEach(c =>
        Object.keys(c).forEach(k => delete c[k])
      );
    }
    wasLiveRef.current = isLive;
    hadNatalRef.current = hasNatal;
  }, [natalChart, transitChart]);

  const bgColor = activeTransit ? activeTransit.color : (deepVibe || ritualVibe) ? VIBE_COLORS[deepVibe || ritualVibe] : "#9FB4FF";
  const skyContext = getSkyContext(natalChart, transitChart);

  return (
    <div style={{
      minHeight:"100vh",
      background:`radial-gradient(ellipse at 30% 15%, ${bgColor}12 0%, transparent 55%), #050510`,
      fontFamily:"'Cormorant Garamond',serif",
      color:"white",
      transition:"background 0.8s ease",
      position:"relative",
    }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin-slow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {screen === "report" && (
        <ReportScreen
          onDeepen={v => { capture('deep_reading_opened', { vibe: v }); setDeepVibe(v); setScreen("deep"); }}
          natalChart={natalChart}
          transitChart={transitChart}
          latestVibe={latestVibe}
          transitLoading={transitLoading}
        />
      )}
      {screen === "deep" && deepVibe && (
        <DeepScreen
          vibe={deepVibe}
          vibeColor={VIBE_COLORS[deepVibe]}
          onBack={() => setScreen("report")}
          onTransit={t => { capture('transit_tapped', { transit: t.name }); setActiveTransit(t); setScreen("transit"); }}
          onRitual={v => { setRitualVibe(v); setScreen("ritual"); }}
          skyContext={skyContext}
          latestVibe={latestVibe}
          hasNatal={!!natalChart}
        />
      )}
      {screen === "ritual" && ritualVibe && (
        <RitualScreen
          vibe={ritualVibe}
          vibeColor={VIBE_COLORS[ritualVibe]}
          onBack={() => setScreen("deep")}
          skyContext={skyContext}
          latestVibe={latestVibe}
        />
      )}
      {screen === "transit" && activeTransit && deepVibe && (
        <TransitDeepScreen
          vibe={deepVibe}
          vibeColor={VIBE_COLORS[deepVibe]}
          transit={activeTransit}
          onBack={() => setScreen("deep")}
          onRitual={() => setScreen("transit-ritual")}
          skyContext={skyContext}
          latestVibe={latestVibe}
        />
      )}
      {screen === "transit-ritual" && activeTransit && deepVibe && (
        <TransitRitualScreen
          vibe={deepVibe}
          vibeColor={VIBE_COLORS[deepVibe]}
          transit={activeTransit}
          onBack={() => setScreen("transit")}
          skyContext={skyContext}
          latestVibe={latestVibe}
        />
      )}
    </div>
  );
}
