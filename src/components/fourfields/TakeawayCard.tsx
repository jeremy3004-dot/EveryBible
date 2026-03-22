import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { radius } from '../../design/system';

interface TakeawayCardProps {
  text: string;
  lessonTitle?: string;
}

export function TakeawayCard({ text, lessonTitle }: TakeawayCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const handleShare = async () => {
    try {
      const message = lessonTitle
        ? `"${text}"\n\n- From "${lessonTitle}" in the Four Fields discipleship journey`
        : `"${text}"\n\n- From the Four Fields discipleship journey`;

      await Share.share({
        message,
      });
    } catch {
      // User cancelled or error
    }
  };

  return (
    <View style={[styles.container, {
      backgroundColor: colors.accentSecondary + '10',
      borderColor: colors.accentSecondary + '30',
    }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: colors.accentSecondary + '20' }]}>
          <Ionicons name="bulb-outline" size={20} color={colors.accentSecondary} />
        </View>
        <Text style={[styles.label, { color: colors.accentSecondary }]}>
          {t('harvest.keyTakeaway')}
        </Text>
      </View>

      <Text style={[styles.text, { color: colors.primaryText }]}>{text}</Text>

      <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
        <Ionicons name="share-outline" size={18} color={colors.accentPrimary} />
        <Text style={[styles.shareText, { color: colors.accentPrimary }]}>
          {t('harvest.shareTakeaway')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    padding: 20,
    marginVertical: 16,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '500',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
    alignSelf: 'flex-start',
  },
  shareText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
