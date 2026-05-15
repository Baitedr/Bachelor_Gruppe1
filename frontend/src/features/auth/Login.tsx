import React, { useEffect, useState } from 'react'
import api from '@/services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogIn, UserPlus, Users, Eye, EyeOff } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice'

function sanitizeLiveCodeSuffix(raw: string): string {
  let s = raw.trim().toUpperCase().replace(/^LIVE-?/, '')
  return s.replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

function fullLiveJoinCode(suffix: string): string {
  return `LIVE-${sanitizeLiveCodeSuffix(suffix)}`
}

interface LoginProps {
  onLoginSuccess?: (user: unknown) => void
  onGuestJoin?: (presentationId: string | number) => void
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onGuestJoin }) => {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [guestCode, setGuestCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const isMobileDevice = useIsMobileDevice()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'oauth_failed') {
      setError('OAuth-innlogging mislyktes. Prøv igjen eller bruk e-post og passord.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  /*
   * Hjelpemetode for å evaluere styrken på et passord basert på lengde og kompleksitet, og returnere en score,
   * etikett og farge som kan brukes i UI for å gi tilbakemelding til brukeren under registrering.
  */
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-muted' }
    let score = 1
    if (pass.length >= 8) score += 1
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score += 1

    switch (score) {
      case 1: return { score, label: 'Svakt', color: 'bg-destructive' }
      case 2: return { score, label: 'Greit', color: 'bg-orange-500' }
      case 3: return { score, label: 'Bra', color: 'bg-yellow-500' }
      case 4: return { score, label: 'Sterkt', color: 'bg-green-500' }
      default: return { score: 0, label: '', color: 'bg-muted' }
    }
  }

  const strength = getPasswordStrength(password)

  /*
    * Håndterer innsending av login eller registreringsskjema ved å validere input, sende forespørsel til API og håndtere responsen.
  */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    
    if (!isLogin) {
      if (password !== confirmPassword) {
        setError('Passordene er ikke like.')
        return
      } 
    }

    setIsLoading(true)
    try {
      const credentials: any = { email, password }
      if (!isLogin) credentials.name = name

      const response = isLogin 
        ? await api.login(credentials) 
        : await api.register(credentials)
      onLoginSuccess?.(response.user)
    } catch (err: any) {
      if (err?.response?.data?.errors) {
        setError(err.response.data.errors.join(', '));
      } else {
        setError(err?.response?.data?.error || 'Godkjenning mislyktes. Vennligst prøv igjen.') 
      }
    } finally {
      setIsLoading(false)
    }
  }

  // Håndterer innsending av gjest-join-skjema ved å validere øktkoden, 
  // sende forespørsel til API og håndtere responsen for å bli med i en presentasjonsøkt som gjest.
  const handleGuestJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const suffix = sanitizeLiveCodeSuffix(guestCode)
    if (!suffix || suffix.length < 4) {
      setError('Oppgi alle 4 tegnene i øktkoden (bokstaver eller tall).')
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const data = await api.guestJoin(fullLiveJoinCode(suffix))
      onGuestJoin?.(data.presentation_id)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Kunne ikke bli med i økten.') // Could not join session.
    } finally {
      setIsLoading(false)
    }
  }

  const guestJoinCard = isLogin ? (
    <Card>
      <CardHeader>
        <CardTitle>Bli med som gjest</CardTitle>
        <CardDescription>
          Skriv inn de fire tegnene etter «LIVE-» som presentatøren viser.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleGuestJoin}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guestCode">Øktkode</Label>
            <div className="flex overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
              <span
                className="inline-flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
                aria-hidden
              >
                LIVE-
              </span>
              <Input
                id="guestCode"
                placeholder="AB12"
                value={guestCode}
                onChange={(e) => setGuestCode(sanitizeLiveCodeSuffix(e.target.value))}
                required
                className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none font-mono uppercase"
                maxLength={4}
                inputMode="text"
                spellCheck={false}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full flex items-center gap-2" variant="outline" disabled={isLoading}>
            {!isLoading && <Users className="h-4 w-4" />}
            {isLoading ? 'Blir med...' : 'Bli med i økten'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  ) : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-center text-4xl font-extrabold tracking-tight leading-none">ProSlides</h1>

        {isMobileDevice && guestJoinCard}

        <Card>
          <CardHeader>
            <CardTitle>{isLogin ? 'Logg inn' : 'Opprett bruker'}</CardTitle>
            <CardDescription>
              {isLogin ? 'Skriv inn påloggingsinformasjonen din for å få tilgang til kontoen din.' : 'Registrer en ny bruker'}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <div className="text-sm font-medium text-destructive">{error}</div>}
              
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name">Navn</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Ditt navn"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">E-post</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="navn@eksempel.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Passord</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {!isLogin && (
                  <p
                  className={`text-xs ${
                    password.length >= 8 ? 'text-green-600' : 'text-muted-foreground'
                  }`}
                >
                  Passordkrav: Minst 8 tegn med både store og små bokstaver, og minst ett tall
                </p>
                )}

                {!isLogin && password.length > 0 && (
                  <div className="space-y-1 mt-2">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div 
                        className={`h-full ${strength.color} transition-all duration-300`} 
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{strength.label}</p>
                  </div>
                )}
              </div>

              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Bekreft passord</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-2 mt-2">
              <Button type="submit" className="w-full flex items-center gap-2" disabled={isLoading}>
                {isLogin && !isLoading && <LogIn className="h-4 w-4" />}
                {!isLogin && !isLoading && <UserPlus className="h-4 w-4" />}
                {isLoading ? 'Vennligst vent...' : (isLogin ? 'Logg inn' : 'Registrer deg')}
              </Button>
              
              <div className="relative w-full my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Eller
                  </span>
                </div>
              </div>

              <Button 
                type="button" 
                variant="outline" 
                className="w-full flex items-center gap-2"
                onClick={() => { window.location.href = `${window.location.origin}/api/v1/auth/google_oauth2` }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Logg inn med Google
              </Button>
              
              <Button 
                type="button" 
                variant="outline" 
                className="w-full flex items-center gap-2 mt-2"
                onClick={() => { window.location.href = `${window.location.origin}/api/v1/auth/github` }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.113.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.814 1.102.814 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"></path>
                </svg>
                Logg inn med GitHub
              </Button>

              <Button 
                type="button" 
                variant="ghost" 
                className="w-full mt-2"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? "Har du ikke en konto? Registrer deg" : 'Har du allerede en konto? Logg inn'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        {!isMobileDevice && isLogin && (
          <Card>
            <CardHeader>
              <CardTitle>Bli med som gjest</CardTitle>
              <CardDescription>
                Skriv inn de fire tegnene etter «LIVE-» som presentatøren viser.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleGuestJoin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="guestCode">Øktkode</Label>
                  <div className="flex overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                    <span
                      className="inline-flex items-center border-r border-input bg-muted px-3 font-mono text-sm text-muted-foreground"
                      aria-hidden
                    >
                      LIVE-
                    </span>
                    <Input
                      id="guestCode"
                      placeholder="AB12"
                      value={guestCode}
                      onChange={(e) => setGuestCode(sanitizeLiveCodeSuffix(e.target.value))}
                      required
                      className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none font-mono uppercase"
                      maxLength={4}
                      inputMode="text"
                      spellCheck={false}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full flex items-center gap-2" variant="outline" disabled={isLoading}>
                  {!isLoading && <Users className="h-4 w-4" />}
                  {isLoading ? 'Blir med...' : 'Bli med i økten'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}

export default Login
