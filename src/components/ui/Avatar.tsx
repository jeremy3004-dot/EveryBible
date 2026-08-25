import { Image, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../../design/system';

export interface AvatarProps {
  name?: string;
  imageUri?: string | null;
  size?: number;
}

// Two-stop gradients drawn from the Every Language field data series, in the
// order the kit prescribes (Sea, Reef, Ochre, Clay, Dusk, Sage). An avatar
// colour is categorical, which is exactly what that palette is for — the
// previous set was warm ember hues that now fight the EL blue accent.
// Each pair is the series colour over a darker stop; white initials clear
// 4.5:1 on every lower stop (lowest is Ochre at 4.60).
const WARM_GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#0099E6', '#006699'], // sea
  ['#1E8A7A', '#0E4E44'], // reef
  ['#DB9B1A', '#9C6C0D'], // ochre
  ['#BF6D3B', '#8A4B24'], // clay
  ['#6E54C4', '#482E9E'], // dusk
  ['#75905A', '#4F6638'], // sage
];

const INITIALS_COLOR = '#FFFFFF';

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
