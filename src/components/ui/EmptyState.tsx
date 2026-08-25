import {
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
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

// One voice for every empty state: a soft accent halo around an icon, a serif
// heading, calm body copy, and an optional CTA.
export function EmptyState({ icon, title, body, cta, style }: EmptyStateProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconCircle, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={30} color={colors.accentPrimary} />
      </View>
      <Text style={[typography.pageTitle, displayFont.bold, styles.title, { color: colors.primaryText }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[typography.body, styles.body, { color: colors.secondaryText }]}>{body}</Text>
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
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  cta: {
    marginTop: spacing.xl,
  },
});
