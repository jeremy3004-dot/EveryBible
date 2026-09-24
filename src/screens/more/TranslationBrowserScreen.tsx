import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../design/system';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { refreshRuntimeCatalog } from '../../services/translations/runtimeCatalogRefresh';
import type { MoreStackParamList } from '../../navigation/types';
import { TranslationPickerList } from '../bible/TranslationPickerList';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'TranslationBrowser'>;

export function TranslationBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Pushed tab-stack screen: the shared picker list has no bottom-inset story of
  // its own, so end it above the floating tab capsule and the Android nav bar.
  const { contentClearance } = useTabBarHeight();

  // The picker renders from the store at once, as the reader's picker sheet does: offline
  // or on a stalled network the refresh can take a whole request timeout, and the
  // translations already on the phone must stay pickable meanwhile. Refreshed rows land in
  // the store and the list follows. The shared refresh re-applies Every Language
  // additively; mapping the Supabase catalog and applying it here directly would prune the
  // EL runtime rows, which are remote audio-only and therefore dropped by the merge.
  useEffect(() => {
    refreshRuntimeCatalog().catch(() => {
      // Best effort: the rows already in the store stay listed.
    });
  }, []);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.cardBorder }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: colors.primaryText }]}
        >
          {t('translations.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.listContainer, { paddingBottom: contentClearance }]}>
        <TranslationPickerList onTranslationActivated={() => navigation.goBack()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: spacing.xs,
    minWidth: 32,
  },
  headerTitle: {
    ...typography.cardTitle,
  },
  headerSpacer: {
    width: 32,
  },
  listContainer: {
    flex: 1,
  },
});
