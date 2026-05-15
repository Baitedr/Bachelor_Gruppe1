import type { EmbedProvider } from './embedUrls';

/**
 * Synkroniseringsstrategi for innebygd video i live-modus:
 *
 * Tidligere implementasjon brukte rå postMessage og en estimert "lokal" tid basert
 * på wall-clock siden siste apply. Det førte til to feilmoduser i produksjon:
 *  - Når publikums YouTube-spiller bufret, estimatet ble feil → drift > terskel →
 *    `seekTo` → ny buffer → drift på nytt → **løkke (pause + skip-back)**.
 *  - Når presentatørens spiller bufret, presentatørens `t` stoppet å øke, mens
 *    publikums estimat fortsatte → negativ drift → seek bakover til en eldre `t`.
 *
 * Den nye løsningen bruker YouTube/Vimeo Player-APIene på publikumssiden for å
 * lese **faktisk** avspillingsposisjon og korrigerer drift primært ved å justere
 * `playbackRate` (0.75 / 1.0 / 1.25 for YT; kontinuerlig for Vimeo). Hard `seekTo`
 * brukes kun ved store hopp (state-bytte, eller drift > {@link HARD_SEEK_THRESHOLD_SEC}).
 * Det unngår re-buffer-løkken som ga "skip-back" på deploy.
 */

/** Drift målt mot presentatørens ekstrapolerte posisjon. Innenfor denne sonen gjør vi ingenting. */
export const DRIFT_DEADBAND_SEC = 0.4;

/** Når drift overstiger dette i en eller annen retning, seeker vi hardt fremfor å rate-korrigere. */
export const HARD_SEEK_THRESHOLD_SEC = 5;

/** Hvor ofte publikumssløyfen avstemmer faktisk vs forventet posisjon. */
export const RECONCILE_INTERVAL_MS = 500;

/**
 * Maks rate-korreksjon for å unngå hørbart "chipmunk"-lydtempo.
 * YouTubes diskrete rate-sett (0.75, 1.0, 1.25) er det vi har å spille på.
 */
const YT_RATE_FAST = 1.25;
const YT_RATE_SLOW = 0.75;
const VIMEO_RATE_FAST = 1.1;
const VIMEO_RATE_SLOW = 0.9;

const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;
const YT_STATE_PAUSED = 2;
const YT_STATE_BUFFERING = 3;
const YT_STATE_CUED = 5;

export type PresenterIntent = {
    state: 'play' | 'pause';
    /** Presenters posisjon i sekunder da prøven ble tatt. */
    time: number;
    /** Wall-clock (ms) da publikum tok imot meldingen — utgangspunkt for ekstrapolering. */
    receivedAtMs: number;
    /** Presenters wall-clock (ms) da prøven ble tatt (om kjent) — bedre latens-kompensasjon. */
    sentAtMs?: number;
    /** Monotont voksende sekvens fra presentatør for å droppe utdaterte meldinger. */
    seq: number;
};

/** Lavnivå postMessage-bruk beholdes for evt. presentatør-side fallback. */
export function postYoutubeCommand(iframe: HTMLIFrameElement, func: string, args: unknown[] = []) {
    const w = iframe.contentWindow;
    if (!w) return;
    w.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
}

export function postVimeoMethod(iframe: HTMLIFrameElement, method: string, value?: number) {
    const w = iframe.contentWindow;
    if (!w) return;
    const payload: Record<string, unknown> = { method };
    if (value !== undefined) payload.value = value;
    w.postMessage(JSON.stringify(payload), '*');
}

type YoutubePlayer = {
    destroy?: () => void;
    getCurrentTime?: () => number;
    getPlayerState?: () => number;
    getPlaybackRate?: () => number;
    setPlaybackRate?: (rate: number) => void;
    seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
    playVideo?: () => void;
    pauseVideo?: () => void;
    mute?: () => void;
    unMute?: () => void;
    setVolume?: (volume: number) => void;
    isMuted?: () => boolean;
};

type VimeoPlayer = {
    destroy?: () => Promise<void> | void;
    getCurrentTime?: () => Promise<number>;
    getPaused?: () => Promise<boolean>;
    getPlaybackRate?: () => Promise<number>;
    setPlaybackRate?: (rate: number) => Promise<unknown>;
    setCurrentTime?: (seconds: number) => Promise<unknown>;
    play?: () => Promise<unknown>;
    pause?: () => Promise<unknown>;
    setVolume?: (volume: number) => Promise<unknown>;
    setMuted?: (muted: boolean) => Promise<unknown>;
    ready?: () => Promise<void>;
    on?: (ev: string, fn: () => void) => void;
    off?: (ev: string, fn: () => void) => void;
};

