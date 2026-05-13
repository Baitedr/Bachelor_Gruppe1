import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { EmbedProvider } from '../lib/embedUrls';
import { getEmbedIframeSrc } from '../lib/embedUrls';
import type { EmbedPlaybackPayload } from '../lib/embedLiveShared';
import {
    createAudiencePlaybackController,
    ensureVimeoPlayerScript,
    ensureYoutubeIframeApi,
    type AudiencePlayerController,
    type PresenterIntent,
} from '../lib/hostedPlayerControl';

type LayoutPct = {
    leftPct: number;
    topPct: number;
    widthPct: number;
    heightPct: number;
};

const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;

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
 * Innebygd YouTube/Vimeo i live-modus.
 *
 * Presenteren bruker spiller-APIet til å detektere state-bytter og broadcaster
 * `embed_playback`-meldinger via ActionCable. Publikum bruker en dedikert
 * publikumkontroller som leser **faktisk** avspillingsposisjon og korrigerer drift
 * ved å justere `playbackRate` i stedet for å seeke. Det forhindrer den "pause +
 * skip-back" løkken som oppstod på deploy når presentatør eller publikum bufret.
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
    audienceHostedVolume,
}: {
    layout: LayoutPct;
    provider: EmbedProvider;
    embedId: string;
    embedIndex: number;
    slideIndex: number;
    mode: 'presenter' | 'audience';
    embedPlayback: EmbedPlaybackPayload | null;
    broadcastEmbedPlayback?: (payload: EmbedPlaybackPayload) => void;
    audienceHostedVolume?: number;
}) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const reactId = useId().replace(/:/g, '');
    const iframeDomId = `hosted-embed-${slideIndex}-${embedIndex}-${reactId}`;
    const embedKey = buildEmbedKey(provider, embedId, embedIndex);
    const seqRef = useRef(0);
    const ytPlayerRef = useRef<YtPlayerLike | null>(null);
    const vimeoPlayerRef = useRef<VimeoPlayerLike | null>(null);
    const syncTimerRef = useRef<number | null>(null);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    // Publikum: kontroller som eier YT.Player/Vimeo.Player og kjører reconcile-loopen.
    const audienceControllerRef = useRef<AudiencePlayerController | null>(null);
    // Siste embedPlayback vi forsøkte å levere — brukes når kontrolleren ikke er klar enda.
    const pendingIntentRef = useRef<PresenterIntent | null>(null);

    const hideControls = mode === 'audience';
    const src = getEmbedIframeSrc(provider, embedId, {
        hideControls,
        enableApi: true,
        minimalChrome: hideControls,
        // Publikum starter alltid muted i URLen slik at autoplay-policyer aldri
        // blokkerer den initielle play-kommandoen. Lyd skrus på via API når brukeren
        // selv vil ha lyd (audienceHostedVolume > 0 og ikke mutet).
        forceMuted: mode === 'audience',
    });

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
                sent_at_ms: Date.now(),
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

    const startYoutubeSyncTimer = () => {
        clearSyncTimer();
        syncTimerRef.current = window.setInterval(() => {
            const p = ytPlayerRef.current;
            if (!p || p.getPlayerState?.() !== YT_PLAYING) return;
            const t = p.getCurrentTime?.() ?? 0;
            sendBroadcast('play', t);
        }, 3000);
    };

    const startVimeoSyncTimer = () => {
        clearSyncTimer();
        syncTimerRef.current = window.setInterval(() => {
            const p = vimeoPlayerRef.current;
            if (!p?.getCurrentTime) return;
            void p.getCurrentTime().then((t) => {
                sendBroadcast('play', t);
            });
        }, 3000);
    };

    // Reset alle ref-er når kilde/lysbilde endres (ny iframe kommer).
    useEffect(() => {
        pendingIntentRef.current = null;
        seqRef.current = 0;
        setIframeLoaded(false);
    }, [slideIndex, embedId, provider, mode]);

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
                        } else if (st === YT_BUFFERING) {
                            // Midlertidig tilstand — ikke send «pause» til publikum.
                        } else if (st === YT_PAUSED || st === YT_ENDED) {
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

            let vimeoBuffering = false;

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
                if (cancelled || vimeoBuffering) return;
                clearSyncTimer();
                void emit('pause');
            };

            const onBufferStart = () => { vimeoBuffering = true; };
            const onBufferEnd = () => { vimeoBuffering = false; };

            player.on?.('play', onPlay);
            player.on?.('pause', onPause);
            player.on?.('bufferstart', onBufferStart);
            player.on?.('bufferend', onBufferEnd);

            vimeoOff = () => {
                player.off?.('play', onPlay);
                player.off?.('pause', onPause);
                player.off?.('bufferstart', onBufferStart);
                player.off?.('bufferend', onBufferEnd);
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

    // Publikum: initialiser den dedikerte playback-kontrolleren når iframe er lastet.
    useEffect(() => {
        if (mode !== 'audience' || !iframeLoaded) return;
        const iframe = iframeRef.current;
        if (!iframe) return;

        audienceControllerRef.current?.destroy();
        const controller = createAudiencePlaybackController(provider, iframe, iframeDomId);
        audienceControllerRef.current = controller;

        // Spol ut buffret pakke (sendt før spilleren var klar).
        void controller.ready
            .then(() => {
                if (audienceControllerRef.current !== controller) return;
                if (audienceHostedVolume !== undefined) {
                    controller.setVolume(audienceHostedVolume, audienceHostedVolume === 0);
                }
                const pending = pendingIntentRef.current;
                if (pending) {
                    controller.setPresenterIntent(pending);
                    pendingIntentRef.current = null;
                }
            })
            .catch(() => {
                // Spilleren feilet — vi har ingen retry-mekanisme nå, men ny iframe-mount
                // (slide-bytte, ny URL) vil prøve på nytt.
            });

        return () => {
            controller.destroy();
            if (audienceControllerRef.current === controller) {
                audienceControllerRef.current = null;
            }
        };
        // audienceHostedVolume settes uavhengig via egen effekt.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, provider, iframeLoaded, iframeDomId]);

    // Publikum: lever ny embedPlayback til kontrolleren (eller buffer til ready).
    useEffect(() => {
        if (mode !== 'audience') return;
        if (!embedPlayback) return;
        if (embedPlayback.slide_index !== slideIndex) return;
        if (embedPlayback.embed_key !== embedKey) return;

        const intent: PresenterIntent = {
            state: embedPlayback.state,
            time: Math.max(0, Number(embedPlayback.time) || 0),
            receivedAtMs: Date.now(),
            sentAtMs:
                typeof embedPlayback.sent_at_ms === 'number' && Number.isFinite(embedPlayback.sent_at_ms)
                    ? embedPlayback.sent_at_ms
                    : undefined,
            seq: Number(embedPlayback.seq) || 0,
        };

        const controller = audienceControllerRef.current;
        if (controller) {
            controller.setPresenterIntent(intent);
        } else {
            pendingIntentRef.current = intent;
        }
    }, [embedPlayback, embedKey, mode, slideIndex]);

    // Publikum: oppdater volum via kontrolleren når brukeren justerer slider/mute.
    useEffect(() => {
        if (mode !== 'audience') return;
        if (audienceHostedVolume === undefined) return;
        const controller = audienceControllerRef.current;
        if (!controller) return;
        controller.setVolume(audienceHostedVolume, audienceHostedVolume === 0);
    }, [mode, audienceHostedVolume]);

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
