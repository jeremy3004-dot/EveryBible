import TrackPlayer, { Event, type Subscription } from './trackPlayer';
import {
  buildBibleNowPlayingPayload,
  type BibleNowPlayingInput,
  type BibleNowPlayingPayload,
} from './audioNowPlayingModel';

type MaybePromise = void | Promise<void>;

export type BibleNowPlayingRemoteCommandHandlers = {
  onPlay?: () => MaybePromise;
  onPause?: () => MaybePromise;
  onStop?: () => MaybePromise;
  onSeek?: (positionMs: number) => MaybePromise;
  onNext?: () => MaybePromise;
  onPrevious?: () => MaybePromise;
};

let currentBibleNowPlayingPayload: BibleNowPlayingPayload | null = null;

export function syncBibleNowPlaying(
  input: BibleNowPlayingInput
): BibleNowPlayingPayload | null {
  currentBibleNowPlayingPayload = buildBibleNowPlayingPayload(input);
  return currentBibleNowPlayingPayload;
}

export function clearBibleNowPlaying(): void {
  currentBibleNowPlayingPayload = null;
}

export function getBibleNowPlayingSnapshot(): BibleNowPlayingPayload | null {
  return currentBibleNowPlayingPayload;
}

export function subscribeBibleNowPlayingRemoteCommands(
  handlers: BibleNowPlayingRemoteCommandHandlers
): () => void {
  const subscriptions: Subscription[] = [];

  if (handlers.onPlay) {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemotePlay, () => {
        void handlers.onPlay?.();
      })
    );
  }

  if (handlers.onPause) {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemotePause, () => {
        void handlers.onPause?.();
      })
    );
  }

  if (handlers.onStop) {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemoteStop, () => {
        void handlers.onStop?.();
      })
    );
  }

  if (handlers.onSeek) {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => {
        void handlers.onSeek?.(position * 1000);
      })
    );
  }

  if (handlers.onNext) {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemoteNext, () => {
        void handlers.onNext?.();
      })
    );
  }

  if (handlers.onPrevious) {
    subscriptions.push(
      TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        void handlers.onPrevious?.();
      })
    );
  }

  return () => {
    for (const subscription of subscriptions) {
      subscription.remove();
    }
  };
}
