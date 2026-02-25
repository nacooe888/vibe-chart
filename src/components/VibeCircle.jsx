import { useState, useRef, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useVibe } from "../contexts/VibeContext";

const R = 148;
const PAD = 62;
const VB = R + PAD;

const VIBES = [
  { angle: 0,   inner: "Open",    outer: "Expanded",   color: "#C49FFF" },
  { angle: 30,  inner: "Creative",outer: "Inspired",   color: "#A89FFF" },
  { angle: 60,  inner: "Alive",   outer: "Energized",  color: "#7FB8FF" },
  { angle: 90,  inner: "Clear",   outer: "Sharp",      color: "#7FE8FF" },
  { angle: 120, inner: "Warm",    outer: "Lit",        color: "#B0FF7F" },
  { angle: 150, inner: "Focused", outer: "Directive",  color: "#7FFFD4" },
  { angle: 180, inner: "Closed",  outer: "Contracted", color: "#FFD47F" },
  { angle: 210, inner: "Flat",    outer: "Uninspired", color: "#FFB07F" },
  { angle: 240, inner: "Heavy",   outer: "Depleted",   color: "#FF7F9B" },
  { angle: 270, inner: "Adrift",  outer: "Foggy",      color: "#FF7FD4" },
  { angle: 300, inner: "Edgy",    outer: "Volatile",   color: "#FF7FFF" },
  { angle: 330, inner: "Soft",    outer: "Receptive",  color: "#E07FFF" },
];

const VIBE_COLORS = Object.fromEntries(VIBES.map(v => [v.outer, v.color]));

const NOTE_PROMPTS = [
  "what's moving through you?",
  "any signs or synchronicities today?",
  "name the texture of this moment...",
  "what's asking for your attention?",
];

function polar(deg, r) {
  const rad = (deg - 90) * Math.PI / 180;
  return [Math.cos(rad) * r, Math.sin(rad) * r];
}

function inCircle(x, y) { return x * x + y * y <= R * R; }

function toSVGCoords(svgEl, clientX, clientY) {
  if (!svgEl || clientX == null || clientY == null) return [0, 0];
  const rect = svgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return [0, 0];
  const scaleX = (VB * 2) / rect.width;
  const scaleY = (VB * 2) / rect.height;
  return [(clientX - rect.left) * scaleX - VB, (clientY - rect.top) * scaleY - VB];
}

function gx(p) { return p.x ?? p[0]; }
function gy(p) { return p.y ?? p[1]; }

function polygonPath(pts) {
  if (!pts || pts.length < 2) return "";
  const v = pts.filter(p => p && typeof gx(p) === "number");
  if (v.length < 2) return "";
  const d = v.map((p, i) => `${i===0?"M":"L"}${gx(p).toFixed(1)},${gy(p).toFixed(1)}`).join(" ");
  return v.length > 2 ? d + " Z" : d;
}

function smoothPath(pts) {
  if (!pts || pts.length < 2) return "";
  const v = pts.filter(p => p && typeof gx(p) === "number");
  if (v.length < 2) return "";
  let d = `M${gx(v[0]).toFixed(1)},${gy(v[0]).toFixed(1)}`;
  for (let i = 1; i < v.length - 1; i++) {
    const mx = ((gx(v[i]) + gx(v[i+1])) / 2).toFixed(1);
    const my = ((gy(v[i]) + gy(v[i+1])) / 2).toFixed(1);
    d += ` Q${gx(v[i]).toFixed(1)},${gy(v[i]).toFixed(1)} ${mx},${my}`;
  }
  return d + ` L${gx(v[v.length-1]).toFixed(1)},${gy(v[v.length-1]).toFixed(1)}`;
}

function getAuraColor(pts) {
  if (!pts || pts.length === 0) return "#9B6FD4";
  const ax = pts.reduce((s,p) => s + gx(p), 0) / pts.length;
  const ay = pts.reduce((s,p) => s + gy(p), 0) / pts.length;
  const hue = ((Math.atan2(ay, ax) * 180 / Math.PI) + 360) % 360;
  const dist = Math.min(1, Math.sqrt(ax*ax+ay*ay) / (R*0.5));
  return `hsl(${hue.toFixed(0)},${(55+dist*25).toFixed(0)}%,${(58+dist*12).toFixed(0)}%)`;
}

