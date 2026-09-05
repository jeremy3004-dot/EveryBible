import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { radius, layout, spacing, typography } from '../../design/system';
import {
  getCrashLogs,
  clearCrashLogs,
  type CrashLogEntry,
} from '../../services/diagnostics/crashLogStore';

const STACK_PREVIEW_LINES = 6;

function getStackPreview(stack: string | undefined): string {
  if (!stack) {
    return '';
  }
  return stack.split('\n').slice(0, STACK_PREVIEW_LINES).join('\n').trim();
}

function formatEntryForExport(entry: CrashLogEntry): string {
  const timestamp = new Date(entry.timestamp).toISOString();
  const kind = entry.isFatal ? 'FATAL' : 'ERROR';
  const header = `[${timestamp}] ${kind}: ${entry.message}`;
  return entry.stack ? `${header}\n${entry.stack}` : header;
}

export function DiagnosticsScreen() {
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [entries, setEntries] = useState<CrashLogEntry[]>(() => getCrashLogs().slice().reverse());

  const handleShare = useCallback(async () => {
    if (entries.length === 0) {
      return;
    }
    try {
      const body = entries.map(formatEntryForExport).join('\n\n');
      const message = `${t('settings.diagnostics.exportHeader')}\n\n${body}`;
      await Share.share({ message });
    } catch {
      Alert.alert(t('common.error'), t('settings.diagnostics.exportError'));
    }
  }, [entries, t]);

  const handleClear = useCallback(() => {
    Alert.alert(t('settings.diagnostics.clearTitle'), t('settings.diagnostics.clearConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.diagnostics.clear'),
        style: 'destructive',
        onPress: () => {
          clearCrashLogs();
          setEntries([]);
        },
      },
    ]);
  }, [t]);

  const hasEntries = entries.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('settings.diagnostics.title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.intro}>{t('settings.diagnostics.description')}</Text>

        {hasEntries ? (
          <View style={styles.logsCard}>
            {entries.map((entry, index) => {
              const stackPreview = getStackPreview(entry.stack);
              const isLast = index === entries.length - 1;
              return (
                <View
                  key={`${entry.timestamp}-${index}`}
                  style={[styles.logItem, isLast && styles.logItemLast]}
                >
                  <View style={styles.logMeta}>
                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor: entry.isFatal ? colors.error + '22' : colors.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: entry.isFatal ? colors.error : colors.secondaryText },
                        ]}
                      >
                        {entry.isFatal
                          ? t('settings.diagnostics.badgeFatal')
                          : t('settings.diagnostics.badgeError')}
                      </Text>
                    </View>
                    <Text style={styles.logTimestamp}>
                      {new Date(entry.timestamp).toLocaleString(i18n.language)}
                    </Text>
                  </View>
                  <Text style={styles.logMessage}>{entry.message}</Text>
                  {stackPreview ? (
                    <Text style={styles.logStack} numberOfLines={STACK_PREVIEW_LINES}>
                      {stackPreview}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.secondaryText} />
            <Text style={styles.emptyTitle}>{t('settings.diagnostics.emptyTitle')}</Text>
            <Text style={styles.emptyBody}>{t('settings.diagnostics.emptyBody')}</Text>
          </View>
        )}
      </ScrollView>

      {hasEntries ? (
        <View style={styles.actionBar}>
          <TouchableOpacity style={[styles.actionButton, styles.shareButton]} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color={colors.onAccent} />
            <Text style={styles.shareButtonText}>{t('interface.share')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.clearButton]} onPress={handleClear}>
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={styles.clearButtonText}>{t('settings.diagnostics.clear')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: layout.screenPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    backButton: {
      padding: spacing.xs,
    },
    headerTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: layout.screenPadding,
    },
    intro: {
      ...typography.body,
      color: colors.secondaryText,
      marginBottom: spacing.lg,
    },
    logsCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    logItem: {
      padding: layout.cardPadding,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    logItemLast: {
      borderBottomWidth: 0,
    },
    logMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    badgeText: {
      ...typography.micro,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    logTimestamp: {
      ...typography.micro,
      color: colors.secondaryText,
    },
    logMessage: {
      ...typography.body,
      color: colors.primaryText,
      marginBottom: spacing.xs,
    },
    logStack: {
      ...typography.micro,
      color: colors.secondaryText,
      fontFamily: 'monospace',
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      gap: spacing.md,
    },
    emptyTitle: {
      ...typography.sectionTitle,
      color: colors.primaryText,
      textAlign: 'center',
    },
    emptyBody: {
      ...typography.body,
      color: colors.secondaryText,
      textAlign: 'center',
    },
    actionBar: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: layout.screenPadding,
      borderTopWidth: 1,
      borderTopColor: colors.cardBorder,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    shareButton: {
      backgroundColor: colors.accentPrimary,
    },
    shareButtonText: {
      ...typography.button,
      color: colors.onAccent,
    },
    clearButton: {
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.error,
    },
    clearButtonText: {
      ...typography.button,
      color: colors.error,
    },
  });
