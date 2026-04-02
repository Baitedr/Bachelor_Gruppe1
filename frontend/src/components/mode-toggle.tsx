import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

/**
 * Knapp som veksler mellom lyst og mørkt tema (shadcn + next-themes).
 * Måne i lyst modus → bytt til mørkt; sol i mørkt modus → bytt til lyst.
 */
export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Etter første render på klienten — unngår mismatch mellom server og nettleser.
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button type='button' variant='outline' size='icon' className='h-8 w-8 shrink-0' disabled aria-hidden>
        <Sun className='h-4 w-4' />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      type='button'
      variant='outline'
      size='icon'
      className='h-8 w-8 shrink-0'
      aria-label={isDark ? 'Bytt til lyst tema' : 'Bytt til mørkt tema'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className='h-4 w-4' /> : <Moon className='h-4 w-4' />}
    </Button>
  )
}
