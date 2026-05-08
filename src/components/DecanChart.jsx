import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { loadChart } from '../lib/chartStorage';
import { getDekanForPosition, formatDekanStart } from '../lib/decans';

const PLANET_ORDER = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','TrueNode','Chiron','ASC','MC'];

const PLANET_LABEL = {
  Sun: 'Sun', Moon: 'Moon', Mercury: 'Mercury', Venus: 'Venus', Mars: 'Mars',
  Jupiter: 'Jupiter', Saturn: 'Saturn', Uranus: 'Uranus', Neptune: 'Neptune', Pluto: 'Pluto',
  TrueNode: 'North Node', Chiron: 'Chiron', ASC: 'Ascendant', MC: 'Midheaven',
};

const PLANET_GLYPH = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂',
  Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇',
  TrueNode: '☊', Chiron: '⚷', ASC: 'ASC', MC: 'MC',
};

export default function DecanChart() {
  const { user } = useAuth();
  const [natal, setNatal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlanet, setSelectedPlanet] = useState(null);

  useEffect(() => {
    if (!user) return;
    loadChart(user.id, 'natal').then(chart => {
      setNatal(chart);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const placements = natal?.positions
    ? PLANET_ORDER
        .filter(pl => natal.positions[pl])
        .map(pl => ({
          planet: pl,
          pos: natal.positions[pl],
          dekan: getDekanForPosition(natal.positions[pl]),
        }))
        .filter(x => x.dekan)
    : [];

  const selected = selectedPlanet
    ? placements.find(p => p.planet === selectedPlanet)
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 40% 35%, rgba(196,159,255,0.1) 0%, transparent 55%), #050510',
      fontFamily: "'Cormorant Garamond', serif",
      color: 'white',
      padding: '36px 20px 96px',
    }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{
            fontSize: 11,
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)',
            marginBottom: 10,
          }}>
            Egyptian transit dekans
          </div>
          <h1 style={{ fontWeight: 300, fontSize: 40, margin: 0, letterSpacing: '0.06em' }}>
            dekans
          </h1>
          <div style={{ width: 36, height: 1, background: 'rgba(255,255,255,0.1)', margin: '15px auto 0' }} />
          <div style={{
            marginTop: 18,
            fontSize: 13,
            fontStyle: 'italic',
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.6,
            maxWidth: 380,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>
            your natal chart read through the 36 dekan spirits of ancient Egypt — sidereal positions from Clark's <em>Sacred Magic of Egypt</em>, Table 12
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.55)' }}>
            <div style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>loading your chart...</div>
          </div>
        )}

        {!loading && !natal && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'rgba(255,255,255,0.55)',
            fontStyle: 'italic',
            fontSize: 14,
          }}>
            no natal chart yet — add your birth info in profile to see your dekans
          </div>
        )}

        {!loading && natal && placements.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
            chart loaded but no planet positions found
          </div>
        )}

        {placements.length > 0 && (
          <>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              {placements.map(({ planet, pos, dekan }) => {
                const isOpen = selectedPlanet === planet;
                return (
                  <div key={planet}>
                    <button
                      onClick={() => setSelectedPlanet(isOpen ? null : planet)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.07)',
                        background: isOpen ? 'rgba(196,159,255,0.08)' : 'rgba(255,255,255,0.02)',
                        color: 'white',
                        fontFamily: "'Cormorant Garamond', serif",
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{
                            fontSize: 18,
                            color: 'rgba(196,159,255,0.7)',
                            minWidth: 24,
                            textAlign: 'center',
                          }}>
                            {PLANET_GLYPH[planet]}
                          </span>
                          <div>
                            <div style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)' }}>
                              {PLANET_LABEL[planet]}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                              {pos.degree}°{String(pos.minute || 0).padStart(2,'0')}′ {pos.sign}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{
                            fontSize: 10,
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            color: 'rgba(255,255,255,0.4)',
                            marginBottom: 2,
                          }}>
                            dekan {dekan.num}
                          </div>
                          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.85)' }}>
                            {dekan.name}
                          </div>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div style={{
                        padding: '18px 18px 22px',
                        background: 'rgba(196,159,255,0.04)',
                        borderRadius: 12,
                        marginTop: 4,
                        border: '1px solid rgba(196,159,255,0.12)',
                      }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14, letterSpacing: '0.04em' }}>
                          <span style={{ color: 'rgba(255,255,255,0.35)' }}>starts at</span> {formatDekanStart(dekan)}
                          {dekan.meaning && (
                            <> · <em style={{ color: 'rgba(255,255,255,0.7)' }}>{dekan.meaning}</em></>
                          )}
                        </div>

                        {dekan.story && (
                          <div style={{
                            fontSize: 14,
                            lineHeight: 1.7,
                            color: 'rgba(255,255,255,0.78)',
                            marginBottom: 16,
                          }}>
                            {dekan.story}
                          </div>
                        )}

                        {dekan.hermetic && (
                          <div style={{
                            paddingTop: 14,
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            <div style={{
                              fontSize: 10,
                              letterSpacing: '0.22em',
                              textTransform: 'uppercase',
                              color: 'rgba(255,255,255,0.35)',
                              marginBottom: 6,
                            }}>
                              hermetic icon
                            </div>
                            <div style={{
                              fontSize: 13,
                              lineHeight: 1.6,
                              color: 'rgba(255,255,255,0.62)',
                              fontStyle: 'italic',
                            }}>
                              {dekan.hermetic}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 32,
              padding: '16px 18px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              fontSize: 12,
              fontStyle: 'italic',
              color: 'rgba(255,255,255,0.5)',
              lineHeight: 1.6,
            }}>
              each dekan spans 10° of the sidereal zodiac. positions are C.E. 2000 from Rosemary Clark's <em>The Sacred Magic of Ancient Egypt</em> (Table 12, p. 108–109), accurate to ~1° for the present sky.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
