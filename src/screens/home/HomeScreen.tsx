import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { RootTabParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootTabParamList>;

export function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('home.goodMorning');
    if (hour < 17) return t('home.goodAfternoon');
    return t('home.goodEvening');
  };

  const handleOpenCreationToChrist = () => {
    navigation.navigate('Learn', { screen: 'CourseList' });
  };

  const heroGradientColors = isDark
    ? (['#25181b', '#181b21', '#111316'] as const)
    : (['#fff6ea', '#f6ede1', '#efe2d2'] as const);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={[styles.greeting, { color: colors.primaryText }]}>{getGreeting()}</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          {t('home.creationToChristHomeSubtitle', {
            defaultValue: 'Your path is now focused on one guided playlist.',
          })}
        </Text>

        <LinearGradient
          colors={heroGradientColors}
          style={[styles.heroCard, { borderColor: colors.cardBorder }]}
        >
          <View style={styles.heroTopRow}>
            <View style={[styles.heroIcon, { backgroundColor: colors.accentPrimary + '14' }]}>
              <Ionicons name="planet-outline" size={24} color={colors.accentPrimary} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroEyebrow, { color: colors.accentSecondary }]}>
                {t('harvest.chapterPlaylistEyebrow', { defaultValue: 'Chapter Playlist' })}
              </Text>
              <Text style={[styles.heroTitle, { color: colors.primaryText }]}>
                {t('harvest.creationToChristTitle', { defaultValue: 'Creation to Christ' })}
              </Text>
              <Text style={[styles.heroBody, { color: colors.secondaryText }]}>
                {t('home.creationToChristHomeBody', {
                  defaultValue:
                    'Read and listen through the full story in order, chapter by chapter.',
                })}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.heroButton, { backgroundColor: colors.accentPrimary }]}
            onPress={handleOpenCreationToChrist}
            activeOpacity={0.9}
          >
            <Text style={styles.heroButtonText}>
              {t('home.openCreationToChrist', { defaultValue: 'Open Creation to Christ' })}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 14,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 8,
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCopy: {
    flex: 1,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  heroButton: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