/** Standardisert kontrakt slik at SyncedHostedEmbed kan håndtere YT/Vimeo likt. */
export type AudiencePlayerController = {
    /** Sluttbehandling av spiller og evt. interval. */
    destroy: () => void;
    /** Oppdater presentatørens intensjon; publikumsspilleren tilpasser seg. */
    setPresenterIntent: (intent: PresenterIntent) => void;
    /** Sett volum 0–100 (mute håndteres separat). */
    setVolume: (volumePercent: number, muted: boolean) => void;
    /** Promise som løses når spilleren er klar for kommandoer. */
    ready: Promise<void>;
};

/**
 * Felles drift-til-rate-mapping. Vi bruker tre nivåer:
 *  - innenfor deadband: 1.0x
 *  - svakt etter/foran: lett rate-korreksjon
 *  - tilstrekkelig stort men under hard-seek: kraftigere rate-korreksjon
 * Verdier returneres i [slow, fast] avhengig av provider.
 */
function pickRateForDrift(drift: number, opts: { fast: number; slow: number }): number {
    if (!Number.isFinite(drift)) return 1;
    if (Math.abs(drift) < DRIFT_DEADBAND_SEC) return 1;
    return drift > 0 ? opts.fast : opts.slow;
}

/** Estimert presentatør-posisjon nå, gitt en pakke + en wall-clock. */
function expectedPlayheadFor(intent: PresenterIntent, nowMs: number): number {
    if (intent.state !== 'play') return intent.time;
    // Bruk presenters wall-clock om kjent (best latens-kompensasjon), ellers publikums mottakstid.
    const reference = typeof intent.sentAtMs === 'number' && Number.isFinite(intent.sentAtMs)
        ? intent.sentAtMs
        : intent.receivedAtMs;
    const elapsedSec = Math.max(0, (nowMs - reference) / 1000);
    return Math.max(0, intent.time + elapsedSec);
}

/** Publikum: sett volum (0–100) via postMessage uten synlige spillerkontroller. */
export function applyHostedVolumeToIframe(iframe: HTMLIFrameElement, provider: EmbedProvider, volumePercent: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(volumePercent)));
    if (provider === 'youtube') {
        postYoutubeCommand(iframe, 'setVolume', [clamped]);
        postYoutubeCommand(iframe, clamped > 0 ? 'unMute' : 'mute', []);
        return;
    }
    postVimeoMethod(iframe, 'setVolume', clamped / 100);
}

declare global {
    interface Window {
        YT?: {
            Player: new (id: string | HTMLElement, options: Record<string, unknown>) => YoutubePlayer;
            PlayerState?: {
                ENDED: number;
                PLAYING: number;
                PAUSED: number;
                BUFFERING: number;
                CUED: number;
            };
        };
        onYouTubeIframeAPIReady?: () => void;
        Vimeo?: { Player: new (element: HTMLIFrameElement) => VimeoPlayer };
    }
}

let youtubeApiPromise: Promise<void> | null = null;

/** Laster youtube.com/iframe_api én gang og venter på `YT.Player`. */
export function ensureYoutubeIframeApi(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.YT?.Player) return Promise.resolve();
    if (youtubeApiPromise) return youtubeApiPromise;

    youtubeApiPromise = new Promise((resolve) => {
        const prior = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
            try {
                prior?.();
            } finally {
                resolve();
            }
        };
        const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
        if (!existing) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
    });
    return youtubeApiPromise;
}

let vimeoScriptPromise: Promise<void> | null = null;

/** Laster Vimeo Player.js én gang. */
export function ensureVimeoPlayerScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.Vimeo?.Player) return Promise.resolve();
    if (vimeoScriptPromise) return vimeoScriptPromise;

    vimeoScriptPromise = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = 'https://player.vimeo.com/api/player.js';
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error('Vimeo player script failed to load'));
        document.head.appendChild(tag);
    });
    return vimeoScriptPromise;
}

