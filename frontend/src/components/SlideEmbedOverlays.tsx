import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Canvas, StaticCanvas } from 'fabric';
import { FabricEmbed } from '../lib/fabricSlideObjects';
import { getEmbedIframeSrc } from '../lib/embedUrls';
import type { EmbedPlaybackPayload } from '../lib/embedLiveShared';
import type { EmbedProvider } from '../lib/embedUrls';
import SyncedHostedEmbed from './SyncedHostedEmbed';

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
        </div>
    );
}
