import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { FieldInfo } from '../../types/course';

interface FieldCardProps {
  field: FieldInfo;
  progress: number;
  isUnlocked: boolean;
  isCurrent: boolean;
  onPress: () => void;
}

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  // Legacy icons
  search: 'search',
  broadcast: 'megaphone',
  'book-open': 'book',
  users: 'people',
  'git-branch': 'git-network',
  // New professional icons
  compass: 'compass-outline',
  heart: 'heart-outline',
  footsteps: 'footsteps-outline',
  'people-circle': 'people-circle-outline',
  layers: 'layers-outline',
};

// Tibetan-inspired color palette with gradients
const fieldGradients: Record<string, [string, string, string]> = {
  '#8B2635': ['#A83D4D', '#8B2635', '#6E1D29'], // Tibetan Maroon - monastic discipline
  '#D4A017': ['#E5B82E', '#D4A017', '#B38A12'], // Saffron Gold - sacred teachings
  '#4A90E2': ['#6AAAF5', '#4A90E2', '#3A75BA'], // Sky Blue - Himalayan clarity
};

export function FieldCard({
  field,
  progress,
  isCurrent,
  onPress,
}: FieldCardProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const iconName = iconMap[field.icon] || 'ellipse';

  // Animation values
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [glowAnim] = useState(() => new Animated.Value(0));
  const [progressAnim] = useState(() => new Animated.Value(0));

  // Get gradient colors for this field
  const gradientColors = fieldGradients[field.color] || [field.color, field.color, field.color];

  useEffect(() => {
    // Animate progress on mount/change
    Animated.spring(progressAnim, {
      toValue: progress,
      useNativeDriver: false,
      tension: 40,
      friction: 8,
    }).start();

    // Pulse animation for current field
    if (isCurrent) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      ).start();
    }
  }, [glowAnim, isCurrent, progress, progressAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.96,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  // Calculate progress ring segments (8 segments)
  const segments = 8;
  const filledSegments = Math.round((progress / 100) * segments);

  // Status display
  const getStatusConfig = () => {
    if (progress === 100) return { text: t('common.done'), color: colors.success };
    if (progress === 0) return { text: t('harvest.begin'), color: colors.secondaryText };
    return { text: `${progress}%`, color: field.color };
  };
  const statusConfig = getStatusConfig();

  // Animated glow opacity for current card
  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={styles.touchable}
      >
        {/* Card container */}
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.cardBackground,
              borderColor: isCurrent ? field.color + '60' : colors.cardBorder + '40',
            },
          ]}
        >
          {/* Glassmorphism overlay */}
          <View style={styles.glassOverlay}>
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.08)',
                'rgba(255,255,255,0.02)',
                'rgba(0,0,0,0.05)',
              ]}
              style={styles.glassGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </View>

          {/* Accent glow at top */}
          <View style={styles.accentGlowContainer}>
            <LinearGradient
              colors={[field.color + '40', field.color + '10', 'transparent']}
              style={styles.accentGlow}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            />
          </View>

          {/* Current indicator - animated glow */}
          {isCurrent && (
            <Animated.View
              style={[
                styles.currentGlow,
                {
                  backgroundColor: field.color,
                  opacity: glowOpacity,
                },
              ]}
            />
          )}

          {/* Progress Ring Container */}
          <View style={styles.progressRingContainer}>
            {/* Background ring segments */}
            <View style={styles.ringSegments}>
              {Array.from({ length: segments }).map((_, i) => {
                const rotation = (i * 360) / segments - 90;
                const isFilled = i < filledSegments;
                const isComplete = progress === 100;

                return (
                  <View
                    key={i}
                    style={[
                      styles.segment,
                      {
                        transform: [
                          { rotate: `${rotation}deg` },
                          { translateY: -32 },
                        ],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.segmentDot,
                        {
                          backgroundColor: isFilled
                            ? isComplete
                              ? colors.success
                              : field.color
                            : colors.cardBorder,
                          shadowColor: isFilled ? field.color : 'transparent',
                          shadowOpacity: isFilled ? 0.8 : 0,
                          shadowRadius: isFilled ? 4 : 0,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>

            {/* Icon container with gradient background */}
            <View style={styles.iconOuterRing}>
              <LinearGradient
                colors={[gradientColors[0] + '30', gradientColors[2] + '10']}
                style={styles.iconGradientRing}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={[styles.iconInnerCircle, { backgroundColor: colors.cardBackground }]}>
                  <LinearGradient
                    colors={[gradientColors[0], gradientColors[1], gradientColors[2]]}
                    style={styles.iconGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  >
                    <Ionicons name={iconName} size={24} color="#fff" />
                  </LinearGradient>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Text content */}
          <View style={styles.textContainer}>
            <Text style={[styles.title, { color: colors.primaryText }]}>
              {field.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              {field.subtitle}
            </Text>
          </View>

          {/* Status indicator */}
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: statusConfig.color + '20',
                  borderColor: statusConfig.color + '40',
                },
              ]}
            >
              {progress === 100 && (
                <Ionicons
                  name="checkmark-circle"
                  size={12}
                  color={colors.success}
                  style={styles.statusIcon}
                />
              )}
              <Text style={[styles.statusText, { color: statusConfig.color }]}>
                {statusConfig.text}
              </Text>
            </View>
          </View>

          {/* Bottom progress accent line */}
          <View style={styles.bottomAccent}>
            <View
              style={[
                styles.bottomAccentFill,
                {
                  width: `${progress}%`,
                  backgroundColor: progress === 100 ? colors.success : field.color,
                },
              ]}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchable: {
    marginRight: 14,
  },
  container: {
    width: 140,
    height: 195,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 24,
  },
  glassGradient: {
    flex: 1,
  },
  accentGlowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  accentGlow: {
    flex: 1,
  },
  currentGlow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 100,
    borderRadius: 50,
  },
  progressRingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 90,
    marginTop: 12,
  },
  ringSegments: {
    width: 72,
    height: 72,
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segment: {
    position: 'absolute',
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  iconOuterRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  iconGradientRing: {
    flex: 1,
    padding: 3,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    opacity: 0.7,
  },
  statusContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusIcon: {
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bottomAccent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  bottomAccentFill: {
    height: '100%',
    borderRadius: 2,
  },
});