type AudienceControllerOptions = {
    /** Når denne overstiges blir vi pessimister og hard-seeker. */
    hardSeekThresholdSec?: number;
    /** Hvor ofte vi avstemmer faktisk posisjon mot presentatørens. */
    reconcileIntervalMs?: number;
    /** Etter en seek pauser vi rate-korreksjon kort slik at spilleren får bufret. */
    postSeekCooldownMs?: number;
};

const DEFAULT_POST_SEEK_COOLDOWN_MS = 1500;

/**
 * Lager en YouTube-publikumkontroller som leser faktisk avspillingsposisjon og
 * korrigerer drift via playbackRate. Hard `seekTo` reserveres til state-bytte
 * og store driftverdier.
 */
export function createYoutubeAudienceController(
    iframe: HTMLIFrameElement,
    elementId: string,
    options: AudienceControllerOptions = {},
): AudiencePlayerController {
    const hardSeekThreshold = options.hardSeekThresholdSec ?? HARD_SEEK_THRESHOLD_SEC;
    const reconcileInterval = options.reconcileIntervalMs ?? RECONCILE_INTERVAL_MS;
    const postSeekCooldown = options.postSeekCooldownMs ?? DEFAULT_POST_SEEK_COOLDOWN_MS;

    let player: YoutubePlayer | null = null;
    let destroyed = false;
    let currentIntent: PresenterIntent | null = null;
    let lastAppliedSeq = -1;
    let lastReconciledState: 'play' | 'pause' | null = null;
    let lastSeekAtMs = 0;
    let lastDesiredRate = 1;
    let pendingVolume: { level: number; muted: boolean } | null = null;
    let intervalId: number | null = null;

    const readyResolvers: { resolve: () => void; reject: (err: Error) => void }[] = [];
    const ready = new Promise<void>((resolve, reject) => {
        readyResolvers.push({ resolve, reject });
    });

    const finishReady = () => {
        const { resolve } = readyResolvers[0] ?? { resolve: () => {} };
        resolve();
    };

    const failReady = (err: Error) => {
        const { reject } = readyResolvers[0] ?? { reject: () => {} };
        reject(err);
    };

    const setRate = (rate: number) => {
        if (!player) return;
        if (Math.abs((lastDesiredRate ?? 1) - rate) < 0.001) return;
        lastDesiredRate = rate;
        try {
            player.setPlaybackRate?.(rate);
        } catch {
            /* noop */
        }
    };

    const reconcile = () => {
        if (destroyed || !player || !currentIntent) return;
        const intent = currentIntent;
        const nowMs = Date.now();

        if (intent.state === 'pause') {
            if (lastReconciledState !== 'pause') {
                try {
                    player.seekTo?.(intent.time, true);
                    player.pauseVideo?.();
                } catch {
                    /* noop */
                }
                lastSeekAtMs = nowMs;
                lastReconciledState = 'pause';
                setRate(1);
            }
            return;
        }

        // state === 'play'
        const expected = expectedPlayheadFor(intent, nowMs);
        let actual = 0;
        try {
            actual = player.getCurrentTime?.() ?? 0;
        } catch {
            actual = 0;
        }
        let playerState = -1;
        try {
            playerState = player.getPlayerState?.() ?? -1;
        } catch {
            /* noop */
        }

        // Sørg for at vi faktisk spiller (kommer hit etter mute/autoplay-blokk eller end-state).
        if (
            playerState === YT_STATE_PAUSED ||
            playerState === YT_STATE_ENDED ||
            playerState === YT_STATE_CUED ||
            (lastReconciledState !== 'play' && playerState !== YT_STATE_BUFFERING)
        ) {
            try {
                player.playVideo?.();
            } catch {
                /* noop */
            }
        }

        const drift = expected - actual;
        const sinceSeek = nowMs - lastSeekAtMs;

        // Etter en seek må spilleren få noen hundre ms til å bufre — ellers ser rate-justering
        // bare på et stillestående playhead og forsterker drift.
        if (sinceSeek < postSeekCooldown) {
            lastReconciledState = 'play';
            return;
        }

        if (Math.abs(drift) > hardSeekThreshold) {
            try {
                player.seekTo?.(expected, true);
                player.playVideo?.();
            } catch {
                /* noop */
            }
            lastSeekAtMs = nowMs;
            setRate(1);
            lastReconciledState = 'play';
            return;
        }

        const desired = pickRateForDrift(drift, { fast: YT_RATE_FAST, slow: YT_RATE_SLOW });
        setRate(desired);
        lastReconciledState = 'play';
    };

    const applyVolume = ({ level, muted }: { level: number; muted: boolean }) => {
        if (!player) {
            pendingVolume = { level, muted };
            return;
        }
        const clamped = Math.max(0, Math.min(100, Math.round(level)));
        try {
            if (muted || clamped === 0) {
                player.mute?.();
            } else {
                player.setVolume?.(clamped);
                player.unMute?.();
            }
        } catch {
            /* noop */
        }
    };

    void ensureYoutubeIframeApi()
        .then(() => {
            if (destroyed) return;
            if (!iframe.id) iframe.id = elementId;
            if (!window.YT?.Player) {
                failReady(new Error('YT.Player API not available'));
                return;
            }

            player = new window.YT.Player(iframe.id, {
                events: {
                    onReady: () => {
                        if (destroyed) return;
                        if (pendingVolume) {
                            applyVolume(pendingVolume);
                            pendingVolume = null;
                        }
                        finishReady();
                        if (currentIntent) reconcile();
                        intervalId = window.setInterval(reconcile, reconcileInterval);
                    },
                    onStateChange: () => {
                        // Stateendringer trenger ingen umiddelbar handling — neste tick reconcile-r.
                    },
                    onError: () => {
                        // Lar vanlig reconcile-loop håndtere recovery (forsøker playVideo).
                    },
                },
            });
        })
        .catch((err: unknown) => {
            failReady(err instanceof Error ? err : new Error('YouTube API load failed'));
        });

    return {
        ready,
        setPresenterIntent: (intent) => {
            if (destroyed) return;
            if (intent.seq <= lastAppliedSeq) return;
            lastAppliedSeq = intent.seq;
            currentIntent = intent;
            reconcile();
        },
        setVolume: (level, muted) => {
            applyVolume({ level, muted });
        },
        destroy: () => {
            destroyed = true;
            if (intervalId !== null) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
            try {
                player?.destroy?.();
            } catch {
                /* noop */
            }
            player = null;
            currentIntent = null;
        },
    };
}

