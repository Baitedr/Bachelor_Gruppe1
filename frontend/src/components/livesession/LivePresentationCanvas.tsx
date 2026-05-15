import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StaticCanvas } from 'fabric'
import { hideFabricEmbedPlaceholdersForLiveOverlay } from '../../lib/fabricSlideObjects'
import SlideEmbedOverlays, { type SlideEmbedLiveContext } from '../SlideEmbedOverlays'

/**
 * Live-canvas for visning av ett lysbilde med responsiv skalering.
 * @author T3lluz
 */
/** Standard lysbildestørrelse når JSON mangler eksplisitte mål (16:9). */
const BASE_WIDTH = 960
const BASE_HEIGHT = 540

const styles = {
  canvasStageWrap: 'box-border flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-visible p-4 sm:p-5',
  canvasFrame:
    'relative overflow-hidden rounded-lg shadow-[0_22px_50px_-12px_rgba(15,23,42,0.28),0_10px_28px_-8px_rgba(15,23,42,0.14),0_2px_8px_-2px_rgba(15,23,42,0.08)] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.65),0_12px_32px_-8px_rgba(0,0,0,0.45)]',
} as const

export type LiveSlideCanvasData = {
  backgroundColor?: string
  fabricData?: {
    width?: number
    height?: number
    [key: string]: unknown
  }
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
  // DOM-referanser for canvas og wrapper brukes i skaleringsregnestykket.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<InstanceType<typeof StaticCanvas> | null>(null)
  // Tvinger re-layout av iframe-overlays når sceneinnhold endres.
  const [embedLayoutRevision, setEmbedLayoutRevision] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const baseSizeRef = useRef({ width: BASE_WIDTH, height: BASE_HEIGHT })

  // Scene-størrelse sendes til overlay-komponenten for korrekt plassering av embeds.
  const sceneSize = useMemo(() => {
    const rawWidth = Number(slideData?.fabricData?.width)
    const rawHeight = Number(slideData?.fabricData?.height)
    return {
      width: Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : BASE_WIDTH,
      height: Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : BASE_HEIGHT,
    }
  }, [slideData])

  // Leser basestørrelse fra fabricData (fallback til standard 16:9).
  const resolveBaseSize = () => {
    const rawWidth = Number(slideData?.fabricData?.width)
    const rawHeight = Number(slideData?.fabricData?.height)
    const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : BASE_WIDTH
    const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : BASE_HEIGHT
    baseSizeRef.current = { width, height }
    return baseSizeRef.current
  }

  // Beregner mål og zoom slik at hele lysbildet alltid holder seg innenfor stage.
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
    // Oppretter én statisk Fabric-canvas ved mount.
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
    // Re-rendrer canvas hver gang slideData endres.
    if (!fabricRef.current) return

    // Laster nytt slide-innhold, resetter viewport og trigger overlay-relayout.
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
    // Følger container-størrelse (resizing/fullskjerm) og skalerer canvas fortløpende.
    const observer = new ResizeObserver(() => fitToContainer())
    if (containerRef.current) observer.observe(containerRef.current)
    fitToContainer()
    return () => observer.disconnect()
  }, [])

  return (
    // Wrapper holder korrekt aspect ratio, mens selve canvas fyller wrapperen.
    <div ref={containerRef} className={styles.canvasStageWrap}>
      <div ref={wrapperRef} className={styles.canvasFrame}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        <SlideEmbedOverlays
          fabricCanvasRef={fabricRef}
          variant='live'
          layoutRevision={embedLayoutRevision}
          sceneSize={sceneSize}
          embedLive={embedLive}
        />
        {presenterToolbar}
      </div>
    </div>
  )
}

export default LivePresentationCanvas
