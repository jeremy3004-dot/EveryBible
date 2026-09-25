import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import type { MoreStackParamList } from '../../navigation/types';
import {
  config,
  EVERYBIBLE_PRIVACY_URL,
  EVERYBIBLE_SITE_URL,
  EVERYBIBLE_SUPPORT_EMAIL,
  EVERYBIBLE_SUPPORT_EMAIL_URL,
  EVERYBIBLE_TERMS_URL,
} from '../../constants';
import { radius, layout, spacing, typography } from '../../design/system';
import { useTabBarHeight } from '../../hooks/useTabBarHeight';
import { BACKGROUND_MUSIC_OPTIONS } from '../../services/audio/backgroundMusicCatalog';

const ABOUT_WEBSITE_LABEL = 'everybible.app';
const ABOUT_APP_ICON = require('../../../assets/icon.png');
// The bundled listen-mode tracks. Sitar's CC-BY 3.0 license requires this credit in the app;
// the CC0 works are credited as a courtesy.
const MUSIC_CREDITS = BACKGROUND_MUSIC_OPTIONS.filter((option) => option.id !== 'off');

type NavigationProp = NativeStackNavigationProp<MoreStackParamList, 'About'>;

export function AboutScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  // About sits inside the tab navigator, so the last row has to clear the
  // floating capsule (and, on Android edge-to-edge, the navigation bar under it).
  const { contentClearance } = useTabBarHeight();

  const handleLink = (url: string) => {
    // With no mail app (or browser) the open rejects. Show where the link points, so the
    // reader can still write to support or visit the page another way.
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.somethingWentWrong'), url.replace(/^mailto:/, ''));
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>
          {t('about.title')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: contentClearance }]}
      >
        {/* App Logo/Title */}
        <View style={styles.appSection}>
          <View style={styles.appIcon}>
            <Image
              source={ABOUT_APP_ICON}
              style={styles.appIconImage}
              resizeMode="cover"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            />
          </View>
          <Text style={styles.appName}>{config.appName}</Text>
          <Text style={styles.appVersion}>{t('about.version', { version: config.version })}</Text>
        </View>

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.description}>{t('about.description')}</Text>
        </View>
        {/* Links */}
        <Text style={styles.sectionTitle}>{t('about.resources')}</Text>
        <View style={styles.linksCard}>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleLink(EVERYBIBLE_SITE_URL)}
            accessibilityRole="link"
          >
            <Ionicons name="globe-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{ABOUT_WEBSITE_LABEL}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleLink(EVERYBIBLE_SUPPORT_EMAIL_URL)}
            accessibilityRole="link"
          >
            <Ionicons name="mail-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{EVERYBIBLE_SUPPORT_EMAIL}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleLink(EVERYBIBLE_PRIVACY_URL)}
            accessibilityRole="link"
          >
            <Ionicons name="shield-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{t('about.privacyPolicy')}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkItem, styles.linkItemLast]}
            onPress={() => handleLink(EVERYBIBLE_TERMS_URL)}
            accessibilityRole="link"
          >
            <Ionicons name="document-text-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{t('about.termsOfService')}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Background music credits */}
        <Text style={styles.sectionTitle}>{t('audio.musicAndSounds')}</Text>
        <View style={styles.linksCard}>
          {MUSIC_CREDITS.map((track, index) => {
            const label = t(`interface.music.${track.id}.label`);
            const credit = t('about.musicCredit', {
              title: track.workTitle,
              author: track.credit,
              license: track.license,
            });
            return (
              <TouchableOpacity
                key={track.id}
                style={[styles.linkItem, index === MUSIC_CREDITS.length - 1 && styles.linkItemLast]}
                onPress={() => handleLink(track.sourceUrl)}
                accessibilityRole="link"
                accessibilityLabel={`${label}, ${credit}`}
              >
                <Ionicons name="musical-notes-outline" size={24} color={colors.secondaryText} />
                <View style={styles.creditText}>
                  <Text style={styles.creditLabel}>{label}</Text>
                  <Text style={styles.creditDetail}>{credit}</Text>
                </View>
                <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.copyright}>{t('about.madeWithLove')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    backButton: {
      padding: spacing.xs,
    },
    headerTitle: {
      ...typography.cardTitle,
      color: colors.primaryText,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      padding: layout.screenPadding,
    },
    appSection: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    appIcon: {
      width: 100,
      height: 100,
      borderRadius: radius.lg,
      backgroundColor: colors.cardBackground,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      overflow: 'hidden',
    },
    appIconImage: {
      width: '100%',
      height: '100%',
    },
    appName: {
      ...typography.sectionTitle,
      color: colors.primaryText,
      marginBottom: spacing.xs,
    },
    appVersion: {
      ...typography.body,
      color: colors.secondaryText,
    },
    descriptionCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    description: {
      ...typography.body,
      color: colors.primaryText,
      textAlign: 'center',
    },
    sectionTitle: {
      ...typography.label,
      color: colors.secondaryText,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },
    linksCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      marginBottom: spacing.xl,
    },
    linkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.cardBorder,
    },
    linkItemLast: {
      borderBottomWidth: 0,
    },
    linkText: {
      flex: 1,
      ...typography.body,
      color: colors.primaryText,
      marginLeft: spacing.md,
    },
    creditText: {
      flex: 1,
      marginLeft: spacing.md,
    },
    creditLabel: {
      ...typography.body,
      color: colors.primaryText,
    },
    creditDetail: {
      ...typography.micro,
      color: colors.secondaryText,
      marginTop: spacing.xs,
    },
    copyright: {
      ...typography.micro,
      color: colors.secondaryText,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
