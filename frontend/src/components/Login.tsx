import React, { useState } from 'react'
import api from '../services/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogIn, UserPlus, Users } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface LoginProps {
  onLoginSuccess?: (user: unknown) => void
  onGuestJoin?: (presentationId: string | number) => void
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onGuestJoin }) => {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [guestCode, setGuestCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const credentials: any = { email, password }
      if (!isLogin) credentials.name = name

      const response = isLogin 
        ? await api.login(credentials) 
        : await api.register(credentials)
      onLoginSuccess?.(response.user)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Godkjenning mislyktes. Vennligst prøv igjen.') // Authentication failed. Please try again.
    } finally {
      setIsLoading(false)
    }
  }

  const handleGuestJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!guestCode.trim()) return
    setError(null)
    setIsLoading(true)
    try {
      const data = await api.guestJoin(guestCode.trim().toUpperCase())
      onGuestJoin?.(data.presentation_id)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Kunne ikke bli med i økten.') // Could not join session.
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 md:p-10">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <h1 className="text-center text-4xl font-extrabold tracking-tight leading-none">ProSlides</h1>

        <Card>
          <CardHeader>
            <CardTitle>{isLogin ? 'Logg inn' : 'Opprett konto'}</CardTitle>
            <CardDescription>
              {isLogin ? 'Skriv inn påloggingsinformasjonen din for å få tilgang til kontoen din.' : 'Registrer deg for en ny konto.'}
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
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
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
                onClick={() => window.location.href = 'http://localhost:3000/api/v1/auth/google_oauth2'}
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
                onClick={() => window.location.href = 'http://localhost:3000/api/v1/auth/github'}
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

        {isLogin && (
          <Card>
            <CardHeader>
              <CardTitle>Bli med som gjest</CardTitle>
              <CardDescription>Skriv inn en presentasjonskode for å bli med i en live økt.</CardDescription>
            </CardHeader>
            <form onSubmit={handleGuestJoin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="guestCode">Øktkode</Label>
                  <Input
                    id="guestCode"
                    placeholder="f.eks. LIVE - ABCD"
                    value={guestCode}
                    onChange={(e) => setGuestCode(e.target.value)}
                    required
                    className="uppercase"
                  />
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
