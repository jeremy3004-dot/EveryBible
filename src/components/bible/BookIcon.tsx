import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getBookIcon } from '../../constants/bookIcons';
import { useTheme } from '../../contexts/ThemeContext';

interface BookIconProps {
  bookId: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

/** Decorative artwork: the adjacent translated book name supplies its label. */
export const BookIcon = memo(function BookIcon({ bookId, size = 40, color, style }: BookIconProps) {
  const { colors } = useTheme();
  const icon = getBookIcon(bookId);
  if (!icon) return null;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Svg width="100%" height="100%" viewBox={icon.viewBox}>
        {icon.paths.map((d, index) => (
          <Path key={index} d={d} fill={color ?? colors.biblePrimaryText} fillRule="evenodd" />
        ))}
      </Svg>
    </View>
  );
});
