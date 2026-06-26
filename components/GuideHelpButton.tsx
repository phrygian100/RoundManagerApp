import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, Platform, Pressable, StyleProp, ViewStyle } from 'react-native';

const GUIDES_BASE_URL = 'https://guvnor.app/guides';

type GuideHelpButtonProps = {
  /** Guide slug, e.g. "runsheet" — links to https://guvnor.app/guides/<slug> */
  slug: string;
  /** Icon colour (default suits dark headers). */
  color?: string;
  /** Icon size in px. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Accessibility label; defaults to a generic help label. */
  accessibilityLabel?: string;
};

/**
 * Small "?" help button that opens the matching online guide.
 *
 * Cross-platform: on web it opens the guide in a new tab so the app stays open;
 * on native it hands off to the system browser via Linking (matching the
 * existing home-screen Guides button).
 */
export function GuideHelpButton({
  slug,
  color = '#e8ecf8',
  size = 20,
  style,
  accessibilityLabel = 'Open help guide',
}: GuideHelpButtonProps) {
  const handlePress = () => {
    const url = `${GUIDES_BASE_URL}/${slug}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(url).catch(() => {});
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={style}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}
    >
      <Ionicons name="help-circle-outline" size={size} color={color} />
    </Pressable>
  );
}

export default GuideHelpButton;
