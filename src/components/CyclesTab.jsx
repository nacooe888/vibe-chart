import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { PatternsView } from "./VibeCircle";

export default function CyclesTab() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at 40% 35%, rgba(196,159,255,0.1) 0%, transparent 55%), #050510",
      fontFamily: "'Cormorant Garamond', serif",
      color: "white",
      padding: "36px 20px 64px",
    }}>
      <div style={{ maxWidth: 500, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.25)",
            marginBottom: 10,
          }}>
            your rhythms
          </div>
          <h1 style={{
            fontWeight: 300,
            fontSize: 40,
            margin: 0,
            letterSpacing: "0.06em",
          }}>cycles</h1>
          <div style={{
            width: 36,
            height: 1,
            background: "rgba(255,255,255,0.1)",
            margin: "15px auto 0",
          }}/>
        </div>

        {loading ? (
          <div style={{
            textAlign: "center",
            padding: "60px 20px",
            color: "rgba(255,255,255,0.3)",
          }}>
            <div style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
              loading your patterns...
            </div>
          </div>
        ) : (
          <PatternsView logs={logs} />
        )}
      </div>
    </div>
  );
}
