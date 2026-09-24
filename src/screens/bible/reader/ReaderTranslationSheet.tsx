import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import type { BibleTranslation } from '../../../types';
import { TranslationPickerList } from '../TranslationPickerList';
import { styles } from './readerStyles';

export interface ReaderTranslationSheetProps {
  canShowTranslationSheet: boolean;
  handleCloseTranslationSheet: () => void;
  handleTranslationActivated: (translation: BibleTranslation) => void;
  showTranslationSheet: boolean;
}

/** The shared translation picker in a fixed-height sheet. */
export function ReaderTranslationSheet({
  canShowTranslationSheet,
  handleCloseTranslationSheet,
  handleTranslationActivated,
  showTranslationSheet,
}: ReaderTranslationSheetProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return canShowTranslationSheet ? (
    <Modal
      visible={showTranslationSheet}
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      animationType="slide"
      onRequestClose={handleCloseTranslationSheet}
    >
      <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={handleCloseTranslationSheet}
        />
        <View
          style={[
            styles.modalContent,
            { backgroundColor: colors.bibleSurface, borderColor: colors.bibleDivider },
          ]}
        >
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.biblePrimaryText }]}>
              {t('bible.selectTranslation')}
            </Text>
            <TouchableOpacity
              onPress={handleCloseTranslationSheet}
              accessibilityRole="button"
              accessibilityLabel={t('interface.close')}
            >
              <Ionicons name="close" size={22} color={colors.bibleSecondaryText} />
            </TouchableOpacity>
          </View>
          <TranslationPickerList
            onRequestClose={handleCloseTranslationSheet}
            onTranslationActivated={handleTranslationActivated}
          />
        </View>
      </View>
    </Modal>
  ) : null;
}