/** Vimeo-variant: bruker kontinuerlig playbackRate for jevnere synk. */
export function createVimeoAudienceController(
    iframe: HTMLIFrameElement,
    options: AudienceControllerOptions = {},
): AudiencePlayerController {
    const hardSeekThreshold = options.hardSeekThresholdSec ?? HARD_SEEK_THRESHOLD_SEC;
    const reconcileInterval = options.reconcileIntervalMs ?? RECONCILE_INTERVAL_MS;
    const postSeekCooldown = options.postSeekCooldownMs ?? DEFAULT_POST_SEEK_COOLDOWN_MS;

    let player: VimeoPlayer | null = null;
    let destroyed = false;
    let currentIntent: PresenterIntent | null = null;
    let lastAppliedSeq = -1;
    let lastReconciledState: 'play' | 'pause' | null = null;
    let lastSeekAtMs = 0;
    let lastDesiredRate = 1;
    let intervalId: number | null = null;
    let inFlightReconcile = false;
    let cachedActualTime = 0;

    const readyResolvers: { resolve: () => void; reject: (err: Error) => void }[] = [];
    const ready = new Promise<void>((resolve, reject) => {
        readyResolvers.push({ resolve, reject });
    });
    const finishReady = () => {
        const { resolve } = readyResolvers[0] ?? { resolve: () => {} };
        resolve();
    };
    const failReady = (err: Error) => {
        const { reject } = readyResolvers[0] ?? { reject: () => {} };
        reject(err);
    };

    /** Hjelper for å trygt forkaste lovnadsfeil uten å bry typesystemet. */
    const swallow = (p: Promise<unknown> | void | undefined) => {
        if (p && typeof (p as Promise<unknown>).catch === 'function') {
            (p as Promise<unknown>).catch(() => {});
        }
    };

    const setRate = (rate: number) => {
        if (!player) return;
        const clamped = Math.max(0.5, Math.min(2, rate));
        if (Math.abs((lastDesiredRate ?? 1) - clamped) < 0.005) return;
        lastDesiredRate = clamped;
        swallow(player.setPlaybackRate?.(clamped));
    };

    const reconcile = () => {
        if (destroyed || !player || !currentIntent || inFlightReconcile) return;
        const intent = currentIntent;
        const nowMs = Date.now();

        if (intent.state === 'pause') {
            if (lastReconciledState !== 'pause') {
                swallow(player.pause?.());
                swallow(player.setCurrentTime?.(intent.time));
                lastSeekAtMs = nowMs;
                lastReconciledState = 'pause';
                setRate(1);
            }
            return;
        }

        const expected = expectedPlayheadFor(intent, nowMs);
        const playerSnapshot = player;
        const pending = playerSnapshot.getCurrentTime?.();
        if (!pending) {
            return;
        }
        inFlightReconcile = true;
        pending
            .then((actual) => {
                if (destroyed || !player) return;
                if (typeof actual === 'number' && Number.isFinite(actual)) {
                    cachedActualTime = actual;
                }
                const drift = expected - cachedActualTime;

                // Start avspilling om vi havnet i pauset/ferdig-tilstand.
                if (lastReconciledState !== 'play') {
                    swallow(player.play?.());
                }

                const sinceSeek = nowMs - lastSeekAtMs;
                if (sinceSeek < postSeekCooldown) {
                    lastReconciledState = 'play';
                    return;
                }

                if (Math.abs(drift) > hardSeekThreshold) {
                    swallow(player.setCurrentTime?.(expected));
                    swallow(player.play?.());
                    lastSeekAtMs = nowMs;
                    setRate(1);
                    lastReconciledState = 'play';
                    return;
                }

                const desired = pickRateForDrift(drift, { fast: VIMEO_RATE_FAST, slow: VIMEO_RATE_SLOW });
                setRate(desired);
                lastReconciledState = 'play';
            })
            .catch(() => {
                /* noop */
            })
            .finally(() => {
                inFlightReconcile = false;
            });
    };

    const applyVolume = (level: number, muted: boolean) => {
        if (!player) return;
        const clamped = Math.max(0, Math.min(100, Math.round(level)));
        swallow(player.setMuted?.(muted || clamped === 0));
        swallow(player.setVolume?.(clamped / 100));
    };

    let pendingVolume: { level: number; muted: boolean } | null = null;

    void ensureVimeoPlayerScript()
        .then(() => {
            if (destroyed) return;
            if (!window.Vimeo?.Player) {
                failReady(new Error('Vimeo.Player API not available'));
                return;
            }
            player = new window.Vimeo.Player(iframe);
            return player.ready?.();
        })
        .then(() => {
            if (destroyed || !player) return;
            if (pendingVolume) {
                applyVolume(pendingVolume.level, pendingVolume.muted);
                pendingVolume = null;
            }
            finishReady();
            if (currentIntent) reconcile();
            intervalId = window.setInterval(reconcile, reconcileInterval);
        })
        .catch((err: unknown) => {
            failReady(err instanceof Error ? err : new Error('Vimeo player init failed'));
        });

    return {
        ready,
        setPresenterIntent: (intent) => {
            if (destroyed) return;
            if (intent.seq <= lastAppliedSeq) return;
            lastAppliedSeq = intent.seq;
            currentIntent = intent;
            reconcile();
        },
        setVolume: (level, muted) => {
            if (!player) {
                pendingVolume = { level, muted };
                return;
            }
            applyVolume(level, muted);
        },
        destroy: () => {
            destroyed = true;
            if (intervalId !== null) {
                window.clearInterval(intervalId);
                intervalId = null;
            }
            try {
                const p = player;
                player = null;
                if (p?.destroy) {
                    const result = p.destroy();
                    if (result && typeof (result as Promise<void>).then === 'function') {
                        (result as Promise<void>).catch(() => {});
                    }
                }
            } catch {
                /* noop */
            }
            currentIntent = null;
        },
    };
}

/** Provider-agnostisk fabrikk som velger riktig kontroller. */
export function createAudiencePlaybackController(
    provider: EmbedProvider,
    iframe: HTMLIFrameElement,
    elementId: string,
    options?: AudienceControllerOptions,
): AudiencePlayerController {
    if (provider === 'youtube') {
        return createYoutubeAudienceController(iframe, elementId, options);
    }
    return createVimeoAudienceController(iframe, options);
}

export {
    YT_STATE_PLAYING,
    YT_STATE_PAUSED,
    YT_STATE_ENDED,
    YT_STATE_BUFFERING,
};
