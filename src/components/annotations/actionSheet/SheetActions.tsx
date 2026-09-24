import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing } from '../../../design/system';
import { ActionPill } from './ActionPill';
import { HIGHLIGHT_COLORS, PRESSED_SCALE } from './annotationActionSheetModel';

interface SheetActionsProps {
  canAnnotate: boolean;
  isSaving: boolean;
  activeHighlightColors: string[];
  onToggleHighlight: (color: string, isActive: boolean) => void;
  onOpenNote: () => void;
  onCopy: () => void;
  onShare: () => void;
  onShareImage: () => void;
  onShareAudio: () => void;
}

/**
 * The sheet's actions panel: the five highlight colours (an applied one shows an X
 * and removes itself) above the rail of verse actions. Scrolls when it outgrows
 * the sheet at large text.
 */
export function SheetActions({
  canAnnotate,
  isSaving,
  activeHighlightColors,
  onToggleHighlight,
  onOpenNote,
  onCopy,
  onShare,
  onShareImage,
  onShareAudio,
}: SheetActionsProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const activeHighlightColorSet = new Set(activeHighlightColors);

  return (
    <ScrollView
      style={styles.body}
      contentContainerStyle={styles.actionsContainer}
      // A tap on a pill should press it, not only dismiss a keyboard.
      keyboardShouldPersistTaps="handled"
      alwaysBounceVertical={false}
    >
      <View style={styles.selectionControlsRow}>
        <View style={styles.highlightRow}>
          {HIGHLIGHT_COLORS.map((color) => {
            const isActive = activeHighlightColorSet.has(color.hex);

            return (
              <Pressable
                key={color.id}
                accessibilityLabel={t(`annotations.colors.${color.id}`)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive, disabled: !canAnnotate }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.colorDot,
                  {
                    backgroundColor: color.hex,
                    borderColor: isActive ? colors.biblePrimaryText : 'transparent',
                    opacity: canAnnotate ? 1 : 0.46,
                    transform: [{ scale: pressed && canAnnotate ? PRESSED_SCALE : 1 }],
                  },
                ]}
                onPress={() => {
                  if (!canAnnotate) {
                    return;
                  }

                  onToggleHighlight(color.hex, isActive);
                }}
                disabled={!canAnnotate}
              >
                {isActive ? (
                  <View style={styles.colorDotRemoveOverlay} pointerEvents="none">
                    <Ionicons name="close" size={13} color={colors.bibleSurface} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actionButtonRail}>
          <ActionPill
            icon="create-outline"
            label={t('annotations.note')}
            onPress={onOpenNote}
            disabled={!canAnnotate || isSaving}
          />
          <ActionPill icon="copy-outline" label={t('annotations.copy')} onPress={onCopy} />
          <ActionPill icon="share-social-outline" label={t('groups.share')} onPress={onShare} />
          <ActionPill
            icon="image-outline"
            label={t('bible.shareVerseImage')}
            onPress={onShareImage}
          />
          <ActionPill
            icon="headset-outline"
            label={t('bible.shareChapterAudio')}
            onPress={onShareAudio}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 0,
    flexShrink: 1,
  },
  actionsContainer: {
    gap: spacing.md,
  },
  selectionControlsRow: {
    flexDirection: 'column',
    gap: 10,
    minWidth: 0,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  colorDot: {
    position: 'relative',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  colorDotRemoveOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 8,
  },
});
