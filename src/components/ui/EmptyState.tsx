import { type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useDisplayFont } from '../../hooks';
import { radius, spacing, typography } from '../../design/system';
import { AppButton } from './AppButton';

export interface EmptyStateCta {
  label: string;
  onPress: () => void;
  loading?: boolean;
}

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  cta?: EmptyStateCta;
  style?: StyleProp<ViewStyle>;
}

const CIRCLE_SIZE = 64;

// One voice for every empty state: a soft accent halo around an icon, an eyebrow
// heading, calm body copy, and an optional CTA. The heading is deliberately
// quiet — an empty state should not shout louder than the screen title above it.
export function EmptyState({ icon, title, body, cta, style }: EmptyStateProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();

  return (
    <View style={[styles.container, style]}>
      {/* Decorative: the icon repeats the title it sits above, so it must not
          be a focus stop of its own. */}
      <View
        style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={30} color={colors.accentPrimary} />
      </View>
      <Text
        // An empty state replaces a screen's content, so its title is the
        // heading a rotor user lands on.
        accessibilityRole="header"
        style={[
          typography.eyebrow,
          displayFont.regular,
          styles.title,
          { color: colors.secondaryText },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text style={[typography.body, styles.body, { color: colors.primaryText }]}>{body}</Text>
      ) : null}
      {cta ? (
        <View style={styles.cta}>
          <AppButton
            label={cta.label}
            onPress={cta.onPress}
            loading={cta.loading}
            size="md"
            fullWidth={false}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    textAlign: 'center',
  },
  body: {
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 320,
  },
  cta: {
    marginTop: spacing.xl,
  },
});
