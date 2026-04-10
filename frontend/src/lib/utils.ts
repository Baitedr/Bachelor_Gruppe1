import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Klokkeslett i 24-timersformat (europeisk / norsk stil) */
export function formatTime24h(date: Date): string {
  return date.toLocaleTimeString('nb-NO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
}

/**
 * Myk destruktiv knapp (samme uttrykk som «Logg ut» i navbar): outline + røde toner, hover → accent.
 * Bruk med `variant="outline"` på Button — for Forlat/Avslutt økt, Slett på forsiden osv.
 */
export const logoutStyleDestructiveButtonClassName =
  'flex items-center justify-center gap-1.5 border-destructive/30 bg-destructive/15 text-destructive transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
