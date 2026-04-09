import React, { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { gatherArtworkXml } from '../../data/gatherArtwork';
import { getGatherArtworkZoom } from '../../data/gatherArtworkSizing';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface GatherIconBadgeProps {
  artworkKey?: string;
  iconName?: IoniconName;
  size: number;
  iconSize: number;
  backgroundColor?: string;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function GatherIconBadge({
  artworkKey,
  iconName,
  size,
  iconSize,
  backgroundColor,
  iconColor,
  style,
}: GatherIconBadgeProps) {
  const { colors } = useTheme();
  const resolvedColor = iconColor ?? colors.accentPrimary;
  const artworkXml = artworkKey ? gatherArtworkXml[artworkKey] : undefined;
  const containerBackground = backgroundColor;
  const artworkZoom = getGatherArtworkZoom(artworkKey);
  const artworkSize = artworkKey ? Math.max(iconSize, Math.round(size * 0.9)) : iconSize;
  const artworkBitmapUri = useMemo(() => {
    if (!artworkXml) {
      return null;
    }

    const match = artworkXml.match(/(?:xlink:href|href)="(data:image\/[^"]+)"/i);
    return match?.[1] ?? null;
  }, [artworkXml]);

  const themedArtworkXml = useMemo(() => {
    if (!artworkXml || artworkBitmapUri) {
      return null;
    }

    const rootMatch = artworkXml.match(/^<svg\b([^>]*)>([\s\S]*?)<\/svg>\s*$/);

    if (!rootMatch) {
      return artworkXml
        .replace(/fill="#(?:000000|000)"/g, `fill="${resolvedColor}"`)
        .replace(/stroke="#(?:000000|000)"/g, `stroke="${resolvedColor}"`);
    }

    const [, attributes, innerXml] = rootMatch;
    const widthMatch = attributes.match(/\bwidth="([^"]+)"/i);
    const heightMatch = attributes.match(/\bheight="([^"]+)"/i);
    const viewBoxMatch = attributes.match(/\bviewBox="([^"]+)"/i);
    const width = Number.parseFloat(widthMatch?.[1] ?? '200');
    const height = Number.parseFloat(heightMatch?.[1] ?? '200');
    const viewBox = viewBoxMatch?.[1] ?? `0 0 ${width} ${height}`;
    const [, minXString = '0', minYString = '0', viewBoxWidthString = String(width), viewBoxHeightString = String(height)] =
      viewBox.match(/(-?\d*\.?\d+(?:e[+-]?\d+)?)\s+(-?\d*\.?\d+(?:e[+-]?\d+)?)\s+(-?\d*\.?\d+(?:e[+-]?\d+)?)\s+(-?\d*\.?\d+(?:e[+-]?\d+)?)/i) ?? [];
    const minX = Number.parseFloat(minXString);
    const minY = Number.parseFloat(minYString);
    const viewBoxWidth = Number.parseFloat(viewBoxWidthString);
    const viewBoxHeight = Number.parseFloat(viewBoxHeightString);
    const centerX = minX + viewBoxWidth / 2;
    const centerY = minY + viewBoxHeight / 2;
    const transformedInnerXml =
      artworkZoom === 1
        ? innerXml
        : `<g transform="translate(${centerX} ${centerY}) scale(${artworkZoom}) translate(${-centerX} ${-centerY})">${innerXml}</g>`;

    const rootAttributes = attributes
      .replace(/\swidth="[^"]*"/i, '')
      .replace(/\sheight="[^"]*"/i, '')
      .replace(/\sviewBox="[^"]*"/i, '')
      .trim();

    return `<svg viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet"${
      rootAttributes ? ` ${rootAttributes}` : ''
    }>${transformedInnerXml}</svg>`
      .replace(/fill="#(?:000000|000)"/g, `fill="${resolvedColor}"`)
      .replace(/stroke="#(?:000000|000)"/g, `stroke="${resolvedColor}"`);
  }, [artworkBitmapUri, artworkXml, artworkZoom, resolvedColor]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
        containerBackground
          ? {
              borderRadius: size / 2,
              backgroundColor: containerBackground,
            }
          : null,
        style,
      ]}
    >
      {artworkBitmapUri ? (
        <Image
          source={{ uri: artworkBitmapUri }}
          style={{
            width: artworkSize,
            height: artworkSize,
            transform: [{ scale: artworkZoom }],
            tintColor: resolvedColor,
          }}
          resizeMode="contain"
        />
      ) : themedArtworkXml ? (
        <SvgXml xml={themedArtworkXml} width={artworkSize} height={artworkSize} />
      ) : (
        <Ionicons name={iconName ?? 'book-outline'} size={iconSize} color={resolvedColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
});
