import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, config } from '../../constants';

export function AboutScreen() {
  const navigation = useNavigation();
  const { t } = useTranslation();

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  appSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  appIcon: {
    width: 100,
    height: 100,
    borderRadius: 24,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: colors.secondaryText,
  },
  descriptionCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  description: {
    fontSize: 16,
    color: colors.primaryText,
    lineHeight: 24,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondaryText,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  infoLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primaryText,
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 14,
    color: colors.secondaryText,
    lineHeight: 20,
  },
  linksCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 24,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  linkItemLast: {
    borderBottomWidth: 0,
  },
  linkText: {
    flex: 1,
    fontSize: 16,
    color: colors.primaryText,
    marginLeft: 12,
  },
  copyright: {
    fontSize: 12,
    color: colors.secondaryText,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
