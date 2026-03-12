import React, { useState } from 'react'
import '../CSScomponents/Login.css'
import api from '../services/api'

function Login({ onLoginSuccess, onGuestJoin }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [guestCode, setGuestCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [guestError, setGuestError] = useState(null)

  const handleGuestJoin = async () => {
    const normalizedCode = guestCode.trim().toUpperCase()
    if (!normalizedCode) {
      setGuestError('Skriv inn en kode.')
      return
    }
    setGuestLoading(true)
    setGuestError(null)
    try {
      const data = await api.guestJoin(normalizedCode)
      onGuestJoin?.(data.presentation_id)
    } catch (err) {
      const msg = err?.response?.data?.error
      setGuestError(msg || 'Fant ikke aktiv sesjon for denne koden.')
    } finally {
      setGuestLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      if (mode === 'register' && password !== confirmPassword) {
        setError('Passwords do not match. Please type the same password twice.')
        return
      }

      const credentials = { email, password }
      if (mode === 'register') {
        credentials.name = name
      }
      const response = mode === 'login'
        ? await api.login(credentials)
        : await api.register(credentials)

      onLoginSuccess?.(response.user)
    } catch (err) {
      const backendMessage =
        err?.response?.data?.error ||
        err?.response?.data?.errors?.join(', ')

      const networkMessage =
        err?.code === 'ECONNABORTED'
          ? 'Request timed out. Make sure backend server is running on port 3000.'
          : !err?.response
            ? 'Cannot reach backend. Make sure backend server is running on http://localhost:3000.'
            : null

      setError(networkMessage || backendMessage || 'Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>ProSlides</h1>
          <p>{mode === 'login' ? 'Logg inn med din bruker' : 'Lag en ny bruker'}</p>
        </div>

        <div className="login-form-wrapper">
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              {mode === 'register' && (
                <button
                  type="button"
                  className="show-password-button"
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
              )}
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="login-button"
            >
              {isLoading
                ? (mode === 'login' ? 'Logger inn...' : 'Lager bruker...')
                : (mode === 'login' ? 'Logg inn' : 'Lag bruker')}
            </button>
          </form>

          <div className="login-footer">
            {mode === 'login' && (
              <div className="guest-join-section">
                <p className="guest-join-title">Bli med som gjest</p>
                <p className="guest-join-description">
                  Skriv inn kode/ID for å bli med i en live presentasjon uten å logge inn.
                </p>
                <div className="form-group">
                  <label htmlFor="guestCode">Presentasjonskode eller ID</label>
                  <input
                    id="guestCode"
                    type="text"
                    value={guestCode}
                    onChange={(e) => setGuestCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleGuestJoin()}
                    placeholder="F.eks. LIVE-1234"
                  />
                </div>
                {guestError && (
                  <div className="error-message">{guestError}</div>
                )}
                <button
                  type="button"
                  className="guest-join-button"
                  onClick={handleGuestJoin}
                  disabled={guestLoading}
                >
                  {guestLoading ? 'Kobler til...' : 'Bli med i live presentasjon'}
                </button>
              </div>
            )}

            <p className="signup-text">
              {mode === 'login' ? "Har ikke bruker?" : 'Har en eksisterende bruker?'}{' '}
              <button
                type="button"
                className="signup-link"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setConfirmPassword('')
                  setName('')
                  setShowPassword(false)
                  setError(null)
                }}
              >
                {mode === 'login' ? 'Meld deg inn' : 'Logg inn'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login