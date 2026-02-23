import React, { useState } from 'react'
import '../CSScomponents/Login.css'
import api from '../services/api'

function Login({ onLoginSuccess }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

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
          <p>{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</p>
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
                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="login-footer">
            <p className="signup-text">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                className="signup-link"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setConfirmPassword('')
                  setShowPassword(false)
                  setError(null)
                }}
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login