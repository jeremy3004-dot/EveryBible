import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { Bell, Clock, TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { useNotificationsBlockedBySystem } from '../../../hooks/useNotificationsBlockedBySystem';
import { AppButton, AppCard, ListRow } from '../../../components/ui';
import { radius, spacing, typography } from '../../../design/system';
import { ICON_STROKE, sectionStyles, useSettingSwitchColors } from './settingsStyles';

/** A row that cannot act yet still has to be legible, just clearly inert. */
const DISABLED_ROW_OPACITY = 0.45;

interface NotificationSettingsSectionProps {
  notificationsEnabled: boolean;
  reminderTimeLabel: string;
  onToggle: () => void;
  onOpenTimePicker: () => void;
}

/** The daily reminder switch, its time, and the notice when the system blocks it. */
export function NotificationSettingsSection({
  notificationsEnabled,
  reminderTimeLabel,
  onToggle,
  onOpenTimePicker,
}: NotificationSettingsSectionProps) {
  const { colors } = useTheme();
  const displayFont = useDisplayFont();
  const { t } = useTranslation();
  const switchColors = useSettingSwitchColors();
  const notificationsBlockedBySystem = useNotificationsBlockedBySystem(notificationsEnabled);

  return (
    <View style={sectionStyles.group}>
      <Text
        accessibilityRole="header"
        style={[sectionStyles.groupEyebrow, displayFont.regular, { color: colors.secondaryText }]}
      >
        {t('settings.notifications')}
      </Text>
      <AppCard padding={0} style={sectionStyles.groupCard}>
        <ListRow
          title={t('settings.dailyReminder')}
          leadingIcon={Bell}
          trailing={
            <Switch
              value={notificationsEnabled}
              onValueChange={onToggle}
              {...switchColors}
              accessibilityLabel={t('settings.dailyReminder')}
            />
          }
        />

        {notificationsBlockedBySystem ? (
          // On in the app, blocked by the system: the reminder can never appear,
          // and only system settings can turn it back on.
          <View style={[styles.blockedNotice, { backgroundColor: colors.warningSoft }]}>
            <View style={styles.blockedNoticeCopy}>
              <TriangleAlert size={18} color={colors.onWarningSoft} strokeWidth={ICON_STROKE} />
              <Text style={[styles.blockedNoticeText, { color: colors.onWarningSoft }]}>
                {t('settings.notificationsBlockedNotice')}
              </Text>
            </View>
            <AppButton
              label={t('settings.openDeviceSettings')}
              variant="secondary"
              size="md"
              fullWidth={false}
              onPress={() => void Linking.openSettings()}
              style={styles.blockedNoticeButton}
            />
          </View>
        ) : null}

        {notificationsEnabled ? (
          <ListRow
            title={t('settings.reminderTime')}
            leadingIcon={Clock}
            value={reminderTimeLabel}
            onPress={onOpenTimePicker}
            isLast
          />
        ) : (
          // Without a reminder there is no time to set: the row stays legible
          // but inert, and announces itself as disabled rather than silent.
          <View
            style={styles.disabledRow}
            accessible
            accessibilityRole="button"
            accessibilityState={{ disabled: true }}
            accessibilityLabel={t('settings.reminderTime')}
          >
            <ListRow
              title={t('settings.reminderTime')}
              leadingIcon={Clock}
              value={reminderTimeLabel}
              isLast
            />
          </View>
        )}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledRow: {
    opacity: DISABLED_ROW_OPACITY,
  },
  blockedNotice: {
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.sm,
    gap: spacing.md,
  },
  blockedNoticeCopy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  blockedNoticeText: {
    ...typography.caption,
    flex: 1,
  },
  blockedNoticeButton: {
    alignSelf: 'flex-start',
  },
});
