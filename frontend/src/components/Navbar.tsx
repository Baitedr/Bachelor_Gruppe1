import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Home, LogOut, MonitorPlay, User } from 'lucide-react'

type NavbarProps = {
  currentPage: string
  userEmail?: string
  userName?: string
  oauthUser?: boolean
  onGoHome: () => void
  onJoinLive: () => void
  onUpdateProfileName?: (name: string) => Promise<void> | void
  onChangePassword?: (payload: {
    current_password?: string
    password: string
    password_confirmation: string
  }) => Promise<void> | void
  onLogout: () => void
}

export default function Navbar({
  currentPage,
  userEmail,
  userName,
  oauthUser = false,
  onGoHome,
  onJoinLive,
  onUpdateProfileName,
  onChangePassword,
  onLogout,
}: NavbarProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [nameValue, setNameValue] = useState(userName || '')
  const [isSavingName, setIsSavingName] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isSavingPassword, setIsSavingPassword] = useState(false)
  const accountMenuRef = useRef<HTMLDivElement | null>(null)

  const isInLiveFlow =
    currentPage === 'phoneinteraction' || currentPage === 'lobby' || currentPage === 'live'

  const accountLabel = userName?.trim() || userEmail || 'Bruker'

  useEffect(() => {
    setNameValue(userName || '')
  }, [userName])

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const handleSaveName = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountError(null)
    setAccountMessage(null)

    const normalizedName = nameValue.trim()
    if (!normalizedName) {
      setAccountError('Navn kan ikke være tomt.')
      return
    }

    if (!onUpdateProfileName) {
      setAccountError('Kunne ikke oppdatere navn akkurat nå.')
      return
    }

    try {
      setIsSavingName(true)
      await onUpdateProfileName(normalizedName)
      setAccountMessage('Navn oppdatert.')
    } catch {
      setAccountError('Kunne ikke oppdatere navn.')
    } finally {
      setIsSavingName(false)
    }
  }

  const handleSavePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAccountError(null)
    setAccountMessage(null)

    if (newPassword !== confirmNewPassword) {
      setAccountError('De nye passordene er ikke like.')
      return
    }

    if (!onChangePassword) {
      setAccountError('Passordendring er ikke tilgjengelig.')
      return
    }

    try {
      setIsSavingPassword(true)
      await onChangePassword({
        ...(oauthUser ? {} : { current_password: currentPassword }),
        password: newPassword,
        password_confirmation: confirmNewPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setShowPasswordForm(false)
      setAccountMessage('Passord oppdatert.')
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { errors?: string[]; error?: string } } }
      const data = ax.response?.data
      const msg = data?.errors?.join(', ') || data?.error || 'Kunne ikke oppdatere passord.'
      setAccountError(msg)
    } finally {
      setIsSavingPassword(false)
    }
  }

  return (
    <header className='sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur'>
      <div className='mx-auto flex w-full flex-wrap items-center gap-2 px-4 py-3'>
        <h1
          className='mr-2 cursor-pointer text-lg font-semibold transition-colors hover:text-primary'
          onClick={onGoHome}
        >
          ProSlides
        </h1>

        <div className='relative' ref={accountMenuRef}>
          {/* Bruk samme lyse/outline uttrykk som andre handlingsknapper. */}
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='flex items-center gap-2 hover:bg-accent hover:text-accent-foreground'
            aria-label='Åpne profilinnstillinger'
            onClick={() => {
              setIsAccountMenuOpen((previous) => !previous)
              setAccountError(null)
              setAccountMessage(null)
            }}
          >
            <User className='h-4 w-4' />
            <span className='max-w-44 truncate'>Logget inn som {accountLabel}</span>
          </Button>

          {isAccountMenuOpen && (
            <Card className='absolute left-0 top-11 z-50 w-80 border-border/80 shadow-lg'>
              <CardHeader className='pb-3'>
                <CardTitle className='text-sm'>Konto</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {/* Egen seksjon for navneendring. */}
                <form className='space-y-2' onSubmit={handleSaveName}>
                  <Label htmlFor='account-name'>Navn</Label>
                  <Input
                    id='account-name'
                    value={nameValue}
                    onChange={(event) => setNameValue(event.target.value)}
                    placeholder='Skriv nytt navn'
                  />
                  <Button type='submit' size='sm' variant='outline' disabled={isSavingName}>
                    {isSavingName ? 'Lagrer...' : 'Lagre navn'}
                  </Button>
                </form>

                <div className='space-y-2'>
                  <Label>Passord</Label>
                  {!showPasswordForm ? (
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => {
                        setShowPasswordForm(true)
                        setAccountError(null)
                        setAccountMessage(null)
                      }}
                    >
                      Endre passord
                    </Button>
                  ) : (
                    <form className='space-y-2' onSubmit={handleSavePassword}>
                      {oauthUser && (
                        <p className='text-xs text-muted-foreground'>
                          Du logget inn med OAuth. Du kan sette et passord for innlogging med e-post uten
                          nåværende passord.
                        </p>
                      )}
                      {!oauthUser && (
                        <div className='space-y-1'>
                          <Label htmlFor='account-current-password'>Nåværende passord</Label>
                          <Input
                            id='account-current-password'
                            type='password'
                            autoComplete='current-password'
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                          />
                        </div>
                      )}
                      <div className='space-y-1'>
                        <Label htmlFor='account-new-password'>Nytt passord</Label>
                        <Input
                          id='account-new-password'
                          type='password'
                          autoComplete='new-password'
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                        <p className='text-xs text-muted-foreground'>
                          Minst 8 tegn med store og små bokstaver og minst ett tall.
                        </p>
                      </div>
                      <div className='space-y-1'>
                        <Label htmlFor='account-confirm-password'>Bekreft nytt passord</Label>
                        <Input
                          id='account-confirm-password'
                          type='password'
                          autoComplete='new-password'
                          value={confirmNewPassword}
                          onChange={(e) => setConfirmNewPassword(e.target.value)}
                          required
                          minLength={8}
                        />
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <Button type='submit' size='sm' variant='outline' disabled={isSavingPassword}>
                          {isSavingPassword ? 'Lagrer...' : 'Lagre passord'}
                        </Button>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          onClick={() => {
                            setShowPasswordForm(false)
                            setCurrentPassword('')
                            setNewPassword('')
                            setConfirmNewPassword('')
                            setAccountError(null)
                          }}
                        >
                          Avbryt
                        </Button>
                      </div>
                    </form>
                  )}
                </div>

                {accountError && <p className='text-sm text-destructive'>{accountError}</p>}
                {accountMessage && <p className='text-sm text-emerald-600'>{accountMessage}</p>}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Handlingsknapper holdes samlet på høyre side. */}
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {currentPage !== 'home' && (
            <Button onClick={onGoHome} variant='outline' size='sm'>
              <Home className='mr-2 h-4 w-4' />
              Hjem
            </Button>
          )}
          {!isInLiveFlow && (
            <Button
              onClick={onJoinLive}
              variant='outline'
              size='sm'
              className='flex items-center justify-center gap-1.5 border-primary/30 bg-primary/10 text-primary transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
            >
              <MonitorPlay className='mr-2 h-4 w-4' />
              Bli med live
            </Button>
          )}
          <Button
            onClick={onLogout}
            variant='outline'
            size='sm'
            className='flex items-center justify-center gap-1.5 border-destructive/30 bg-destructive/15 text-destructive transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
          >
            <LogOut className='mr-2 h-4 w-4' />
            Logg ut
          </Button>
        </div>
      </div>
    </header>
  )
}