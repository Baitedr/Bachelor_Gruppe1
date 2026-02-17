import React, { useState } from 'react'
import '../CSScomponents/Login.css'

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      // TODO: Replace with actual API call
      // const response = await api.login({ email, password })
      
      // Simulated login for now
      setTimeout(() => {
        if (email && password) {
          onLoginSuccess?.({ email })
        } else {
          setError('Please enter both email and password')
        }
        setIsLoading(false)
      }, 500)
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>ProSlides</h1>
          <p>Sign in to your account</p>
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
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="login-button"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="login-footer">
            <p className="signup-text">
              Don't have an account?{' '}
              <a href="#" className="signup-link">
                Sign up
              </a>
            </p>
            <a href="#" className="forgot-password">
              Forgot password?
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login