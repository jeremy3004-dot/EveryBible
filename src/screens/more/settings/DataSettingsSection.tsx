import { StyleSheet, Text, View } from 'react-native';
import { Bug, CheckCircle2, CloudDownload, Trash2, UserX } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { AppCard, ListRow } from '../../../components/ui';
import { spacing, typography } from '../../../design/system';
import { ICON_STROKE, ROW_ICON_SIZE, sectionStyles } from './settingsStyles';

interface DataSettingsSectionProps {
  isSignedIn: boolean;
  onOpenDiagnostics: () => void;
  onClearCache: () => void;
  onDeleteAccount: () => void;
}

/** Diagnostics, offline status, and the two destructive actions. */
export function DataSettingsSection({
  isSignedIn,
  onOpenDiagnostics,
  onClearCache,
  onDeleteAccount,
}: DataSettingsSectionProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();

  return (
    <View style={sectionStyles.group}>
      <Text
        accessibilityRole="header"
        style={[sectionStyles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}
      >
        {t('settings.data')}
      </Text>
      <AppCard padding={0} style={sectionStyles.groupCard}>
        <ListRow
          title={t('settings.diagnostics.title')}
          leadingIcon={Bug}
          showChevron
          onPress={onOpenDiagnostics}
        />

        <ListRow
          title={t('settings.downloadForOffline')}
          leadingIcon={CloudDownload}
          stackTrailingAtLargeText
          trailing={
            <View style={styles.statusTrailing}>
              <Text
                style={[
                  typography.mono,
                  displayFont.regular,
                  styles.statusTrailingText,
                  { color: colors.secondaryText },
                ]}
              >
                {t('common.available')}
              </Text>
              <CheckCircle2 size={ROW_ICON_SIZE} color={colors.success} strokeWidth={ICON_STROKE} />
            </View>
          }
        />

        <ListRow
          title={t('settings.clearCache')}
          leadingIcon={Trash2}
          destructive
          onPress={onClearCache}
          isLast={!isSignedIn}
        />

        {isSignedIn ? (
          <ListRow
            title={t('settings.deleteAccount')}
            leadingIcon={UserX}
            destructive
            onPress={onDeleteAccount}
            isLast
          />
        ) : null}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  statusTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusTrailingText: {
    flexShrink: 1,
  },
});
