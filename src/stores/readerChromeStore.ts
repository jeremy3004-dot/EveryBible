import { create } from 'zustand';
import { makeMutable, type SharedValue } from 'react-native-reanimated';

// Transient UI-thread state: chapter/focus lifecycle owns resets, never storage.
const useReaderChromeStore = create<{
  progress: SharedValue<number>;
  ownerKey: SharedValue<string>;
}>(() => ({
  progress: makeMutable(0),
  ownerKey: makeMutable(''),
}));

export const useReaderChromeProgress = (): SharedValue<number> =>
  useReaderChromeStore((state) => state.progress);

export const useReaderChromeOwner = (): SharedValue<string> =>
  useReaderChromeStore((state) => state.ownerKey);
