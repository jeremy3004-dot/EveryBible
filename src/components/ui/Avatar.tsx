import { Image, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../../design/system';

export interface AvatarProps {
  name?: string;
  imageUri?: string | null;
  size?: number;
}

// Curated warm two-stop gradients — the identity fallback stays on-brand instead
// of drifting into arbitrary hues.
const WARM_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#D96C57', '#AE4732'],
  ['#E0A15A', '#C2712B'],
  ['#C77B62', '#9A4B36'],
  ['#8FAF52', '#4C6B1F'],
  ['#C98A73', '#8F5A3C'],
  ['#B5766B', '#7E4A44'],
];

const INITIALS_COLOR = '#FBF6EE';

function hashName(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function initialsFrom(name?: string): string {
  if (!name) {
    return '';
  }
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }
  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '');
  return letters.join('');
}

export function Avatar({ name, imageUri, size = 44 }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 } as const;

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[styles.base, dimension]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const initials = initialsFrom(name);
  const gradient = WARM_GRADIENTS[hashName(name ?? '') % WARM_GRADIENTS.length];

  return (
    <LinearGradient
      colors={[gradient[0], gradient[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.base, styles.center, dimension]}
    >
      {initials ? (
        <Text style={[styles.initials, { fontSize: size * 0.4, color: INITIALS_COLOR }]}>
          {initials}
        </Text>
      ) : (
        <Ionicons name="person" size={size * 0.5} color={INITIALS_COLOR} />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderRadius: radius.pill,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '600',
  },
});
