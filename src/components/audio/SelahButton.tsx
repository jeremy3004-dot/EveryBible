import { useSelah } from '../../hooks/audioPlayer/useSelah';

export interface SelahButtonProps {
  size?: 'regular' | 'compact';
}

/**
 * Stand-in for the player-bar lane's Selah button, at the path and with the props of
 * the shared contract; the player-bar lane's version replaces this file. The real
 * button renders nothing while Selah cannot be used, and with the stand-in useSelah
 * it never can, so this draws nothing.
 */
export function SelahButton(_props: SelahButtonProps) {
  useSelah();
  return null;
}
