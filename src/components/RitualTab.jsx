// Standalone Ritual Tab (Context B)
// Long-arc planetary story rituals — separate from report rituals (Context A)
// Placeholder for future implementation

export default function RitualTab() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 30% 15%, rgba(127, 255, 212, 0.08) 0%, transparent 55%), #050510",
      fontFamily: "'Cormorant Garamond', serif",
      color: "white",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "40px 28px",
      textAlign: "center",
    }}>
      <div style={{ animation: "fadeIn 0.8s ease" }}>
        <div style={{
          fontSize: 48,
          color: "#7FFFD4",
          marginBottom: 24,
          opacity: 0.6,
        }}>
          ⟡
        </div>

        <h2 style={{
          fontSize: 28,
          fontWeight: 300,
          letterSpacing: "0.06em",
          marginBottom: 16,
          color: "rgba(255,255,255,0.9)",
        }}>
          planetary rituals
        </h2>

        <p style={{
          fontSize: 15,
          color: "rgba(255,255,255,0.45)",
          lineHeight: 1.9,
          maxWidth: 320,
          fontStyle: "italic",
        }}>
          practices for working with the longer planetary arcs —
          the transits that unfold over weeks and months
        </p>

        <div style={{
          marginTop: 40,
          padding: "16px 24px",
          background: "rgba(127, 255, 212, 0.06)",
          border: "1px solid rgba(127, 255, 212, 0.15)",
          borderRadius: 12,
          fontSize: 12,
          color: "rgba(255,255,255,0.35)",
          letterSpacing: "0.1em",
        }}>
          coming soon
        </div>
      </div>
    </div>
  );
}
