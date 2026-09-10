import { useEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useTheme } from '../../contexts/ThemeContext';
import { layout, radius, spacing } from '../../design/system';
import type { LocaleSetupGroupPosition } from './localeSetupListModel';

// FlashList rather than FlatList: it is already a dependency here (with the
// Proguard keep rule Android needs), it is the pattern the rebuilt translation
// picker uses for exactly this "grouped card look inside a virtualized list"
// problem, and its cell recycling keeps the mounted-view count flat while the
// Bible-language catalog runs to hundreds of rows. Nothing on this screen needs
// sticky headers, and the rows are near-uniform in height, so estimatedItemSize
// is easy to get right — the two things that would have argued for FlatList.
const LOCALE_SETUP_ESTIMATED_ITEM_SIZE = 64;

export interface LocaleSetupListItemBase {
  id: string;
  type: string;
}

// Stable module-level accessors: FlashList keys rows by a real id (never the
// index, which would break recycling as the search filter reorders results) and
// pools recycled cells per item type.
const keyExtractor = (item: LocaleSetupListItemBase): string => item.id;
const getItemType = (item: LocaleSetupListItemBase): string => item.type;

interface LocaleSetupListProps<TItem extends LocaleSetupListItemBase> {
  data: TItem[];
  renderItem: ListRenderItem<TItem>;
  /**
   * Hero copy, the app-language control and the search field.
   *
   * These live in the header rather than in `data` for one reason: the search
   * TextInput must never unmount while the user types. Items in `data` are
   * recycled cells, and the header is not — FlashList re-renders it in place, so
   * the input keeps focus and the keyboard stays up while the results below
   * re-filter. Pass an ELEMENT of a stable component (not an inline function
   * component), or React will remount the header on every render and steal
   * focus anyway.
   */
  header: ReactElement;
  /** footerHeight + keyboardOffset + spacing.xxl, as the ScrollView had. */
  contentPaddingBottom: number;
  /** Everything the rows read that does not live in `data` (selection, theme…). */
  extraData: unknown;
  /** Changing this value scrolls the list back to the top. */
  scrollResetKey: string;
}

export function LocaleSetupList<TItem extends LocaleSetupListItemBase>({
  data,
  renderItem,
  header,
  contentPaddingBottom,
  extraData,
  scrollResetKey,
}: LocaleSetupListProps<TItem>) {
  const listRef = useRef<FlashList<TItem>>(null);
  const lastScrollResetKey = useRef(scrollResetKey);

  // A new step, or a new search query, means a different list — showing the
  // reader whatever row happened to occupy their scroll offset would be noise.
  useEffect(() => {
    if (lastScrollResetKey.current === scrollResetKey) {
      return;
    }

    lastScrollResetKey.current = scrollResetKey;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [scrollResetKey]);

  // FlashList wants a plain ContentStyle object, not a StyleSheet reference.
  const contentContainerStyle = useMemo(
    () => ({
      paddingHorizontal: layout.screenPadding,
      paddingTop: spacing.md,
      paddingBottom: contentPaddingBottom,
    }),
    [contentPaddingBottom]
  );

  return (
    <FlashList
      ref={listRef}
      style={styles.list}
      data={data}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      estimatedItemSize={LOCALE_SETUP_ESTIMATED_ITEM_SIZE}
      ListHeaderComponent={header}
      contentContainerStyle={contentContainerStyle}
      extraData={extraData}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  );
}

interface GroupedRowCardProps {
  position: LocaleSetupGroupPosition;
  children: ReactNode;
}

// One row's worth of the AppCard surface. A virtualized group cannot be wrapped
// in a single AppCard any more, so each row draws the slice of the card it owns:
// the side hairlines always, the top edge (and its radius plus the paper edge
// light) on `first`/`only`, the bottom edge and radius on `last`/`only`. The
// hairline separator between rows still comes from the row itself via `isLast`.
//
// Deliberately no `shadows.card`: a per-row shadow would draw at every internal
// seam instead of only around the group, and paying an Android `elevation` on
// every recycled cell would work against the reason this list is virtualized at
// all. This matches how TranslationPickerList draws its grouped rows.
export function GroupedRowCard({ position, children }: GroupedRowCardProps) {
  const { colors, isDark } = useTheme();
  const drawsTopEdge = position === 'first' || position === 'only';

  return (
    <View
      style={[
        styles.groupedRow,
        groupedRowEdges[position],
        { backgroundColor: colors.cardBackground, borderColor: colors.cardBorder },
      ]}
    >
      {drawsTopEdge ? (
        <View
          pointerEvents="none"
          style={[
            styles.edgeLight,
            { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.7)' },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  groupedRow: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  // Same geometry as AppCard's edge light: inset by the hairline border so the
  // light sits inside it, and rounded on its own corners so it follows the card
  // radius without `overflow: 'hidden'`.
  edgeLight: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    height: StyleSheet.hairlineWidth * 2,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
});

const groupedRowEdges = StyleSheet.create({
  only: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRadius: radius.lg,
  },
  first: {
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  middle: {
    // Middle rows contribute no horizontal edge — the group's top and bottom
    // borders belong to the first and last rows.
  },
  last: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
});
