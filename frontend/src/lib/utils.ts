import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Brukte bare denne filen for utils relatert til presentasjonsvariabler, men kan utvide den senere med andre generelle hjelpefunksjoner hvis nødvendig.
export type PresentationVariable = {
  id: string
  name: string
  value: string | number
}

const VARIABLE_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ----------- PRESENTASJON VARIABLER HJELPEFUNKSJONER -----------

// Normaliserer variabel ved å gjøre den lowercase, erstatte mellomrom med understrek, og fjerne ugyldige tegn.
export function normalizeVariableName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
}


export function normalizePresentationVariables(variables: unknown): PresentationVariable[] {
  if (!Array.isArray(variables)) return []

  const seen = new Set<string>()

  return variables.flatMap((item, index) => {
    const raw = typeof item === 'object' && item !== null ? (item as Partial<PresentationVariable>) : {}
    const name = normalizeVariableName(String(raw.name || ''))

    if (!name || seen.has(name)) return []
    seen.add(name)

    const rawValue = raw.value ?? ''

    return [{
      id: String(raw.id || `var-${name}-${index}`),
      name,
      value: typeof rawValue === 'number' ? rawValue : String(rawValue),
    }]
  })
}
// Erstatter variabler i teksten med deres respektive verdier fra variabellisten.
export function resolveTextWithVariables(
  text: unknown,
  variables: PresentationVariable[] = [],
): string {
  if (typeof text !== 'string') return ''
  if (!text) return text

  const valueMap = new Map(
    normalizePresentationVariables(variables).map((item) => [item.name, String(item.value ?? '')]),
  )

  return text.replace(VARIABLE_PLACEHOLDER_PATTERN, (_match, variableName) => {
    const normalizedName = normalizeVariableName(String(variableName))
    return valueMap.get(normalizedName) ?? `{{${variableName}}}`
  })
}
// Går gjennom fabric data og erstatter variabler i tekstobjekter. Bevarer templateText for å kunne oppdatere teksten dynamisk senere hvis variablene endres.
export function resolveFabricDataWithVariables(
  fabricData: any,
  variables: PresentationVariable[] = [],
) {
  if (!fabricData || typeof fabricData !== 'object') return fabricData

  const clone = JSON.parse(JSON.stringify(fabricData))
  if (!Array.isArray(clone.objects)) return clone

  clone.objects = clone.objects.map((objectItem: any) => {
    if (!objectItem || typeof objectItem !== 'object' || typeof objectItem.text !== 'string') {
      return objectItem
    }

    const templateText =
      typeof objectItem.templateText === 'string' ? objectItem.templateText : objectItem.text

    return {
      ...objectItem,
      templateText,
      text: resolveTextWithVariables(templateText, variables),
    }
  })

  return clone
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
 * Bruk med variant="outline" på Button — for Forlat/Avslutt økt, Slett på forsiden osv.
 */
export const logoutStyleDestructiveButtonClassName =
  'flex items-center justify-center gap-1.5 border-destructive/30 bg-destructive/15 text-destructive transition-colors hover:border-input hover:bg-accent hover:text-accent-foreground'
