import { Text } from 'react-native';
import { useDisplayFont } from '../../../hooks/useDisplayFont';
import { DISPLAY_TEXT_MAX_FONT_SCALE } from '../../../design/largeTextLayout';
import { useResetPasswordStyles } from './resetPasswordStyles';

interface ResetHeadingProps {
  title: string;
  subtitle: string;
  /** Announce subtitle changes (the problem step's reason). */
  liveSubtitle?: boolean;
}

/** Each step's title and the line under it. */
export function ResetHeading({ title, subtitle, liveSubtitle = false }: ResetHeadingProps) {
  const styles = useResetPasswordStyles();
  const displayFont = useDisplayFont();

  return (
    <>
      <Text
        maxFontSizeMultiplier={DISPLAY_TEXT_MAX_FONT_SCALE}
        accessibilityRole="header"
        style={[styles.title, displayFont.bold]}
      >
        {title}
      </Text>
      <Text style={styles.subtitle} accessibilityLiveRegion={liveSubtitle ? 'polite' : undefined}>
        {subtitle}
      </Text>
    </>
  );
}
