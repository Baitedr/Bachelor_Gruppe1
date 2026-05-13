import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { Canvas, StaticCanvas } from 'fabric';
import { FabricEmbed } from '../lib/fabricSlideObjects';
import { getEmbedIframeSrc } from '../lib/embedUrls';
import type { EmbedPlaybackPayload } from '../lib/embedLiveShared';
import type { EmbedProvider } from '../lib/embedUrls';
import { cn } from '@/lib/utils';
import SyncedHostedEmbed from './SyncedHostedEmbed';
import { Button } from './ui/button';

export type SlideEmbedOverlayVariant = 'editor' | 'live';

/** Kontekst for synkronisert avspilling (presentatør sender, publikum følger). */
export type SlideEmbedLiveContext = {
    role: 'presenter' | 'audience';
    slideIndex: number;
    embedPlayback: EmbedPlaybackPayload | null;
    broadcastEmbedPlayback?: (payload: EmbedPlaybackPayload) => void;
    /** Publikum: 0–100 til postMessage setVolume (etter muting). */
    audienceHostedVolume?: number;
    /** Publikum: volumkontroll over video (kun når lysbildet har Fabric/embed). */
    audienceVolumeUi?: {
        level: number;
        muted: boolean;
        setLevel: (value: number) => void;
        toggleMute: () => void;
    };
};

type AudienceVolumeUi = NonNullable<SlideEmbedLiveContext['audienceVolumeUi']>;

type LayoutItem = {
    key: string;
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
    provider: EmbedProvider;
    embedId: string;
    embedIndex: number;
    title: string;
};

function isFabricEmbedInstance(obj: unknown): obj is FabricEmbed {
    return Boolean(obj && typeof obj === 'object' && (obj as FabricEmbed).type === 'embed');
}

/** Signatur brukt til å unngå unødvendig React-state når geometri er uendret. */
function layoutSignature(canvas: Canvas | StaticCanvas, sceneW: number, sceneH: number): string {
    const parts: string[] = [];

    canvas.getObjects().forEach((obj, index) => {
        if (!isFabricEmbedInstance(obj)) return;
        obj.setCoords();
        const br = obj.getBoundingRect();
        parts.push(
            [
                index,
                obj.embedProvider,
                obj.embedId,
                br.left.toFixed(2),
                br.top.toFixed(2),
                br.width.toFixed(2),
                br.height.toFixed(2),
                sceneW.toFixed(2),
                sceneH.toFixed(2),
            ].join(':'),
        );
    });

    return parts.join('|');
}

/** Prosent av scenens bredde/høyde (ikke lerrets-piksler etter viewport-skala). */
function computeLayouts(canvas: Canvas | StaticCanvas, sceneW: number, sceneH: number): LayoutItem[] {
    if (!sceneW || !sceneH) return [];

    const items: LayoutItem[] = [];
    let embedIndex = 0;

    canvas.getObjects().forEach((obj) => {
        if (!isFabricEmbedInstance(obj)) return;
        obj.setCoords();
        const br = obj.getBoundingRect();
        items.push({
            key: `${obj.embedProvider}-${obj.embedId}-${embedIndex}`,
            leftPct: (br.left / sceneW) * 100,
            topPct: (br.top / sceneH) * 100,
            widthPct: (br.width / sceneW) * 100,
            heightPct: (br.height / sceneH) * 100,
            provider: obj.embedProvider,
            embedId: obj.embedId,
            embedIndex,
            title: obj.embedProvider === 'youtube' ? 'YouTube-video' : 'Vimeo-video',
        });
        embedIndex += 1;
    });

    return items;
}

type SlideEmbedOverlaysProps = {
    fabricCanvasRef: RefObject<Canvas | StaticCanvas | null>;
    variant: SlideEmbedOverlayVariant;
    layoutRevision?: number;
    /** Lysbilde i «logiske» piksler (f.eks. 960×540); må brukes når Fabric har viewportTransform. */
    sceneSize: { width: number; height: number };
    embedLive?: SlideEmbedLiveContext | null;
};

/**
 * Legger HTML-iframes oppå Fabric-objekter av typen `embed`.
 * I redigeringsmodus har iframe `pointer-events: none` slik at Fabric får museklikk.
 * I live brukes `SyncedHostedEmbed` for synk og forskjell presentatør/publikum.
 */
