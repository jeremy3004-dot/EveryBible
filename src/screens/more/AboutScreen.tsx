import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeColors } from '../../contexts/ThemeContext';
import { config } from '../../constants';
import { radius, layout, spacing, typography } from '../../design/system';

export function AboutScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const handleLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.primaryText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('about.title')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* App Logo/Title */}
        <View style={styles.appSection}>
          <View style={styles.appIcon}>
            <Ionicons name="book" size={48} color={colors.accentGreen} />
          </View>
          <Text style={styles.appName}>{config.appName}</Text>
          <Text style={styles.appVersion}>{t('about.version', { version: config.version })}</Text>
        </View>

        {/* Description */}
        <View style={styles.descriptionCard}>
          <Text style={styles.description}>
            {t('about.description')}
          </Text>
        </View>

        {/* Bible Info */}
        <Text style={styles.sectionTitle}>{t('about.bibleTranslation')}</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>{t('about.bsbTitle')}</Text>
          <Text style={styles.infoDescription}>
            {t('about.bsbDescription')}
          </Text>
        </View>

        {/* Links */}
        <Text style={styles.sectionTitle}>{t('about.resources')}</Text>
        <View style={styles.linksCard}>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleLink('https://berean.bible')}
          >
            <Ionicons name="globe-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{t('about.bereanWebsite')}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleLink('mailto:support@everybible.app')}
          >
            <Ionicons name="mail-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{t('about.contactSupport')}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => handleLink('https://everybible.app/privacy')}
          >
            <Ionicons name="shield-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{t('about.privacyPolicy')}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.linkItem, styles.linkItemLast]}
            onPress={() => handleLink('https://everybible.app/terms')}
          >
            <Ionicons name="document-text-outline" size={24} color={colors.secondaryText} />
            <Text style={styles.linkText}>{t('about.termsOfService')}</Text>
            <Ionicons name="open-outline" size={20} color={colors.secondaryText} />
          </TouchableOpacity>
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
      padding: layout.screenPadding,
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
    infoCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: radius.lg,
      padding: layout.cardPadding,
      marginBottom: spacing.xl,
      borderWidth: 1,
      borderColor: colors.cardBorder,
    },
    infoLabel: {
      ...typography.cardTitle,
      color: colors.primaryText,
      marginBottom: spacing.sm,
    },
    infoDescription: {
      ...typography.label,
      color: colors.secondaryText,
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
    copyright: {
      ...typography.micro,
      color: colors.secondaryText,
      textAlign: 'center',
      fontStyle: 'italic',
    },
  });
