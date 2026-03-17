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
              <Button 
                type="button" 
                variant="ghost" 
                className="w-full"
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
