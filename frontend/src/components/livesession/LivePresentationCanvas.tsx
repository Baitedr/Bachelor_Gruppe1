import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { StaticCanvas } from 'fabric'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { hideFabricEmbedPlaceholdersForLiveOverlay } from '../../lib/fabricSlideObjects'
import SlideEmbedOverlays, { type SlideEmbedLiveContext } from '../SlideEmbedOverlays'

/** Standard lysbildestørrelse når JSON mangler eksplisitte mål (16:9). */
const BASE_WIDTH = 960
const BASE_HEIGHT = 540

export type LiveSlideCanvasData = {
  backgroundColor?: string
  fabricData?: {
    width?: number
    height?: number
    [key: string]: unknown
  }
}

type AudienceVolumeUi = NonNullable<SlideEmbedLiveContext['audienceVolumeUi']>

/** Publikum: liten knapp over video; hover eller klikk utvider volumskyver (shadcn-farger via tema). */
function AudienceMediaVolumeOverlay({ ui }: { ui: AudienceVolumeUi }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const expanded = hover || pinned

  useEffect(() => {
    if (!pinned) return
    const onDocDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setPinned(false)
    }
    document.addEventListener('mousedown', onDocDown, true)
    return () => document.removeEventListener('mousedown', onDocDown, true)
  }, [pinned])

  const { level, muted, setLevel, toggleMute } = ui
  const rangeValue = muted ? 0 : level

  return (
    <div
      ref={rootRef}
      className='pointer-events-auto absolute bottom-2 right-2 z-[18]'
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={cn(
          'flex items-center rounded-full border border-border/70 bg-background/85 shadow-lg backdrop-blur-md transition-[padding,gap,transform] duration-300 ease-out dark:bg-card/85',
          expanded ? 'translate-y-0 gap-2 px-2 py-1.5' : 'translate-y-0 p-2',
        )}
      >
        {!expanded ? (
          <Button
            type='button'
            variant='secondary'
            size='icon'
            className='h-9 w-9 rounded-full border border-border/60 shadow-sm'
            aria-label='Vis volumkontroll'
            onClick={() => setPinned(true)}
          >
            <Volume2 className='h-4 w-4 text-foreground' aria-hidden />
          </Button>
        ) : (
          <>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8 shrink-0 text-foreground'
              aria-pressed={muted}
              aria-label={muted ? 'Slå på lyd' : 'Demp'}
              onClick={(event) => {
                event.stopPropagation()
                toggleMute()
              }}
            >
              {muted || level === 0 ? <VolumeX className='h-4 w-4' aria-hidden /> : <Volume2 className='h-4 w-4' aria-hidden />}
            </Button>
            <input
              type='range'
              min={0}
              max={100}
              value={rangeValue}
              aria-label='Videovolum'
              className='h-1.5 w-[min(10rem,calc(100vw-8rem))] cursor-pointer accent-primary'
              onChange={(event) => {
                const next = Number(event.target.value)
                setLevel(Number.isFinite(next) ? next : 0)
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Statisk Fabric-visning av ett lysbilde under live (presentatør eller publikum).
 * Skalerer proporsjonalt til foreldrens bredde/høyde via ResizeObserver.
 * Innebygde videoer: HTML-lag over canvas; Fabric-placeholdere skjules for å unngå synlig «blødning».
 */
const LivePresentationCanvas = ({
  slideData,
  presenterToolbar = null,
  embedLive = null,
}: {
  slideData: LiveSlideCanvasData | null | undefined
  presenterToolbar?: ReactNode
  embedLive?: SlideEmbedLiveContext | null
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<InstanceType<typeof StaticCanvas> | null>(null)
  const [embedLayoutRevision, setEmbedLayoutRevision] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const baseSizeRef = useRef({ width: BASE_WIDTH, height: BASE_HEIGHT })

  const sceneSize = useMemo(() => {
    const rawWidth = Number(slideData?.fabricData?.width)
    const rawHeight = Number(slideData?.fabricData?.height)
    return {
      width: Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : BASE_WIDTH,
      height: Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : BASE_HEIGHT,
    }
  }, [slideData])

  const resolveBaseSize = () => {
    const rawWidth = Number(slideData?.fabricData?.width)
    const rawHeight = Number(slideData?.fabricData?.height)
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : BASE_WIDTH
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : BASE_HEIGHT
    baseSizeRef.current = { width, height }
    return baseSizeRef.current
  }

  const fitToContainer = () => {
    if (!containerRef.current || !wrapperRef.current || !fabricRef.current) return

    const { width: baseWidth, height: baseHeight } = baseSizeRef.current
    const availableWidth = containerRef.current.clientWidth
    const availableHeight = containerRef.current.clientHeight
    const scale = Math.min(availableWidth / baseWidth, availableHeight / baseHeight)
    if (!Number.isFinite(scale) || scale <= 0) return

    const targetWidth = Math.max(1, Math.floor(baseWidth * scale))
    const targetHeight = Math.max(1, Math.floor(baseHeight * scale))

    wrapperRef.current.style.width = `${targetWidth}px`
    wrapperRef.current.style.height = `${targetHeight}px`

    fabricRef.current.setDimensions({ width: targetWidth, height: targetHeight })
    fabricRef.current.setViewportTransform([scale, 0, 0, scale, 0, 0])
    fabricRef.current.requestRenderAll()
  }

  useEffect(() => {
    if (!canvasRef.current) return

    const { width, height } = resolveBaseSize()
    fabricRef.current = new StaticCanvas(canvasRef.current, {
      width,
      height,
      backgroundColor: slideData?.backgroundColor || '#ffffff',
    })

    return () => {
      fabricRef.current?.dispose()
      fabricRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- én gang per mount; slide oppdateres i egen effekt
  }, [])

  useEffect(() => {
    if (!fabricRef.current) return

    const renderData = async () => {
      const { width, height } = resolveBaseSize()
      if (slideData?.fabricData) {
        await fabricRef.current!.loadFromJSON(slideData.fabricData as object)
      } else {
        fabricRef.current!.clear()
      }

      fabricRef.current!.setDimensions({ width, height })
      fabricRef.current!.setViewportTransform([1, 0, 0, 1, 0, 0])
      fabricRef.current!.backgroundColor = slideData?.backgroundColor || '#ffffff'
      fabricRef.current!.renderAll()
      // Skjul grå «ramme»-rektangler under iframe (unngår synlig kant ved skalering).
      hideFabricEmbedPlaceholdersForLiveOverlay(fabricRef.current!)
      fitToContainer()
      setEmbedLayoutRevision((x) => x + 1)
    }

    void renderData()
  }, [slideData])

  useEffect(() => {
    const observer = new ResizeObserver(() => fitToContainer())
    if (containerRef.current) observer.observe(containerRef.current)
    fitToContainer()
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className='box-border flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-visible p-4 sm:p-5'
    >
      <div
        ref={wrapperRef}
        className='relative overflow-hidden rounded-lg shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]'
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        <SlideEmbedOverlays
          fabricCanvasRef={fabricRef}
          variant='live'
          layoutRevision={embedLayoutRevision}
          sceneSize={sceneSize}
          embedLive={embedLive}
        />
        {embedLive?.role === 'audience' && embedLive.audienceVolumeUi && slideData?.fabricData ? (
          <AudienceMediaVolumeOverlay ui={embedLive.audienceVolumeUi} />
        ) : null}
        {presenterToolbar}
      </div>
    </div>
  )
}

export default LivePresentationCanvas
