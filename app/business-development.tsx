import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getUserSession } from '../core/session';
import { pushOrNewTab } from '../utils/ctrlClickNavigation';

type Tile = {
  label: string;
  description: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  permKey: string;
};

const TILES: Tile[] = [
  {
    label: 'Materials',
    description: 'Flyers, quote sheets and print-ready marketing material.',
    path: '/materials',
    icon: 'construct-outline',
    permKey: 'viewMaterials',
  },
  {
    label: 'Territory',
    description: 'Customer distribution map. Start and review canvassing and leafletting activities.',
    path: '/territory',
    icon: 'map-outline',
    permKey: 'viewTerritory',
  },
];

/**
 * Hub for growth tools. A team member sees whichever tiles their permissions allow;
 * the dashboard only shows the Business Development tile if at least one applies.
 */
export default function BusinessDevelopmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tiles, setTiles] = useState<Tile[] | null>(null);

  useEffect(() => {
    (async () => {
      const session = await getUserSession();
      if (!session) { setTiles([]); return; }
      setTiles(TILES.filter(t => session.isOwner || !!session.perms?.[t.permKey]));
    })();
  }, []);

  const open = (path: string) => {
    if (pushOrNewTab(path as any)) return;
    router.push(path as any);
  };

  const horizontalPadding = 20;
  const gap = 16;
  const maxContent = 640;
  const contentWidth = Math.min(width - horizontalPadding * 2, maxContent);
  const columns = contentWidth >= 420 ? 2 : 1;
  const tileSize = Math.floor((contentWidth - gap * (columns - 1)) / columns);

  return (
    <LinearGradient colors={['#0c1b3c', '#060d1f']} style={styles.background} locations={[0, 1]}>
      <View style={[styles.page, { paddingTop: insets.top + (Platform.OS === 'web' ? 16 : 8) }]}>
        <View style={[styles.header, { maxWidth: maxContent }]}>
          <Pressable onPress={() => router.replace('/')} style={styles.homeButton} accessibilityLabel="Home">
            <Ionicons name="home" size={22} color="#e8ecf8" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Business Development</Text>
            <Text style={styles.subtitle}>Tools for finding and winning new work.</Text>
          </View>
        </View>

        {tiles === null ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        ) : tiles.length === 0 ? (
          <Text style={styles.empty}>You don't have permission to view this page.</Text>
        ) : (
          <View style={[styles.grid, { maxWidth: maxContent, gap }]}>
            {tiles.map(t => (
              <Pressable
                key={t.label}
                style={({ pressed }) => [
                  styles.tile,
                  { width: tileSize, minHeight: Math.min(tileSize, 220), opacity: pressed ? 0.92 : 1 },
                ]}
                onPress={() => open(t.path)}
                android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              >
                <View style={styles.tileIconWrap}>
                  <Ionicons name={t.icon} size={32} color="#e8ecf8" />
                </View>
                <Text style={styles.tileLabel}>{t.label}</Text>
                <Text style={styles.tileDescription}>{t.description}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  // Web: the route's root does not always resolve a definite height, so pin to the viewport.
  background: { flex: 1, ...(Platform.OS === 'web' ? ({ minHeight: '100vh' } as any) : {}) },
  page: { flex: 1, paddingHorizontal: 20, alignItems: 'center' },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 24,
  },
  homeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  headerText: { flex: 1 },
  title: { color: '#f6f8ff', fontSize: 24, fontWeight: '700' },
  subtitle: { color: 'rgba(246,248,255,0.7)', fontSize: 13, marginTop: 2 },
  empty: { color: '#f6f8ff', marginTop: 40 },
  grid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  tile: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    ...Platform.select({
      web: { backdropFilter: 'blur(6px)' } as any,
      default: {},
    }),
  },
  tileIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  tileLabel: { color: '#f6f8ff', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  tileDescription: {
    color: 'rgba(246,248,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
