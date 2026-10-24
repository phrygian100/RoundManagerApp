import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import PermissionGate from '../components/PermissionGate';
import StartActivityModal, { type StartActivityResult } from '../components/StartActivityModal';
import TerritoryMapView, {
  type TerritoryActivityLayer,
  type TerritoryMapState,
} from '../components/TerritoryMapView';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getCurrentUserId, getDataOwnerId, getUserSession } from '../core/session';
import { acquireKeepAwake, type Fix, watchFixes } from '../services/locationTracker';
import {
  ACTIVITY_COLOURS,
  FLUSH_INTERVAL_MS,
  MAX_ACCURACY_METERS,
  MIN_POINT_SPACING_METERS,
  type TerritoryActivity,
  type TrackPoint,
  type VisitedAddress,
  clientDisplayAddress,
  clientHasPin,
  createActivity,
  deleteActivity,
  findMyActiveActivity,
  findNearbyClients,
  formatDistance,
  formatDuration,
  haversineMeters,
  listActivities,
  saveActivityProgress,
} from '../services/territoryService';
import type { Client } from '../types/client';

type DateFilter = 'today' | 'yesterday' | '7d' | '30d' | 'all';
const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'all', label: 'All' },
];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (n: number) => {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
};
const rangeFor = (f: DateFilter): { fromIso?: string; toIso?: string } => {
  switch (f) {
    case 'today': return { fromIso: daysAgo(0).toISOString() };
    case 'yesterday': return { fromIso: daysAgo(1).toISOString(), toIso: daysAgo(0).toISOString() };
    case '7d': return { fromIso: daysAgo(6).toISOString() };
    case '30d': return { fromIso: daysAgo(29).toISOString() };
    default: return {};
  }
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const confirmAsync = async (title: string, message: string): Promise<boolean> => {
  if (Platform.OS === 'web') return window.confirm(`${title}\n\n${message}`);
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
};

const fmtActivityWhen = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

const shortUser = (label: string) => (label.includes('@') ? label.split('@')[0] : label);

/** Mutable tracking session kept in a ref so GPS callbacks never see stale state. */
type Track = {
  activity: TerritoryActivity;
  points: TrackPoint[];
  visited: VisitedAddress[];
  visitedSet: Set<string>;
  distance: number;
  lastPoint: TrackPoint | null;
  dirty: boolean;
};

/** Snapshot of the track for rendering. */
type LiveView = {
  activityId: string;
  colour: string;
  startedAt: string;
  typeLabel: string;
  fix: Fix | null;
  points: { lat: number; lng: number }[];
  visited: Record<string, string>;
  visitedCount: number;
  distance: number;
  saving: boolean;
  error: string | null;
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function TerritoryContent() {
  const router = useRouter();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const [clients, setClients] = useState<Client[]>([]);
  const clientsRef = useRef<Client[]>([]);
  const [activities, setActivities] = useState<TerritoryActivity[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>('30d');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [showList, setShowList] = useState(false);
  const [canDeleteAny, setCanDeleteAny] = useState(false);
  const myUid = getCurrentUserId();

  const [modalOpen, setModalOpen] = useState(false);
  const [live, setLive] = useState<LiveView | null>(null);
  const [staleActive, setStaleActive] = useState<TerritoryActivity | null>(null);
  const trackRef = useRef<Track | null>(null);
  const stopWatchRef = useRef<(() => void) | null>(null);
  const flushTimerRef = useRef<any>(null);
  const releaseWakeRef = useRef<(() => void) | null>(null);
  const [, forceTick] = useState(0);

  // ----- Data loading -----
  useEffect(() => {
    (async () => {
      try {
        const [ownerId, session] = await Promise.all([getDataOwnerId(), getUserSession()]);
        setCanDeleteAny(!!session?.isOwner);
        if (!ownerId) return;
        const snap = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
        const active = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Client))
          .filter(c => c.status !== 'ex-client');
        clientsRef.current = active;
        setClients(active);
      } catch (e) {
        console.error('Territory: failed to load clients', e);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, []);

  const reloadActivities = useCallback(async (filter: DateFilter) => {
    setLoadingActivities(true);
    try {
      const list = await listActivities(rangeFor(filter));
      setActivities(list);
    } catch (e) {
      console.error('Territory: failed to load activities', e);
    } finally {
      setLoadingActivities(false);
    }
  }, []);

  useEffect(() => {
    reloadActivities(dateFilter);
  }, [dateFilter, reloadActivities]);

  // Left-running activity from an earlier session (page closed mid-walk)?
  useEffect(() => {
    findMyActiveActivity().then(a => { if (a) setStaleActive(a); }).catch(() => {});
  }, []);

  // Tick once a minute so the duration readout moves.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, [live]);

  // Warn before closing the tab while tracking (web only).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (e: BeforeUnloadEvent) => {
      if (trackRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ----- Tracking -----
  const snapshotLive = useCallback((fix: Fix | null, extra?: Partial<LiveView>) => {
    const t = trackRef.current;
    if (!t) { setLive(null); return; }
    const visited: Record<string, string> = {};
    for (const v of t.visited) visited[v.clientId] = v.at;
    setLive(prev => ({
      activityId: t.activity.id,
      colour: ACTIVITY_COLOURS[t.activity.type],
      startedAt: t.activity.startedAt,
      typeLabel: t.activity.typeLabel,
      fix: fix ?? prev?.fix ?? null,
      points: t.points.map(p => ({ lat: p.lat, lng: p.lng })),
      visited,
      visitedCount: t.visited.length,
      distance: t.distance,
      saving: prev?.saving ?? false,
      error: prev?.error ?? null,
      ...extra,
    }));
  }, []);

  const flush = useCallback(async (finish: boolean) => {
    const t = trackRef.current;
    if (!t) return;
    if (!t.dirty && !finish) return;
    t.dirty = false;
    setLive(prev => (prev ? { ...prev, saving: true } : prev));
    try {
      await saveActivityProgress(t.activity.id, {
        points: t.points,
        visited: t.visited,
        distanceMeters: t.distance,
      }, finish);
      setLive(prev => (prev ? { ...prev, saving: false, error: null } : prev));
    } catch (e: any) {
      t.dirty = true;
      console.error('Territory: save failed', e);
      setLive(prev => (prev ? { ...prev, saving: false, error: 'Could not save progress — will retry.' } : prev));
      if (finish) throw e;
    }
  }, []);

  const handleFix = useCallback((fix: Fix) => {
    const t = trackRef.current;
    if (!t) return;
    const usable = typeof fix.accuracy !== 'number' || fix.accuracy <= MAX_ACCURACY_METERS;
    if (usable) {
      const moved = t.lastPoint ? haversineMeters(t.lastPoint.lat, t.lastPoint.lng, fix.lat, fix.lng) : Infinity;
      if (moved >= MIN_POINT_SPACING_METERS) {
        const p: TrackPoint = { lat: round6(fix.lat), lng: round6(fix.lng), at: new Date(fix.at).toISOString() };
        t.points.push(p);
        if (t.lastPoint && Number.isFinite(moved)) t.distance += moved;
        t.lastPoint = p;
        t.dirty = true;
      }
      const nearby = findNearbyClients(fix.lat, fix.lng, clientsRef.current, t.visitedSet);
      if (nearby.length > 0) {
        const at = new Date(fix.at).toISOString();
        for (const c of nearby) {
          if (!clientHasPin(c)) continue;
          t.visitedSet.add(c.id);
          t.visited.push({ clientId: c.id, lat: c.latitude, lng: c.longitude, address: clientDisplayAddress(c), at });
        }
        t.dirty = true;
      }
    }
    // A fresh fix clears any earlier "position unavailable" style warning.
    snapshotLive(fix, { error: null });
  }, [snapshotLive]);

  const beginTracking = useCallback(async (activity: TerritoryActivity) => {
    const visitedSet = new Set(activity.visitedIds || []);
    const lastPoint = activity.points.length > 0 ? activity.points[activity.points.length - 1] : null;
    trackRef.current = {
      activity,
      points: [...activity.points],
      visited: [...activity.visited],
      visitedSet,
      distance: activity.distanceMeters || 0,
      lastPoint,
      dirty: false,
    };
    snapshotLive(null);
    stopWatchRef.current?.();
    stopWatchRef.current = watchFixes(handleFix, msg => {
      setLive(prev => (prev ? { ...prev, error: msg } : prev));
    });
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    flushTimerRef.current = setInterval(() => { flush(false); }, FLUSH_INTERVAL_MS);
    releaseWakeRef.current = await acquireKeepAwake('territory-activity');
  }, [flush, handleFix, snapshotLive]);

  const teardownTracking = useCallback(() => {
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    if (flushTimerRef.current) { clearInterval(flushTimerRef.current); flushTimerRef.current = null; }
    releaseWakeRef.current?.();
    releaseWakeRef.current = null;
    trackRef.current = null;
    setLive(null);
  }, []);

  // Stop GPS etc. if the screen unmounts mid-activity (progress already saved by the flush timer).
  useEffect(() => () => {
    stopWatchRef.current?.();
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    releaseWakeRef.current?.();
  }, []);

  const handleStart = useCallback(async (result: StartActivityResult) => {
    setModalOpen(false);
    try {
      const activity = await createActivity(result);
      setStaleActive(null);
      await beginTracking(activity);
      if (result.firstFix) {
        handleFix({ lat: result.firstFix.lat, lng: result.firstFix.lng, at: Date.now() });
      }
    } catch (e: any) {
      console.error('Territory: could not start activity', e);
      showAlert('Could not start', e?.message || 'Please try again.');
    }
  }, [beginTracking, handleFix]);

  const handleStop = useCallback(async () => {
    const t = trackRef.current;
    if (!t) return;
    const ok = await confirmAsync(
      'End activity?',
      `${t.activity.typeLabel} · ${formatDuration(t.activity.startedAt)} · ${t.visited.length} address${t.visited.length === 1 ? '' : 'es'} visited.`
    );
    if (!ok) return;
    stopWatchRef.current?.();
    stopWatchRef.current = null;
    try {
      await flush(true);
    } catch (e: any) {
      showAlert('Could not save', e?.message || 'Check your connection and try End again.');
      // Resume the watch so nothing is lost.
      stopWatchRef.current = watchFixes(handleFix);
      return;
    }
    teardownTracking();
    reloadActivities(dateFilter);
  }, [dateFilter, flush, handleFix, reloadActivities, teardownTracking]);

  const handleResumeStale = useCallback(async () => {
    if (!staleActive) return;
    const a = staleActive;
    setStaleActive(null);
    await beginTracking(a);
  }, [beginTracking, staleActive]);

  const handleEndStale = useCallback(async () => {
    if (!staleActive) return;
    const a = staleActive;
    try {
      await saveActivityProgress(a.id, { points: a.points, visited: a.visited, distanceMeters: a.distanceMeters }, true);
      setStaleActive(null);
      reloadActivities(dateFilter);
    } catch (e: any) {
      showAlert('Could not end activity', e?.message || 'Please try again.');
    }
  }, [dateFilter, reloadActivities, staleActive]);

  const handleDelete = useCallback(async (a: TerritoryActivity) => {
    const ok = await confirmAsync('Delete activity?', `${a.typeLabel} · ${fmtActivityWhen(a.startedAt)} · ${shortUser(a.userLabel)}. This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteActivity(a.id);
      setActivities(prev => prev.filter(x => x.id !== a.id));
    } catch (e: any) {
      showAlert('Could not delete', e?.message || 'Please try again.');
    }
  }, []);

  // ----- Derived -----
  const users = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activities) m.set(a.userId, a.userLabel);
    return Array.from(m.entries()).map(([id, label]) => ({ id, label }))
      .sort((x, y) => x.label.localeCompare(y.label));
  }, [activities]);

  useEffect(() => {
    if (userFilter !== 'all' && !users.some(u => u.id === userFilter)) setUserFilter('all');
  }, [users, userFilter]);

  const shownActivities = useMemo(() => {
    const list = activities.filter(a => a.id !== live?.activityId);
    return userFilter === 'all' ? list : list.filter(a => a.userId === userFilter);
  }, [activities, userFilter, live?.activityId]);

  const pinnedClients = useMemo(() => clients.filter(clientHasPin), [clients]);

  const mapState = useMemo<TerritoryMapState>(() => ({
    clients: pinnedClients.map(c => ({
      id: c.id,
      lat: c.latitude as number,
      lng: c.longitude as number,
      name: c.name || '',
      address: clientDisplayAddress(c),
    })),
    activities: shownActivities.map<TerritoryActivityLayer>(a => {
      const visited: Record<string, string> = {};
      for (const v of a.visited || []) visited[v.clientId] = v.at;
      return {
        id: a.id,
        colour: ACTIVITY_COLOURS[a.type] || ACTIVITY_COLOURS.other,
        label: `${a.typeLabel} · ${fmtActivityWhen(a.startedAt)} · ${shortUser(a.userLabel)}`,
        points: (a.points || []).map(p => ({ lat: p.lat, lng: p.lng })),
        visited,
      };
    }),
    live: live && live.fix
      ? {
          lat: live.fix.lat,
          lng: live.fix.lng,
          accuracy: live.fix.accuracy,
          colour: live.colour,
          points: live.points,
          visited: live.visited,
        }
      : null,
  }), [pinnedClients, shownActivities, live]);

  const totalVisited = useMemo(
    () => shownActivities.reduce((n, a) => n + (a.visitedIds?.length || 0), 0),
    [shownActivities]
  );

  const narrow = windowWidth < 600;
  // Header + filters + banners ≈ 290px; keep the map usable on landscape phones.
  const mapHeight = Math.max(320, windowHeight - (narrow ? 300 : 260));

  const canDelete = (a: TerritoryActivity) => canDeleteAny || a.userId === myUid;

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => router.replace('/business-development')} accessibilityLabel="Back">
          <ThemedText style={styles.backButtonText}>←</ThemedText>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <ThemedText type="title" style={styles.title}>Territory</ThemedText>
          <ThemedText style={styles.subtitle}>
            {loadingClients ? 'Loading customers…' : `${pinnedClients.length} of ${clients.length} customers pinned`}
            {loadingActivities ? '  ·  loading activities…' : `  ·  ${shownActivities.length} activit${shownActivities.length === 1 ? 'y' : 'ies'}, ${totalVisited} address${totalVisited === 1 ? '' : 'es'} visited`}
          </ThemedText>
        </View>
        {!live ? (
          <Pressable style={styles.startButton} onPress={() => setModalOpen(true)}>
            <Ionicons name="play" size={16} color="#fff" />
            <ThemedText style={styles.startButtonText}>{narrow ? 'Start' : 'Start Activity'}</ThemedText>
          </Pressable>
        ) : (
          <Pressable style={styles.stopButton} onPress={handleStop}>
            <Ionicons name="stop" size={16} color="#fff" />
            <ThemedText style={styles.startButtonText}>{narrow ? 'End' : 'End Activity'}</ThemedText>
          </Pressable>
        )}
      </View>

      {/* Live banner */}
      {live && (
        <View style={[styles.liveBanner, { borderLeftColor: live.colour }]}>
          <View style={styles.liveDot} />
          <ThemedText style={styles.liveText} numberOfLines={2}>
            {live.typeLabel} · {formatDuration(live.startedAt)} · {formatDistance(live.distance)} · {live.visitedCount} address{live.visitedCount === 1 ? '' : 'es'}
            {live.fix?.accuracy != null ? ` · ±${Math.round(live.fix.accuracy)} m` : live.fix ? '' : ' · waiting for GPS…'}
            {live.saving ? ' · saving' : ''}
          </ThemedText>
          {live.error && <ThemedText style={styles.liveError} numberOfLines={2}>{live.error}</ThemedText>}
        </View>
      )}

      {/* Left-running activity */}
      {staleActive && !live && (
        <View style={styles.staleBanner}>
          <ThemedText style={styles.staleText}>
            You have a {staleActive.typeLabel.toLowerCase()} activity still running from {fmtActivityWhen(staleActive.startedAt)}.
          </ThemedText>
          <View style={styles.staleButtons}>
            <Pressable style={styles.staleResume} onPress={handleResumeStale}>
              <ThemedText style={styles.staleResumeText}>Resume</ThemedText>
            </Pressable>
            <Pressable style={styles.staleEnd} onPress={handleEndStale}>
              <ThemedText style={styles.staleEndText}>End it</ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
        <Ionicons name="calendar-outline" size={16} color="#666" style={styles.chipIcon} />
        {DATE_FILTERS.map(f => (
          <Pressable key={f.key} style={[styles.chip, dateFilter === f.key && styles.chipActive]} onPress={() => setDateFilter(f.key)}>
            <ThemedText style={[styles.chipText, dateFilter === f.key && styles.chipTextActive]}>{f.label}</ThemedText>
          </Pressable>
        ))}
        <View style={styles.chipDivider} />
        <Ionicons name="person-outline" size={16} color="#666" style={styles.chipIcon} />
        <Pressable style={[styles.chip, userFilter === 'all' && styles.chipActive]} onPress={() => setUserFilter('all')}>
          <ThemedText style={[styles.chipText, userFilter === 'all' && styles.chipTextActive]}>Everyone</ThemedText>
        </Pressable>
        {users.map(u => (
          <Pressable key={u.id} style={[styles.chip, userFilter === u.id && styles.chipActive]} onPress={() => setUserFilter(u.id)}>
            <ThemedText style={[styles.chipText, userFilter === u.id && styles.chipTextActive]}>
              {u.id === myUid ? 'Me' : shortUser(u.label)}
            </ThemedText>
          </Pressable>
        ))}
        <View style={styles.chipDivider} />
        <Pressable style={[styles.chip, showList && styles.chipActive]} onPress={() => setShowList(s => !s)}>
          <ThemedText style={[styles.chipText, showList && styles.chipTextActive]}>
            {showList ? 'Hide list' : `List (${shownActivities.length})`}
          </ThemedText>
        </Pressable>
      </ScrollView>

      {/* Activity list */}
      {showList && (
        <View style={styles.listPanel}>
          {shownActivities.length === 0 ? (
            <ThemedText style={styles.listEmpty}>No activities in this range.</ThemedText>
          ) : (
            <ScrollView style={styles.listScroll} nestedScrollEnabled>
              {shownActivities.map(a => (
                <View key={a.id} style={styles.listRow}>
                  <View style={[styles.listSwatch, { backgroundColor: ACTIVITY_COLOURS[a.type] || ACTIVITY_COLOURS.other }]} />
                  <View style={styles.listBody}>
                    <ThemedText style={styles.listTitle} numberOfLines={1}>
                      {a.typeLabel} · {fmtActivityWhen(a.startedAt)}
                      {a.status === 'active' ? ' · in progress' : ''}
                    </ThemedText>
                    <ThemedText style={styles.listMeta} numberOfLines={1}>
                      {shortUser(a.userLabel)} · {formatDuration(a.startedAt, a.endedAt)} · {formatDistance(a.distanceMeters || 0)} · {a.visitedIds?.length || 0} address{(a.visitedIds?.length || 0) === 1 ? '' : 'es'}
                    </ThemedText>
                  </View>
                  {canDelete(a) && (
                    <Pressable onPress={() => handleDelete(a)} hitSlop={8} accessibilityLabel="Delete activity">
                      <Ionicons name="trash-outline" size={18} color="#c62828" />
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Map */}
      <View style={[styles.mapContainer, { height: mapHeight }]}>
        {loadingClients ? (
          <View style={styles.center}><ActivityIndicator size="large" /></View>
        ) : (
          <TerritoryMapView state={mapState} follow={!!live} />
        )}
      </View>

      <StartActivityModal visible={modalOpen} onCancel={() => setModalOpen(false)} onStart={handleStart} />
    </ThemedView>
  );
}

export default function TerritoryScreen() {
  return (
    <PermissionGate perm="viewTerritory" fallback={
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText>You do not have permission to view Territory.</ThemedText>
      </ThemedView>
    }>
      <TerritoryContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 24 : 60,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 12 },
  backButton: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0',
    justifyContent: 'center', alignItems: 'center',
  },
  backButtonText: { fontSize: 20, color: '#007AFF' },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 22 },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  startButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#2e7d32', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  stopButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#c62828', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8,
  },
  startButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  liveBanner: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    backgroundColor: '#f1f8e9', borderLeftWidth: 4, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8,
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#c62828' },
  liveText: { flex: 1, fontSize: 13, color: '#2e4a1f', fontWeight: '600' },
  liveError: { width: '100%', fontSize: 12, color: '#c62828' },
  staleBanner: {
    backgroundColor: '#fff8e1', borderRadius: 8, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#ffe082',
  },
  staleText: { fontSize: 13, color: '#5d4037' },
  staleButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  staleResume: { backgroundColor: '#2e7d32', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  staleResumeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  staleEnd: { backgroundColor: '#eceff1', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  staleEndText: { color: '#333', fontWeight: '600', fontSize: 13 },
  chipRow: { flexGrow: 0, marginBottom: 8 },
  chipRowContent: { alignItems: 'center', gap: 6, paddingRight: 8 },
  chipIcon: { marginRight: 2 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    backgroundColor: '#f2f2f2', borderWidth: 1, borderColor: '#e0e0e0',
  },
  chipActive: { backgroundColor: '#1976d2', borderColor: '#1976d2' },
  chipText: { fontSize: 13, color: '#333', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  chipDivider: { width: 1, height: 20, backgroundColor: '#ddd', marginHorizontal: 6 },
  listPanel: {
    backgroundColor: '#fafafa', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0',
    marginBottom: 8, maxHeight: 220,
  },
  listScroll: { maxHeight: 220 },
  listEmpty: { padding: 12, fontSize: 13, color: '#777' },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  listSwatch: { width: 10, height: 10, borderRadius: 5 },
  listBody: { flex: 1 },
  listTitle: { fontSize: 14, fontWeight: '600', color: '#222' },
  listMeta: { fontSize: 12, color: '#666', marginTop: 1 },
  mapContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eaeaea',
  },
});
