import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { EmbedProvider } from '../lib/embedUrls';
import { getEmbedIframeSrc } from '../lib/embedUrls';
import type { EmbedPlaybackPayload } from '../lib/embedLiveShared';
import {
    applyHostedPlaybackToIframe,
    ensureVimeoPlayerScript,
    ensureYoutubeIframeApi,
} from '../lib/hostedPlayerControl';

type LayoutPct = {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
};

const YT_PLAYING = 1;

/** Stabil nøkkel som matcher WebSocket-payload (`provider:id:indeks`). */
function buildEmbedKey(provider: EmbedProvider, embedId: string, embedIndex: number) {
    return `${provider}:${embedId}:${embedIndex}`;
}

type YtPlayerLike = {
    destroy?: () => void;
    getCurrentTime?: () => number;
    getPlayerState?: () => number;
};

type VimeoPlayerLike = {
    destroy?: () => void;
    on?: (ev: string, fn: () => void) => void;
    off?: (ev: string, fn: () => void) => void;
    getCurrentTime?: () => Promise<number>;
};

/**
 * Innebygd YouTube/Vimeo i live-modus: presentatør sender avspilling via ActionCable,
 * publikum får chromeless iframe og kan ikke styre spilleren (pointer-events + controls=0).
 */
export default function SyncedHostedEmbed({
    layout,
    provider,
    embedId,
    embedIndex,
    slideIndex,
    mode,
    embedPlayback,
    broadcastEmbedPlayback,
}: {
    layout: LayoutPct;
    provider: EmbedProvider;
    embedId: string;
    embedIndex: number;
    slideIndex: number;
    mode: 'presenter' | 'audience';
    embedPlayback: EmbedPlaybackPayload | null;
    broadcastEmbedPlayback?: (payload: EmbedPlaybackPayload) => void;
}) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const reactId = useId().replace(/:/g, '');
    const iframeDomId = `hosted-embed-${slideIndex}-${embedIndex}-${reactId}`;
    const embedKey = buildEmbedKey(provider, embedId, embedIndex);
    const seqRef = useRef(0);
    const lastAppliedSeqRef = useRef(-1);
    const ytPlayerRef = useRef<YtPlayerLike | null>(null);
    const vimeoPlayerRef = useRef<VimeoPlayerLike | null>(null);
    const syncTimerRef = useRef<number | null>(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    // Ny kilde eller lysbilde: nullstill sekvens slik at første synk-melding ikke droppes.
    useEffect(() => {
        lastAppliedSeqRef.current = -1;
        setIframeLoaded(false);
    }, [slideIndex, embedId, provider]);

    const hideControls = mode === 'audience';
    const src = getEmbedIframeSrc(provider, embedId, { hideControls, enableApi: true });

    const sendBroadcast = useCallback(
        (state: 'play' | 'pause', time: number) => {
            if (!broadcastEmbedPlayback) return;
            const seq = (seqRef.current += 1);
            broadcastEmbedPlayback({
                slide_index: slideIndex,
                embed_key: embedKey,
                state,
                time,
                seq,
            });
        },
        [broadcastEmbedPlayback, embedKey, slideIndex],
    );

    const clearSyncTimer = () => {
        if (syncTimerRef.current !== null) {
            window.clearInterval(syncTimerRef.current);
            syncTimerRef.current = null;
        }
    };

    /** Periodisk posisjon mens video spiller (holder publikum omtrent i takt). */
    const startYoutubeSyncTimer = () => {
        clearSyncTimer();
        syncTimerRef.current = window.setInterval(() => {
            const p = ytPlayerRef.current;
            if (!p || p.getPlayerState?.() !== YT_PLAYING) return;
            const t = p.getCurrentTime?.() ?? 0;
            sendBroadcast('play', t);
        }, 900);
    };

    const startVimeoSyncTimer = () => {
        clearSyncTimer();
        syncTimerRef.current = window.setInterval(() => {
            const p = vimeoPlayerRef.current;
            if (!p?.getCurrentTime) return;
            void p.getCurrentTime().then((t) => {
                sendBroadcast('play', t);
            });
        }, 900);
    };

    // Presentatør: YouTube IFrame API for play/pause og tidsstempel.
    useEffect(() => {
        if (mode !== 'presenter' || provider !== 'youtube' || !iframeLoaded) return;
        let cancelled = false;

        const run = async () => {
            await ensureYoutubeIframeApi();
            if (cancelled || !iframeRef.current || !window.YT?.Player) return;

            const iframe = iframeRef.current;
            if (!iframe.id) iframe.id = iframeDomId;

            ytPlayerRef.current?.destroy?.();
            ytPlayerRef.current = null;

            const player = new window.YT.Player(iframe.id, {
                events: {
                    onStateChange: (e: { data: number; target: { getCurrentTime?: () => number } }) => {
                        if (cancelled) return;
                        const st = e.data;
                        const t = e.target.getCurrentTime?.() ?? 0;
                        if (st === YT_PLAYING) {
                            sendBroadcast('play', t);
                            startYoutubeSyncTimer();
                        } else {
                            clearSyncTimer();
                            sendBroadcast('pause', t);
                        }
                    },
                },
            });
            ytPlayerRef.current = player as YtPlayerLike;
        };

        void run();

        return () => {
            cancelled = true;
            clearSyncTimer();
            ytPlayerRef.current?.destroy?.();
            ytPlayerRef.current = null;
        };
    }, [mode, provider, iframeLoaded, iframeDomId, sendBroadcast]);

    // Presentatør: Vimeo Player.js for samme mønster som YouTube.
    useEffect(() => {
        if (mode !== 'presenter' || provider !== 'vimeo' || !iframeLoaded) return;
        let cancelled = false;
        let vimeoOff: (() => void) | undefined;

        const run = async () => {
            await ensureVimeoPlayerScript();
            if (cancelled || !iframeRef.current || !window.Vimeo) return;

            vimeoPlayerRef.current?.destroy?.();
            vimeoPlayerRef.current = null;

            const player = new window.Vimeo.Player(iframeRef.current);
            vimeoPlayerRef.current = player;

            const emit = async (state: 'play' | 'pause') => {
                const t = await player.getCurrentTime?.().catch(() => 0);
                sendBroadcast(state, t);
            };

            const onPlay = () => {
                if (cancelled) return;
                void emit('play');
                startVimeoSyncTimer();
            };

            const onPause = () => {
                if (cancelled) return;
                clearSyncTimer();
                void emit('pause');
            };

            player.on?.('play', onPlay);
            player.on?.('pause', onPause);

            vimeoOff = () => {
                player.off?.('play', onPlay);
                player.off?.('pause', onPause);
            };
        };

        void run();

        return () => {
            cancelled = true;
            clearSyncTimer();
            vimeoOff?.();
            vimeoPlayerRef.current?.destroy?.();
            vimeoPlayerRef.current = null;
        };
    }, [mode, provider, iframeLoaded, sendBroadcast]);

    // Publikum: bruk siste `seq` for å ignorere duplikater og utdaterte meldinger.
    useEffect(() => {
        if (mode !== 'audience') return;
        if (!embedPlayback) return;
        if (embedPlayback.slide_index !== slideIndex) return;
        if (embedPlayback.embed_key !== embedKey) return;
        if (embedPlayback.seq <= lastAppliedSeqRef.current) return;

        const iframe = iframeRef.current;
        if (!iframe?.contentWindow) return;

        lastAppliedSeqRef.current = embedPlayback.seq;
        applyHostedPlaybackToIframe(iframe, provider, embedPlayback.state, embedPlayback.time);
    }, [embedPlayback, embedKey, mode, provider, slideIndex]);

    const pointerEvents = mode === 'audience' ? 'none' : 'auto';

    return (
        <div
            className="absolute overflow-hidden rounded-md shadow-sm"
            style={{
                left: `${layout.leftPct}%`,
                top: `${layout.topPct}%`,
                width: `${layout.widthPct}%`,
                height: `${layout.heightPct}%`,
                pointerEvents: 'none',
                backgroundColor: '#000000',
            }}
        >
            <iframe
                ref={iframeRef}
                key={src}
                id={iframeDomId}
                title={provider === 'youtube' ? 'YouTube-video' : 'Vimeo-video'}
                src={src}
                className="block h-full w-full min-h-0 min-w-0 border-0"
                style={{ pointerEvents }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onLoad={() => setIframeLoaded(true)}
            />
        </div>
    );
}
