import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, spacing, typography } from '../../design/system';
import { listAvailableTranslations, mapCatalogEntryToBibleTranslation } from '../../services/translations/translationService';
import type { MoreStackParamList } from '../../navigation/types';
import { useBibleStore } from '../../stores/bibleStore';
import { TranslationPickerList } from '../bible/TranslationPickerList';

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'TranslationBrowser'>;

export function TranslationBrowserScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);

    try {
      const catalogResult = await listAvailableTranslations();

      if (catalogResult.success && catalogResult.data && catalogResult.data.length > 0) {
        const currentStoreTranslations = useBibleStore.getState().translations;
        const runtimeTranslations = catalogResult.data.map((entry) =>
          mapCatalogEntryToBibleTranslation(
            entry,
            currentStoreTranslations.find((translation) => translation.id === entry.translation_id)
          )
        );

        useBibleStore.getState().applyRuntimeCatalog(runtimeTranslations);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bibleBackground }]}
      edges={['top']}
    >
      <View style={[styles.header, { borderBottomColor: colors.bibleDivider }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.biblePrimaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.biblePrimaryText }]}>
          {t('translations.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.bibleAccent} />
        </View>
      ) : (
        <TranslationPickerList onTranslationActivated={() => navigation.goBack()} />
      )}
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
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
