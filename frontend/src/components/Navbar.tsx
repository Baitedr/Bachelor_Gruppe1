import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Home, LogOut, MonitorPlay } from 'lucide-react'

type NavbarProps = {
  apiStatus: string | null
  currentPage: string
  userEmail?: string
  onGoHome: () => void
  onJoinLive: () => void
  onLogout: () => void
}

export default function Navbar({
  apiStatus,
  currentPage,
  userEmail,
  onGoHome,
  onJoinLive,
  onLogout,
}: NavbarProps) {
  return (
    <header className='sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur'>
      <div className='mx-auto flex w-full flex-wrap items-center gap-2 px-4 py-3'>
        <h1
          className='mr-2 cursor-pointer text-lg font-semibold transition-colors hover:text-primary'
          onClick={onGoHome}
        >
          ProSlides
        </h1>
        
        <span className='text-sm text-muted-foreground'>Logget inn som {userEmail}</span>

        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {currentPage !== 'home' && (
            <Button onClick={onGoHome} variant='outline' size='sm'>
              <Home className='mr-2 h-4 w-4' />
              Hjem
            </Button>
          )}
          <Button
            onClick={onJoinLive}
            variant='outline'
            size='sm'
            className='flex items-center justify-center gap-1.5 border-primary/30 bg-primary/10 text-primary transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
          >
            <MonitorPlay className='mr-2 h-4 w-4' />
            Bli med live
          </Button>
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