import { useRef, type RefObject } from 'react';
import type { BibleNowPlayingInput } from '../../services/audio/audioNowPlayingModel';
import type { AudioChapterMap } from '../../services/bible/contentAvailability';

export type Translate = (key: string) => string;

export interface PlayChapterOptions {
  startPositionMs?: number | null;
}

export type PlayChapterForTranslation = (
  translationId: string,
  bookId: string,
  chapter: number,
  verse?: number,
  options?: PlayChapterOptions
) => Promise<void>;

export type SyncNowPlaying = (overrides?: Partial<BibleNowPlayingInput>, force?: boolean) => void;

/** Coverage for a translation as of now, resolving it if nothing has yet. */
export type ResolveAudioCoverage = (translationId: string) => Promise<AudioChapterMap | undefined>;

/**
 * One mounted player's mutable state: what React refs hold for it. Native
 * callbacks registered by this player read it after the reader has unmounted.
 */
export interface AudioPlayerSession {
  /** Bumped by every command that takes over playback; stale loads compare it. */
  playRequestId: number;
  /** Bumped when the native player reports an error through its callback. */
  playbackErrorId: number;
  /** What the native player last reported through its error callback. */
  lastPlaybackError: string | null;
  /**
   * The play request whose chapter is being loaded. That load reports its own failure,
   * after retrying a stalled stream, so a native error meanwhile is not shown yet.
   */
  loadingPlayRequestId: number | null;
  isMounted: boolean;
  interpolationTimer: ReturnType<typeof setInterval> | null;
  // The last real poll, so position can be estimated between native snapshots
  // using wall-clock time. Re-anchored on seek, skip and resume.
  lastPollPosition: number;
  lastPollTime: number;
  lastNowPlayingSignature: string | null;
  // Native progress callbacks outlive the reader, so the sleep timer's expiry also
  // runs from them and needs the latest pause action.
  pause: (() => Promise<void>) | null;
  playChapterForTranslation: PlayChapterForTranslation | null;
}

function createAudioPlayerSession(): AudioPlayerSession {
  return {
    playRequestId: 0,
    playbackErrorId: 0,
    lastPlaybackError: null,
    loadingPlayRequestId: null,
    isMounted: false,
    interpolationTimer: null,
    lastPollPosition: 0,
    lastPollTime: 0,
    lastNowPlayingSignature: null,
    pause: null,
    playChapterForTranslation: null,
  };
}

/**
 * The calling player's session, as a ref: it is mutated by callbacks and effects,
 * never read to render.
 */
export function useAudioPlayerSession(): RefObject<AudioPlayerSession> {
  return useRef(createAudioPlayerSession());
}
