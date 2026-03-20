import { NavigationContainer } from '@react-navigation/native';
import { TabNavigator } from './TabNavigator';
import { useTheme } from '../contexts/ThemeContext';
import { flushQueuedAuthFlow, rootNavigationRef } from './rootNavigation';
import { useAudioStore } from '../stores/audioStore';

export function RootNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      onReady={flushQueuedAuthFlow}
      theme={{
        dark: isDark,
        colors: {
          primary: colors.tabActive,
          background: colors.background,
          card: colors.cardBackground,
          text: colors.primaryText,
          border: colors.cardBorder,
          notification: colors.accentGreen,
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <TabNavigator />
      <MiniPlayerHost />
    </NavigationContainer>
  );
}

function MiniPlayerHost() {
  const hasPlayableSession = useAudioStore((state) =>
    Boolean(
      (state.currentBookId && state.currentChapter) ||
        (state.lastPlayedBookId && state.lastPlayedChapter)
    )
  );

  if (!hasPlayableSession) {
    return null;
  }

  const { MiniPlayer } = require('../components/audio/MiniPlayer') as typeof import('../components/audio/MiniPlayer');

  return <MiniPlayer />;
}