export default function SlideEmbedOverlays({
    fabricCanvasRef,
    variant,
    layoutRevision = 0,
    sceneSize,
    embedLive = null,
}: SlideEmbedOverlaysProps) {
    const [layouts, setLayouts] = useState<LayoutItem[]>([]);
    const sigRef = useRef('');

    const refresh = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) {
            setLayouts([]);
            sigRef.current = '';
            return;
        }

        const nextSig = layoutSignature(canvas, sceneSize.width, sceneSize.height);
        if (nextSig === sigRef.current) return;
        sigRef.current = nextSig;
        setLayouts(computeLayouts(canvas, sceneSize.width, sceneSize.height));
    }, [fabricCanvasRef, sceneSize.width, sceneSize.height]);

    useLayoutEffect(() => {
        refresh();
    }, [refresh, layoutRevision]);

    useEffect(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;

        const schedule = () => {
            refresh();
        };

        canvas.on('object:added', schedule);
        canvas.on('object:removed', schedule);
        canvas.on('object:modified', schedule);
        canvas.on('object:moving', schedule);
        canvas.on('object:scaling', schedule);
        canvas.on('object:rotating', schedule);
        canvas.on('object:skewing', schedule);
        canvas.on('mouse:up', schedule);
        canvas.on('selection:created', schedule);
        canvas.on('selection:updated', schedule);
        canvas.on('selection:cleared', schedule);

        return () => {
            canvas.off('object:added', schedule);
            canvas.off('object:removed', schedule);
            canvas.off('object:modified', schedule);
            canvas.off('object:moving', schedule);
            canvas.off('object:scaling', schedule);
            canvas.off('object:rotating', schedule);
            canvas.off('object:skewing', schedule);
            canvas.off('mouse:up', schedule);
            canvas.off('selection:created', schedule);
            canvas.off('selection:updated', schedule);
            canvas.off('selection:cleared', schedule);
        };
    }, [fabricCanvasRef, refresh]);

    const iframePointerEvents = variant === 'live' ? 'auto' : 'none';

    return (
        <div
            className="pointer-events-none absolute inset-0 z-[5] overflow-hidden rounded-lg"
            aria-hidden={variant === 'editor'}
        >
            {layouts.map((item) => {
                if (variant === 'live' && embedLive) {
                    return (
                        <SyncedHostedEmbed
                            key={`${item.key}-${embedLive.slideIndex}`}
                            layout={{
                                leftPct: item.leftPct,
                                topPct: item.topPct,
                                widthPct: item.widthPct,
                                heightPct: item.heightPct,
                            }}
                            provider={item.provider}
                            embedId={item.embedId}
                            embedIndex={item.embedIndex}
                            slideIndex={embedLive.slideIndex}
                            mode={embedLive.role}
                            embedPlayback={embedLive.embedPlayback}
                            broadcastEmbedPlayback={
                                embedLive.role === 'presenter' ? embedLive.broadcastEmbedPlayback : undefined
                            }
                            audienceHostedVolume={embedLive.audienceHostedVolume}
                        />
                    );
                }

                return (
                    <iframe
                        key={item.key}
                        title={item.title}
                        src={getEmbedIframeSrc(item.provider, item.embedId)}
                        className="absolute block h-full min-h-0 min-w-0 rounded-md border-0 shadow-sm"
                        style={{
                            left: `${item.leftPct}%`,
                            top: `${item.topPct}%`,
                            width: `${item.widthPct}%`,
                            height: `${item.heightPct}%`,
                            pointerEvents: iframePointerEvents,
                            backgroundColor: '#000000',
                        }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                );
            })}
            {variant === 'live' &&
                embedLive?.role === 'audience' &&
                embedLive.audienceVolumeUi &&
                layouts.length > 0 && (
                    <AudienceMediaVolumeOverlay
                        ui={embedLive.audienceVolumeUi}
                        layout={layouts[0]}
                    />
                )}
        </div>
    );
}

/** Publikum: volumkontroll festet til nederst til høyre på første media-beholder på lysbildet. */
function AudienceMediaVolumeOverlay({
    ui,
    layout,
}: {
    ui: AudienceVolumeUi;
    layout: LayoutItem;
}) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [hover, setHover] = useState(false);
    const expanded = hover;

    const { level, muted, setLevel, toggleMute } = ui;
    const rangeValue = muted ? 0 : level;

    return (
        <div
            className="pointer-events-none absolute z-[18]"
            style={{
                left: `${layout.leftPct}%`,
                top: `${layout.topPct}%`,
                width: `${layout.widthPct}%`,
                height: `${layout.heightPct}%`,
            }}
        >
            <div
                ref={rootRef}
                className={cn(
                    'pointer-events-auto absolute bottom-2 right-2 h-9 rounded-full transition-[width] duration-300 ease-out',
                    expanded ? 'w-[min(11.25rem,calc(100vw-9rem))]' : 'w-9',
                )}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
            >
                <div className="relative h-9 w-full">
                    <div
                        className="absolute inset-0 rounded-full border border-white/20 bg-black/55 shadow-md backdrop-blur-md dark:border-white/25 dark:bg-black/65"
                    >
                    </div>
                    <div
                        className={cn(
                            'absolute inset-y-0 left-2 right-11 flex items-center overflow-hidden transition-opacity duration-250 ease-out',
                            expanded ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
                        )}
                    >
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={rangeValue}
                            aria-label="Videovolum"
                            className="h-1.5 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/25 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-white/25 [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/70 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(0,0,0,0.2)] [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-white/70 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_0_0_2px_rgba(0,0,0,0.2)]"
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setLevel(Number.isFinite(next) ? next : 0);
                            }}
                        />
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-9 w-9 shrink-0 rounded-full border border-white/20 bg-black/55 p-0 text-white shadow-md backdrop-blur-md hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-0 dark:border-white/25 dark:bg-black/65"
                        aria-label={muted ? 'Slå på lyd' : 'Demp'}
                        aria-pressed={muted}
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleMute();
                        }}
                    >
                        {muted || level === 0 ? (
                            <VolumeX className="h-4 w-4" aria-hidden />
                        ) : (
                            <Volume2 className="h-4 w-4" aria-hidden />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
