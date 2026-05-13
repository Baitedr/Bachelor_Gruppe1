/**
 * Felles type for WebSocket-melding `embed_playback` (synkronisering av innebygd video).
 */
export type EmbedPlaybackPayload = {
    slide_index: number;
    embed_key: string;
    state: 'play' | 'pause';
    time: number;
    seq: number;
    /**
     * Presenter wall-clock (epoch ms) when the sample was taken.
     * Used by the audience to extrapolate the presenter's current playhead
     * (`time + (now - sent_at_ms) / 1000`) so that we compensate for network latency
     * instead of always seeking the audience to a stale timestamp.
     * Optional for backwards compatibility — falls back to local receive time.
     */
    sent_at_ms?: number;
};
