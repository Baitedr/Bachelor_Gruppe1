/**
 * Felles type for WebSocket-melding `embed_playback` (synkronisering av innebygd video).
 */
export type EmbedPlaybackPayload = {
    slide_index: number;
    embed_key: string;
    state: 'play' | 'pause';
    time: number;
    seq: number;
};