function quantifyPoints(pts) {
  if (!pts || pts.length === 0) return null;
  const v = pts.filter(p => p && typeof gx(p) === "number");
  if (v.length === 0) return null;
  const cx = v.reduce((s,p)=>s+gx(p),0)/v.length;
  const cy = v.reduce((s,p)=>s+gy(p),0)/v.length;
  const rawAngle = Math.atan2(cy,cx)*180/Math.PI+90;
  const dominantAngle = ((rawAngle%360)+360)%360;
  const names = ["Expanded","Inspired","Energized","Sharp","Lit","Directive","Contracted","Uninspired","Depleted","Foggy","Volatile","Receptive"];
  const dominantVibe = names[Math.round(dominantAngle/30)%12];
  const intensity = Math.min(100,Math.round((Math.sqrt(cx*cx+cy*cy)/R)*100));
  const points = v.map(p => {
    const ang = ((Math.atan2(gy(p),gx(p))*180/Math.PI+90+360)%360);
    return { x:parseFloat(gx(p).toFixed(2)), y:parseFloat(gy(p).toFixed(2)), angle:parseFloat(ang.toFixed(1)), intensity:Math.min(100,Math.round((Math.sqrt(gx(p)**2+gy(p)**2)/R)*100)), vibe:names[Math.round(ang/30)%12] };
  });
  const vibesPresent = [...new Set(points.map(p=>p.vibe))];
  const spread = Math.round(v.reduce((s,p)=>s+Math.sqrt((gx(p)-cx)**2+(gy(p)-cy)**2),0)/v.length/R*100);
  const tH=v.filter(p=>gy(p)<0).length, bH=v.filter(p=>gy(p)>=0).length;
  const lH=v.filter(p=>gx(p)<0).length, rH=v.filter(p=>gx(p)>=0).length;
  return {
    dominant_angle:parseFloat(dominantAngle.toFixed(1)),
    dominant_vibe: dominantVibe,
    intensity,
    spread,
    centroid:{x:parseFloat(cx.toFixed(2)),y:parseFloat(cy.toFixed(2))},
    vibes_present: vibesPresent,
    point_count:v.length,
    vertical_bias: tH>bH*1.5?"expansive":bH>tH*1.5?"contractive":"balanced",
    horizontal_bias: rH>lH*1.5?"directive":lH>rH*1.5?"receptive":"balanced",
    points,
  };
}

function btnStyle(color) {
  const base = { padding:"9px 24px", borderRadius:99, fontFamily:"'Cormorant Garamond',serif", fontSize:13, letterSpacing:"0.16em", textTransform:"uppercase", cursor:"pointer", transition:"all 0.25s" };
  if (color) return { ...base, border:`1px solid ${color}60`, background:`${color}22`, color:"white", boxShadow:`0 0 18px ${color}28` };
  return { ...base, border:"1px solid rgba(255,255,255,0.09)", background:"transparent", color:"rgba(255,255,255,0.32)" };
}

function Stars() {
  const stars = useRef(Array.from({length:55},(_,i)=>({id:i,x:Math.random()*100,y:Math.random()*100,s:Math.random()*1.6+0.4,o:Math.random()*0.45+0.08,d:Math.random()*5}))).current;
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0}}>
      {stars.map(s=><div key={s.id} style={{position:"absolute",left:`${s.x}%`,top:`${s.y}%`,width:s.s,height:s.s,borderRadius:"50%",background:"white",opacity:s.o,animation:`twinkle 3s ${s.d}s ease-in-out infinite alternate`}}/>)}
    </div>
  );
}

