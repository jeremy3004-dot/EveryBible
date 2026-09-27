import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../contexts/ThemeContext';
import { spacing } from '../../../design/system';
import { ActionPill } from './ActionPill';
import { HIGHLIGHT_COLORS } from './annotationActionSheetModel';
import { COLOR_DOT_GROWTH, ColorDot } from './ColorDot';

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
 * The sheet's actions panel: the five highlight colours spread edge to edge (an
 * applied one shows a check and removes itself) above a hairline and the rail of
 * verse actions. Scrolls when it outgrows the sheet at large text.
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
              <ColorDot
                key={color.id}
                color={color.hex}
                label={t(`annotations.colors.${color.id}`)}
                isActive={isActive}
                canAnnotate={canAnnotate}
                onPress={() => {
                  if (canAnnotate) {
                    onToggleHighlight(color.hex, isActive);
                  }
                }}
              />
            );
          })}
        </View>

        <View style={[styles.actionButtonRail, { borderTopColor: colors.bibleDivider }]}>
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
            label={t('annotations.audio')}
            accessibilityLabel={t('bible.shareChapterAudio')}
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
    gap: spacing.lg,
    minWidth: 0,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Room for an applied colour to grow: the scroll view clips at its edges, and
    // the end dots sit right against them.
    paddingVertical: spacing.xs,
    paddingHorizontal: COLOR_DOT_GROWTH,
  },
  actionButtonRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
});
