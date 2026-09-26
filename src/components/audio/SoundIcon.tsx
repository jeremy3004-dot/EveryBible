import {
  AudioLines,
  BellRing,
  Bird,
  BookOpen,
  Church,
  CloudRain,
  Droplets,
  Flame,
  Flower2,
  Guitar,
  House,
  Landmark,
  Moon,
  Music,
  Music2,
  Music4,
  Piano,
  Shell,
  Shuffle,
  Sparkles,
  Trees,
  VolumeX,
  Waves,
  Wind,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';
import type { BackgroundMusicChoice } from '../../types/audio';

// One glyph per background sound, shared by the sound library's tiles and the
// player bar's sound button, so a sound looks the same wherever it is shown.
const SOUND_ICONS: Partial<Record<BackgroundMusicChoice, LucideIcon>> = {
  off: VolumeX,
  shuffle: Shuffle,
  ambient: Sparkles,
  piano: Piano,
  'soft-guitar': Guitar,
  harp: Music2,
  flute: Music4,
  sitar: AudioLines,
  'ocean-waves': Waves,
  hymns: BookOpen,
  'gregorian-chant': Landmark,
  organ: Church,
  'piano-cello': Music2,
  rain: CloudRain,
  'gentle-breeze': Wind,
  'summer-night': Moon,
  waterfall: Droplets,
  birdsong: Bird,
  shore: Shell,
  fireplace: Flame,
  'church-bells': BellRing,
  village: House,
  garden: Flower2,
  wilderness: Trees,
};

/** The sound's glyph; a sound added to the catalog without one gets a neutral note. */
export function SoundIcon({ choice, ...props }: { choice: BackgroundMusicChoice } & LucideProps) {
  const Icon = SOUND_ICONS[choice] ?? Music;
  return <Icon {...props} />;
}