function PatternsView({ logs }) {
  const valid = logs.filter(l => l.dominant_vibe && l.intensity != null);
  const counts = {};
  valid.forEach(l => (l.vibes_present||[l.dominant_vibe]).forEach(v=>{ counts[v]=(counts[v]||0)+1; }));
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const top = sorted[0]?.[0]||"Expanded";
  const topC = VIBE_COLORS[top]||"#C49FFF";
  const avgI = valid.length ? Math.round(valid.reduce((s,l)=>s+(l.intensity||0),0)/valid.length) : 0;
  const avgS = valid.length ? Math.round(valid.reduce((s,l)=>s+(l.spread||0),0)/valid.length) : 0;
  const recent = [...valid].slice(-14);
  const comp = valid.filter(l=>l.centroid).map(l=>[l.centroid.x,l.centroid.y]);

  const card = (ch,st={}) => <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,padding:"20px 22px",marginBottom:14,...st}}>{ch}</div>;
  const lbl = t => <div style={{fontSize:10,letterSpacing:"0.22em",textTransform:"uppercase",color:"rgba(255,255,255,0.28)",marginBottom:10}}>{t}</div>;

  if (valid.length === 0) return (
    <div style={{textAlign:"center",padding:"60px 20px",color:"rgba(255,255,255,0.3)",fontStyle:"italic",fontSize:16}}>
      {logs.length===0?"start logging to see your patterns":"log a few more entries to generate patterns"}
    </div>
  );

  return (
    <div style={{animation:"fadeIn 0.6s ease"}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:14}}>
        {[{label:"entries",value:valid.length},{label:"avg intensity",value:`${avgI}%`},{label:"avg spread",value:`${avgS}%`}].map(s=>(
          <div key={s.label} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"16px 10px",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:300,color:topC,fontFamily:"'Cormorant Garamond',serif"}}>{s.value}</div>
            <div style={{fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:"rgba(255,255,255,0.28)",marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {card(<>
        {lbl("your dominant vibe")}
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:`${topC}22`,border:`1px solid ${topC}55`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:14,height:14,borderRadius:"50%",background:topC,boxShadow:`0 0 12px ${topC}`}}/>
          </div>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:300,color:topC}}>{top}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:2}}>logged {counts[top]} {counts[top]===1?"time":"times"}</div>
          </div>
        </div>
      </>)}

      {card(<>
        {lbl("vibe frequency")}
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sorted.slice(0,8).map(([vibe,count])=>{
            const pct=Math.round((count/valid.length)*100);
            const col=VIBE_COLORS[vibe]||"#fff";
            return <div key={vibe}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:12,color:"rgba(255,255,255,0.6)",fontFamily:"'Cormorant Garamond',serif"}}>{vibe}</span>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>{count}×</span>
              </div>
              <div style={{height:4,borderRadius:99,background:"rgba(255,255,255,0.05)"}}>
                <div style={{height:"100%",width:`${pct}%`,borderRadius:99,background:col,boxShadow:`0 0 8px ${col}88`}}/>
              </div>
            </div>;
          })}
        </div>
      </>)}

      {recent.length > 1 && card(<>
        {lbl("intensity over time")}
        <div style={{display:"flex",alignItems:"flex-end",gap:4,height:70}}>
          {recent.map((l,i)=>{
            const col=VIBE_COLORS[l.dominant_vibe]||topC;
            const h=Math.max(4,Math.round((l.intensity/100)*60));
            return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{width:"100%",height:h,borderRadius:"3px 3px 0 0",background:col,opacity:0.75,boxShadow:`0 0 6px ${col}66`}}/>
              <div style={{fontSize:7,color:"rgba(255,255,255,0.2)",writingMode:"vertical-rl",transform:"rotate(180deg)"}}>
                {new Date(l.created_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric"})}
              </div>
            </div>;
          })}
        </div>
      </>)}

      {comp.length > 1 && card(<>
        {lbl("composite vibe map · all sessions")}
        <div style={{display:"flex",justifyContent:"center"}}>
          <svg viewBox={`${-R-10} ${-R-10} ${(R+10)*2} ${(R+10)*2}`} style={{width:200,height:200}}>
            <circle cx={0} cy={0} r={R} fill="#090120" stroke="rgba(255,255,255,0.07)" strokeWidth={0.8}/>
            {[0.33,0.66].map(f=><circle key={f} cx={0} cy={0} r={R*f} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} strokeDasharray="2,8"/>)}
            {VIBES.map(({angle,color})=>{ const [x,y]=polar(angle,R); return <line key={angle} x1={0} y1={0} x2={x} y2={y} stroke={color} strokeWidth={0.3} strokeOpacity={0.15}/>; })}
            {comp.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={3} fill={topC} fillOpacity={0.35}/>)}
            {(()=>{ const ax=comp.reduce((s,p)=>s+p[0],0)/comp.length; const ay=comp.reduce((s,p)=>s+p[1],0)/comp.length; return <><circle cx={ax} cy={ay} r={10} fill={topC} fillOpacity={0.12}/><circle cx={ax} cy={ay} r={4} fill={topC} fillOpacity={0.7}/></>; })()}
            <circle cx={0} cy={0} r={8} fill="#090120" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5}/>
            <circle cx={0} cy={0} r={2} fill="rgba(255,255,255,0.4)"/>
          </svg>
        </div>
        <div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.25)",fontStyle:"italic",marginTop:8}}>your average home on the map</div>
      </>)}

      {valid.length >= 3 && card(<>
        {lbl("energy polarity")}
        {[
          {a:"Expanded",  b:"Contracted", aC:"#C49FFF", bC:"#FFD47F"},
          {a:"Inspired",  b:"Uninspired", aC:"#A89FFF", bC:"#FFB07F"},
          {a:"Energized", b:"Depleted",   aC:"#7FB8FF", bC:"#FF7F9B"},
          {a:"Sharp",     b:"Foggy",      aC:"#7FE8FF", bC:"#FF7FD4"},
          {a:"Lit",       b:"Volatile",   aC:"#B0FF7F", bC:"#FF7FFF"},
          {a:"Directive", b:"Receptive",  aC:"#7FFFD4", bC:"#E07FFF"},
        ].map(({a,b,aC:ac,bC:bc})=>{
          const allVibes = valid.flatMap(l=>l.vibes_present||[l.dominant_vibe]);
          const aC = allVibes.filter(v=>v===a).length;
          const bC = allVibes.filter(v=>v===b).length;
          const tot = aC + bC;
          if (tot === 0) return null;
          const aPct = Math.round((aC/tot)*100);
          const bPct = 100 - aPct;
          return <div key={a} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.45)",marginBottom:5}}>
              <span style={{fontFamily:"'Cormorant Garamond',serif",color:ac}}>{a} <span style={{color:"rgba(255,255,255,0.3)"}}>{aPct}%</span></span>
              <span style={{fontFamily:"'Cormorant Garamond',serif",color:bc}}><span style={{color:"rgba(255,255,255,0.3)"}}>{bPct}%</span> {b}</span>
            </div>
            <div style={{height:5,borderRadius:99,background:"rgba(255,255,255,0.05)",overflow:"hidden",display:"flex"}}>
              <div style={{width:`${aPct}%`,background:ac,borderRadius:"99px 0 0 99px",opacity:0.7}}/>
              <div style={{width:`${bPct}%`,background:bc,borderRadius:"0 99px 99px 0",marginLeft:"auto",opacity:0.7}}/>
            </div>
          </div>;
        })}
      </>)}

      {valid.filter(l=>l.note).length > 0 && card(<>
        {lbl("recent transmissions")}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {valid.filter(l=>l.note).slice(-4).reverse().map((l,i)=>(
            <div key={i} style={{borderLeft:`2px solid ${VIBE_COLORS[l.dominant_vibe]||topC}55`,paddingLeft:12}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",letterSpacing:"0.1em",marginBottom:3}}>
                {new Date(l.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})} · {l.dominant_vibe}
              </div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.55)",fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif",lineHeight:1.5}}>"{l.note}"</div>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

// Export PatternsView for the Cycles tab
export { PatternsView };

export default function VibeCircle({ showSignOut = true }) {
  const { user, signOut } = useAuth();
  const { recordVibe } = useVibe();
  const [mode, setMode] = useState("plot");
  const [plotPoints, setPlotPoints] = useState([]);
  const [drawPoints, setDrawPoints] = useState([]);
  const [logs, setLogs] = useState([]);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prompt] = useState(NOTE_PROMPTS[Math.floor(Math.random()*NOTE_PROMPTS.length)]);
  const svgRef = useRef(null);
  const dragging = useRef(false);
  const didMove = useRef(false);

  const activePoints = mode==="plot" ? plotPoints : drawPoints;
  const hasData = activePoints.length > 1;
  const auraColor = getAuraColor(activePoints);
  const shapePath = mode==="plot" ? polygonPath(plotPoints) : smoothPath(drawPoints);

  useEffect(() => {
    if (!user) return;
    loadLogs();
  }, [user]);

  async function loadLogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('vibe_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setLogs(data);
    }
    setLoading(false);
  }

  function getXY(e) {
    const src=e.touches?.[0]??e.changedTouches?.[0]??e;
    return toSVGCoords(svgRef.current,src.clientX,src.clientY);
  }
  function handleMouseDown(e) { if(mode!=="draw")return; dragging.current=true; const [x,y]=getXY(e); setDrawPoints([[x,y]]); }
  function handleMouseMove(e) { if(!dragging.current||mode!=="draw")return; didMove.current=true; const [x,y]=getXY(e); setDrawPoints(prev=>[...prev,[x,y]]); }
  function handleMouseUp() { dragging.current=false; }
  function handleClick(e) { if(mode!=="plot")return; if(didMove.current){didMove.current=false;return;} const [x,y]=getXY(e); if(!inCircle(x,y))return; setPlotPoints(prev=>[...prev,[x,y]]); }
  function handleTouchStart(e) { e.preventDefault(); if(mode!=="draw")return; dragging.current=true; const [x,y]=getXY(e); setDrawPoints([[x,y]]); }
  function handleTouchMove(e) { e.preventDefault(); if(!dragging.current)return; const [x,y]=getXY(e); setDrawPoints(prev=>[...prev,[x,y]]); }
  function handleTouchEnd(e) { e.preventDefault(); dragging.current=false; if(mode==="plot"){const [x,y]=getXY(e); if(inCircle(x,y))setPlotPoints(prev=>[...prev,[x,y]]);} }
  function clearAll() { setPlotPoints([]); setDrawPoints([]); setNote(""); setSaved(false); }
  function undoPoint() { setPlotPoints(prev=>prev.slice(0,-1)); }

  async function handleSave() {
    const q = quantifyPoints(activePoints);
    if (!q) return;

    const entry = {
      user_id: user.id,
      mode,
      note: note || null,
      dominant_angle: q.dominant_angle,
      dominant_vibe: q.dominant_vibe,
      intensity: q.intensity,
      spread: q.spread,
      centroid: q.centroid,
      vibes_present: q.vibes_present,
      point_count: q.point_count,
      vertical_bias: q.vertical_bias,
      horizontal_bias: q.horizontal_bias,
      points: q.points,
    };

    const { data, error } = await supabase
      .from('vibe_logs')
      .insert([entry])
      .select()
      .single();

    if (!error && data) {
      setLogs(prev => [...prev, data]);
      // Record vibe to context for Report tab
      recordVibe(data);
      setSaved(true);
      setTimeout(() => { setSaved(false); clearAll(); }, 2400);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <div style={{minHeight:"100vh",background:`radial-gradient(ellipse at 40% 35%, ${auraColor}1a 0%, transparent 55%), #050510`,transition:"background 0.6s ease",display:"flex",flexDirection:"column",alignItems:"center",padding:"36px 20px 64px",position:"relative",overflow:"hidden",fontFamily:"'Cormorant Garamond',serif",color:"white"}}>
      <Stars/>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:500,animation:"fadeIn 0.8s ease"}}>

        <div style={{textAlign:"center",marginBottom:26}}>
          <div style={{fontSize:11,letterSpacing:"0.34em",textTransform:"uppercase",color:"rgba(255,255,255,0.25)",marginBottom:10}}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
          </div>
          <h1 style={{fontWeight:300,fontSize:40,margin:0,letterSpacing:"0.06em"}}>vibe map</h1>
          {logs.length>0&&<div style={{fontSize:11,color:"rgba(255,255,255,0.18)",marginTop:10,letterSpacing:"0.15em"}}>{logs.length} {logs.length===1?"entry":"entries"} recorded</div>}
          <div style={{width:36,height:1,background:"rgba(255,255,255,0.1)",margin:"15px auto 0"}}/>
        </div>

        {showSignOut && (
          <div style={{position:"absolute",top:0,right:0}}>
            <button onClick={handleSignOut} style={{...btnStyle(),fontSize:10,padding:"6px 12px"}}>sign out</button>
          </div>
        )}

        {loading && (
          <div style={{textAlign:"center",padding:"60px 20px",color:"rgba(255,255,255,0.3)"}}>
            <div style={{animation:"pulse 1.5s ease-in-out infinite"}}>loading your transmissions...</div>
          </div>
        )}

        {!loading && <>
          <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
            <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:99,padding:3,border:"1px solid rgba(255,255,255,0.07)"}}>
              {["plot","draw"].map(m=>(
                <button key={m} onClick={()=>{setMode(m);clearAll();}} style={{padding:"8px 30px",borderRadius:99,border:"none",background:mode===m?`${auraColor}40`:"transparent",color:mode===m?"white":"rgba(255,255,255,0.32)",fontFamily:"'Cormorant Garamond',serif",fontSize:13,letterSpacing:"0.18em",textTransform:"uppercase",cursor:"pointer",transition:"all 0.25s",boxShadow:mode===m?`0 0 18px ${auraColor}35`:"none"}}>{m}</button>
              ))}
            </div>
          </div>

          <div style={{textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.22)",letterSpacing:"0.1em",fontStyle:"italic",marginBottom:10,minHeight:18}}>
            {mode==="plot" ? plotPoints.length===0?"tap inside the circle to place points":`${plotPoints.length} point${plotPoints.length===1?"":"s"} placed · tap more or save` : "drag inside the circle to draw your vibe"}
          </div>

          <svg ref={svgRef} viewBox={`${-VB} ${-VB} ${VB*2} ${VB*2}`}
            style={{display:"block",margin:"0 auto",width:"min(96vw, 460px)",height:"min(96vw, 460px)",cursor:mode==="draw"?"crosshair":"pointer",touchAction:"none",userSelect:"none"}}
            onClick={handleClick} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <defs>
              <radialGradient id="voidMask" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#050510" stopOpacity="1"/>
                <stop offset="55%" stopColor="#050510" stopOpacity="1"/>
                <stop offset="78%" stopColor="#050510" stopOpacity="0.92"/>
                <stop offset="92%" stopColor="#050510" stopOpacity="0.5"/>
                <stop offset="100%" stopColor="#050510" stopOpacity="0"/>
              </radialGradient>
              <radialGradient id="voidCenter" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0a0120"/>
                <stop offset="100%" stopColor="#050510"/>
              </radialGradient>
              <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <filter id="sectorBlur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="8"/>
              </filter>
              <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <circle cx={0} cy={0} r={VB} fill="#050510"/>
            {VIBES.map(({angle,color},i)=>{
              const toRad=d=>(d-90)*Math.PI/180;
              const x1=Math.cos(toRad(angle-15))*R,y1=Math.sin(toRad(angle-15))*R;
              const x2=Math.cos(toRad(angle+15))*R,y2=Math.sin(toRad(angle+15))*R;
              return <path key={`s${i}`} d={`M0,0 L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`} fill={color} fillOpacity={0.38}/>;
            })}
            {VIBES.map(({angle,color},i)=>{
              const toRad=d=>(d-90)*Math.PI/180;
              const x1=Math.cos(toRad(angle-15))*R,y1=Math.sin(toRad(angle-15))*R;
              const x2=Math.cos(toRad(angle+15))*R,y2=Math.sin(toRad(angle+15))*R;
              return <path key={`sg${i}`} d={`M0,0 L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 0,1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`} fill={color} fillOpacity={0.18} filter="url(#sectorBlur)"/>;
            })}
            <circle cx={0} cy={0} r={R} fill="url(#voidMask)"/>
            <circle cx={0} cy={0} r={R} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={1}/>
            {[0.33,0.66].map(f=><circle key={f} cx={0} cy={0} r={R*f} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={0.5} strokeDasharray="2,9"/>)}
            {VIBES.map(({angle,color})=>{ const [x,y]=polar(angle,R); return <line key={`sp${angle}`} x1={0} y1={0} x2={x} y2={y} stroke={color} strokeWidth={0.4} strokeOpacity={0.18}/>; })}
            {hasData&&shapePath&&<>
              <path d={shapePath} fill={auraColor} fillOpacity={0.13}/>
              <path d={shapePath} fill="none" stroke={auraColor} strokeWidth={2} strokeOpacity={0.9} strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)"/>
            </>}
            {mode==="plot"&&plotPoints.map(([x,y],i)=>(
              <g key={i}>
                <circle cx={x} cy={y} r={4.5} fill={auraColor} filter="url(#dotGlow)"/>
                <circle cx={x} cy={y} r={9} fill="none" stroke={auraColor} strokeWidth={0.5} strokeOpacity={0.35}/>
              </g>
            ))}
            {VIBES.map(({angle,inner,color})=>{ const [x,y]=polar(angle,R*0.5); return <text key={`il${angle}`} x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:13,fill:color,fillOpacity:0.75,fontStyle:"italic",pointerEvents:"none",fontWeight:400}}>{inner}</text>; })}
            {VIBES.map(({angle,outer,color})=>{
              const isBottom=angle>=120&&angle<=300&&angle!==300;
              const rotation=isBottom?angle+180:angle;
              const [lx,ly]=polar(angle,R*1.19);
              return <text key={`ol${angle}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={color} fillOpacity={0.75} fontSize={9} fontFamily="'Cormorant Garamond',serif" letterSpacing="0.1em" style={{pointerEvents:"none"}} transform={`rotate(${rotation},${lx},${ly})`}>{outer.toUpperCase()}</text>;
            })}
            {VIBES.map(({angle,color})=>{ const [x,y]=polar(angle,R); return <circle key={`rim${angle}`} cx={x} cy={y} r={2} fill={color} fillOpacity={0.55}/>; })}
            <circle cx={0} cy={0} r={22} fill="url(#voidCenter)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.75}/>
            <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:7,fill:"rgba(255,255,255,0.35)",letterSpacing:"0.28em",pointerEvents:"none"}}>VOID</text>
          </svg>

          <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:20}}>
            {mode==="plot"&&plotPoints.length>0&&<button onClick={undoPoint} style={btnStyle()}>undo</button>}
            <button onClick={clearAll} style={btnStyle()}>clear</button>
            {hasData&&<button onClick={handleSave} style={btnStyle(auraColor)}>{saved?"✦ saved":"save"}</button>}
          </div>

          {hasData&&!saved&&(
            <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder={prompt} rows={2}
              style={{display:"block",margin:"18px auto 0",width:"min(94vw, 420px)",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:14,padding:"13px 18px",color:"rgba(255,255,255,0.68)",fontFamily:"'Cormorant Garamond',serif",fontSize:15,lineHeight:1.65,caretColor:auraColor}}/>
          )}

          {logs.length>0&&(
            <div style={{marginTop:44}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{fontSize:11,letterSpacing:"0.22em",textTransform:"uppercase",color:"rgba(255,255,255,0.2)"}}>past transmissions</div>
                <button onClick={()=>setShowExport(true)} style={{...btnStyle(),fontSize:11,padding:"6px 14px",letterSpacing:"0.12em"}}>↓ export</button>
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
                {logs.slice(-9).reverse().map((log,i)=>{
                  const pts=log.points??[];
                  const c=log.dominant_vibe?(VIBE_COLORS[log.dominant_vibe]||"#C49FFF"):getAuraColor(pts);
                  const p=log.mode==="draw"?smoothPath(pts):polygonPath(pts);
                  return (
                    <div key={log.id || i} style={{textAlign:"center",animation:"popIn 0.4s ease"}}>
                      <svg viewBox={`${-R-4} ${-R-4} ${(R+4)*2} ${(R+4)*2}`} style={{width:66,height:66}}>
                        <circle cx={0} cy={0} r={R} fill="#090118" stroke="rgba(255,255,255,0.06)" strokeWidth={0.8}/>
                        {pts.length>1&&p&&<><path d={p} fill={c} fillOpacity={0.13}/><path d={p} fill="none" stroke={c} strokeWidth={1.2} strokeOpacity={0.75} strokeLinecap="round"/></>}
                        <circle cx={0} cy={0} r={4.5} fill="#050510" stroke="rgba(255,255,255,0.08)" strokeWidth={0.5}/>
                        <circle cx={0} cy={0} r={1.5} fill="rgba(255,255,255,0.4)"/>
                      </svg>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.2)",marginTop:5}}>{new Date(log.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                      {log.dominant_vibe&&<div style={{fontSize:9,color:c,marginTop:2,fontStyle:"italic",fontFamily:"'Cormorant Garamond',serif"}}>{log.dominant_vibe} · {log.intensity}%</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>}

      </div>

      {showExport && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{width:"100%",maxWidth:500,background:"#0d0820",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:16,letterSpacing:"0.15em",textTransform:"uppercase",color:"rgba(255,255,255,0.7)"}}>your data · {logs.length} {logs.length===1?"entry":"entries"}</div>
              <button onClick={()=>setShowExport(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:20,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",fontFamily:"'Cormorant Garamond',serif",marginBottom:12,fontStyle:"italic"}}>tap the box to select all · then Cmd+C or long-press copy</div>
            <textarea readOnly value={JSON.stringify({exported:new Date().toISOString(),count:logs.length,logs},null,2)}
              style={{width:"100%",height:280,background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:"12px 14px",color:"rgba(255,255,255,0.6)",fontFamily:"monospace",fontSize:10.5,lineHeight:1.6,resize:"none"}}
              onClick={e=>e.target.select()} onFocus={e=>e.target.select()}/>
          </div>
        </div>
      )}
    </div>
  );
}
