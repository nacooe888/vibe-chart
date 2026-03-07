import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const { signIn, signUp, resetPassword } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      if (mode === 'forgot') {
        await resetPassword(email)
        setMessage('check your email for a reset link')
      } else if (mode === 'signin') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
        setMessage('check your email to confirm your account')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '14px 18px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    color: 'white',
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 16,
    marginBottom: 14,
  }

  const btnStyle = {
    width: '100%',
    padding: '14px 24px',
    borderRadius: 99,
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: 14,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    cursor: loading ? 'wait' : 'pointer',
    transition: 'all 0.25s',
    border: '1px solid rgba(196,159,255,0.5)',
    background: 'rgba(196,159,255,0.15)',
    color: 'white',
    boxShadow: '0 0 24px rgba(196,159,255,0.2)',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 40% 35%, rgba(196,159,255,0.1) 0%, transparent 55%), #050510',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%',
        maxWidth: 380,
        animation: 'fadeIn 0.8s ease',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{
            fontWeight: 300,
            fontSize: 44,
            margin: 0,
            letterSpacing: '0.06em',
            color: 'white',
          }}>vibe map</h1>
          <div style={{
            fontSize: 13,
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.3)',
            marginTop: 12,
            textTransform: 'uppercase',
          }}>
            map your inner landscape
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 20,
          padding: '32px 28px',
        }}>
          {mode !== 'forgot' ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 28,
            }}>
              <div style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 99,
                padding: 3,
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                {['signin', 'signup'].map(m => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(null); setMessage(null); }}
                    style={{
                      padding: '8px 24px',
                      borderRadius: 99,
                      border: 'none',
                      background: mode === m ? 'rgba(196,159,255,0.25)' : 'transparent',
                      color: mode === m ? 'white' : 'rgba(255,255,255,0.32)',
                      fontFamily: "'Cormorant Garamond', serif",
                      fontSize: 13,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      transition: 'all 0.25s',
                    }}
                  >
                    {m === 'signin' ? 'enter' : 'join'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              marginBottom: 28,
              fontSize: 14,
              color: 'rgba(255,255,255,0.5)',
              fontStyle: 'italic',
            }}>
              reset your password
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            {mode !== 'forgot' && (
              <input
                type="password"
                placeholder="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                style={inputStyle}
              />
            )}

            {error && (
              <div style={{
                color: '#FF7F9B',
                fontSize: 13,
                marginBottom: 14,
                textAlign: 'center',
                fontStyle: 'italic',
              }}>
                {error}
              </div>
            )}

            {message && (
              <div style={{
                color: '#B0FF7F',
                fontSize: 13,
                marginBottom: 14,
                textAlign: 'center',
                fontStyle: 'italic',
              }}>
                {message}
              </div>
            )}

            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? '...' : mode === 'forgot' ? 'send reset link' : mode === 'signin' ? 'enter the map' : 'create account'}
            </button>

            {mode === 'signin' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setError(null); setMessage(null); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.35)',
                    fontSize: 12,
                    fontStyle: 'italic',
                    cursor: 'pointer',
                    fontFamily: "'Cormorant Garamond', serif",
                  }}
                >
                  forgot password?
                </button>
              </div>
            )}

            {mode === 'forgot' && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.35)',
                    fontSize: 12,
                    fontStyle: 'italic',
                    cursor: 'pointer',
                    fontFamily: "'Cormorant Garamond', serif",
                  }}
                >
                  ← back to sign in
                </button>
              </div>
            )}
          </form>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: 24,
          fontSize: 12,
          color: 'rgba(255,255,255,0.2)',
          fontStyle: 'italic',
        }}>
          your transmissions are private
        </div>
      </div>
    </div>
  )
}
