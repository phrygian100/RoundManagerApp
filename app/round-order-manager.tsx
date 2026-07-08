import { useRouter } from 'expo-router';
import { collection, doc, getDocs, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import ClientMapView from '../components/ClientMapView';
import { GuideHelpButton } from '../components/GuideHelpButton';
import LocationPickerModal from '../components/LocationPickerModal';
import PermissionGate from '../components/PermissionGate';
import { ThemedText } from '../components/ThemedText';
import { ThemedView } from '../components/ThemedView';
import { db } from '../core/firebase';
import { getDataOwnerId } from '../core/session';
import type { Client } from '../types/client';

// Native-only drag & drop list (does not work reliably on web)
let DraggableFlatList: any = null;
let ScaleDecorator: any = null;
if (Platform.OS !== 'web') {
  const dfl = require('react-native-draggable-flatlist');
  DraggableFlatList = dfl.default;
  ScaleDecorator = dfl.ScaleDecorator;
}

const ROW_HEIGHT = 56;
const EDGE_ZONE = 64; // px near top/bottom of list that triggers auto-scroll
const AUTO_SCROLL_STEP = 14; // px per frame while in the edge zone
const BATCH_LIMIT = 400; // Firestore writeBatch hard limit is 500 ops

const isMobileBrowser = () => {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent) ||
    (window.innerWidth <= 768);
};

const showAlert = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
};

const confirmAsync = async (title: string, message: string): Promise<boolean> => {
  if (Platform.OS === 'web') {
    return window.confirm(`${title}\n\n${message}`);
  }
  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
};

const clientAddress = (client: Client): string => {
  const parts = [client.address1, client.town, client.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : (client.address || 'No address');
};

type RowProps = {
  client: Client;
  index: number;
  moved: boolean;
  expanded: boolean;
  isDragSource: boolean;
  showTopIndicator: boolean;
  showBottomIndicator: boolean;
  draggable: boolean;
  totalCount: number;
  onToggleExpand: (id: string) => void;
  onMoveToPosition: (id: string, position: number) => void;
  // Native drag activation (provided by DraggableFlatList)
  onNativeDrag?: () => void;
  nativeDragActive?: boolean;
};

const Row = React.memo(function Row({
  client, index, moved, expanded, isDragSource, showTopIndicator, showBottomIndicator,
  draggable, totalCount, onToggleExpand, onMoveToPosition, onNativeDrag, nativeDragActive,
}: RowProps) {
  const [positionInput, setPositionInput] = useState('');

  useEffect(() => {
    if (expanded) setPositionInput(String(index + 1));
  }, [expanded, index]);

  const submitPosition = () => {
    const target = parseInt(positionInput, 10);
    if (isNaN(target) || target < 1 || target > totalCount) {
      showAlert('Invalid position', `Enter a number between 1 and ${totalCount}.`);
      return;
    }
    onMoveToPosition(client.id, target);
  };

  return (
    <View style={styles.rowWrapper}>
      {showTopIndicator && <View style={styles.dropIndicatorTop} pointerEvents="none" />}
      <Pressable
        style={[
          styles.row,
          isDragSource && styles.rowDragSource,
          nativeDragActive && styles.rowDragSource,
        ]}
        onPress={() => onToggleExpand(client.id)}
        onLongPress={onNativeDrag}
        delayLongPress={200}
      >
        <View style={styles.positionBadge}>
          <ThemedText style={styles.positionText}>{index + 1}</ThemedText>
        </View>
        <View style={styles.rowBody}>
          <ThemedText style={styles.addressText} numberOfLines={1}>
            {clientAddress(client)}
          </ThemedText>
          {!!client.name && (
            <ThemedText style={styles.nameText} numberOfLines={1}>{client.name}</ThemedText>
          )}
        </View>
        {moved && <View style={styles.movedDot} />}
        {draggable && (
          <Pressable
            style={styles.dragHandle}
            onPressIn={onNativeDrag}
            // Web: picked up by the container-level pointerdown listener
            {...(Platform.OS === 'web' ? { dataSet: { dragindex: String(index) } } as any : {})}
          >
            <ThemedText style={styles.dragHandleText}>⠿</ThemedText>
          </Pressable>
        )}
      </Pressable>
      {expanded && (
        <View style={styles.expandedRow}>
          <ThemedText style={styles.expandedLabel}>Move to:</ThemedText>
          <TextInput
            style={styles.positionInput}
            value={positionInput}
            onChangeText={setPositionInput}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="No."
            placeholderTextColor="#999"
            onSubmitEditing={submitPosition}
          />
          <Pressable style={styles.expandedButton} onPress={submitPosition}>
            <ThemedText style={styles.expandedButtonText}>Go</ThemedText>
          </Pressable>
          <Pressable style={styles.expandedButtonAlt} onPress={() => onMoveToPosition(client.id, 1)}>
            <ThemedText style={styles.expandedButtonAltText}>Top</ThemedText>
          </Pressable>
          <Pressable style={styles.expandedButtonAlt} onPress={() => onMoveToPosition(client.id, totalCount)}>
            <ThemedText style={styles.expandedButtonAltText}>Bottom</ThemedText>
          </Pressable>
        </View>
      )}
      {showBottomIndicator && <View style={styles.dropIndicatorBottom} pointerEvents="none" />}
    </View>
  );
});

function RoundOrderManagerContent() {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // List = drag-to-reorder; Map = pins for visually verifying client locations
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  // Client whose pin is being edited from the map (via popup "Edit location")
  const [editingPinClient, setEditingPinClient] = useState<Client | null>(null);
  // Clients the user explicitly repositioned this session (dragged or moved via input)
  const [userMovedIds, setUserMovedIds] = useState<Set<string>>(new Set());
  // Web drag state: dragIndex = row being dragged, dropIndex = insertion gap (0..N)
  const [webDrag, setWebDrag] = useState<{ dragIndex: number; dropIndex: number } | null>(null);

  // Original roundOrderNumber per client id, used to compute the minimal save set
  const originalNumberById = useRef<Map<string, number | null>>(new Map());
  const originalIndexById = useRef<Map<string, number>>(new Map());

  const listContainerRef = useRef<View>(null);
  const flatListRef = useRef<FlatList>(null);
  const overlayRef = useRef<View>(null);
  const scrollOffsetRef = useRef(0);
  const clientsRef = useRef<Client[]>([]);
  clientsRef.current = clients;
  const webDragRef = useRef<typeof webDrag>(null);
  webDragRef.current = webDrag;
  const autoScrollDirRef = useRef<0 | 1 | -1>(0);
  const autoScrollRafRef = useRef<number | null>(null);
  const lastPointerYRef = useRef(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const ownerId = await getDataOwnerId();
        const snap = await getDocs(query(collection(db, 'clients'), where('ownerId', '==', ownerId)));
        const active = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Client))
          .filter(c => c.status !== 'ex-client')
          .sort((a, b) => (a.roundOrderNumber || 999999) - (b.roundOrderNumber || 999999));

        originalNumberById.current = new Map(
          active.map(c => [c.id, typeof c.roundOrderNumber === 'number' ? c.roundOrderNumber : null])
        );
        originalIndexById.current = new Map(active.map((c, i) => [c.id, i]));
        setClients(active);
      } catch (err) {
        console.error('RoundOrderManager: failed to load clients', err);
        showAlert('Error', 'Failed to load clients.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Writes needed on save = clients whose final sequential number differs from what is stored.
  // This can be non-zero even before any move, when stored numbering has gaps/duplicates.
  const writeCount = useMemo(() => {
    let count = 0;
    clients.forEach((c, i) => {
      if (originalNumberById.current.get(c.id) !== i + 1) count++;
    });
    return count;
  }, [clients]);

  const movedCount = userMovedIds.size;
  const needsNormalization = movedCount === 0 && writeCount > 0;

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return clients.filter(c =>
      clientAddress(c).toLowerCase().includes(q) ||
      (c.name || '').toLowerCase().includes(q) ||
      (c.accountNumber ? String(c.accountNumber).toLowerCase().includes(q) : false)
    );
  }, [clients, searchQuery]);

  const moveToPosition = useCallback((id: string, position: number) => {
    const current = clientsRef.current;
    const from = current.findIndex(c => c.id === id);
    const target = Math.max(0, Math.min(current.length - 1, position - 1));
    if (from === -1 || target === from) {
      setExpandedId(null);
      return;
    }
    setClients(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(Math.max(0, Math.min(next.length, position - 1)), 0, item);
      return next;
    });
    setUserMovedIds(prev => new Set(prev).add(id));
    setExpandedId(null);
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  // ---------- Map view: pin verification & correction ----------

  const pinnedCount = useMemo(
    () => clients.filter(c => typeof c.latitude === 'number' && typeof c.longitude === 'number').length,
    [clients]
  );

  // The map must have an explicit pixel height: percentage/flex heights don't resolve
  // reliably into an embedded iframe/WebView (iframes collapse to their 150px default).
  // ~210px covers header + toggle + banner + paddings; floor keeps landscape phones usable.
  const mapHeight = Math.max(320, windowHeight - 210);

  const handleEditPin = useCallback((clientId: string) => {
    const client = clientsRef.current.find(c => c.id === clientId);
    if (client) setEditingPinClient(client);
  }, []);

  const handleConfirmPin = async (loc: { latitude: number; longitude: number }) => {
    const client = editingPinClient;
    if (!client) return;
    try {
      await updateDoc(doc(db, 'clients', client.id), {
        latitude: loc.latitude,
        longitude: loc.longitude,
        geoSource: 'manual',
        geoUpdatedAt: new Date().toISOString(),
      });
      setClients(prev => prev.map(c => c.id === client.id
        ? { ...c, latitude: loc.latitude, longitude: loc.longitude, geoSource: 'manual' as const }
        : c));
      setEditingPinClient(null);
    } catch (err) {
      console.error('RoundOrderManager: failed to save pin', err);
      showAlert('Error', 'Failed to save the new location. Please try again.');
    }
  };

  // ---------- Web drag & drop (pointer events on the container DOM node) ----------

  const getContainerNode = (): HTMLElement | null => {
    if (Platform.OS !== 'web') return null;
    return (listContainerRef.current as unknown as HTMLElement) || null;
  };

  const computeDropIndex = useCallback((clientY: number): number => {
    const node = getContainerNode();
    if (!node) return 0;
    const rect = node.getBoundingClientRect();
    const localY = clientY - rect.top + scrollOffsetRef.current;
    const gap = Math.round(localY / ROW_HEIGHT);
    return Math.max(0, Math.min(clientsRef.current.length, gap));
  }, []);

  const updateOverlayPosition = useCallback((clientY: number) => {
    const node = getContainerNode();
    const overlay = overlayRef.current as unknown as HTMLElement | null;
    if (!node || !overlay) return;
    const rect = node.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height - ROW_HEIGHT, clientY - rect.top - ROW_HEIGHT / 2));
    overlay.style.transform = `translateY(${y}px)`;
  }, []);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirRef.current = 0;
    if (autoScrollRafRef.current !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  const autoScrollLoop = useCallback(() => {
    if (autoScrollDirRef.current === 0) {
      autoScrollRafRef.current = null;
      return;
    }
    const maxOffset = Math.max(0, clientsRef.current.length * ROW_HEIGHT);
    const nextOffset = Math.max(0, Math.min(maxOffset,
      scrollOffsetRef.current + autoScrollDirRef.current * AUTO_SCROLL_STEP));
    if (nextOffset !== scrollOffsetRef.current) {
      scrollOffsetRef.current = nextOffset;
      flatListRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
      // Re-evaluate the drop slot as content moves underneath the pointer
      const drag = webDragRef.current;
      if (drag) {
        const dropIndex = computeDropIndex(lastPointerYRef.current);
        if (dropIndex !== drag.dropIndex) {
          setWebDrag({ ...drag, dropIndex });
        }
      }
    }
    autoScrollRafRef.current = requestAnimationFrame(autoScrollLoop);
  }, [computeDropIndex]);

  const maybeAutoScroll = useCallback((clientY: number) => {
    const node = getContainerNode();
    if (!node) return;
    const rect = node.getBoundingClientRect();
    let dir: 0 | 1 | -1 = 0;
    if (clientY < rect.top + EDGE_ZONE) dir = -1;
    else if (clientY > rect.bottom - EDGE_ZONE) dir = 1;
    if (dir !== autoScrollDirRef.current) {
      autoScrollDirRef.current = dir;
      if (dir !== 0 && autoScrollRafRef.current === null) {
        autoScrollRafRef.current = requestAnimationFrame(autoScrollLoop);
      }
    }
  }, [autoScrollLoop]);

  const finishWebDrag = useCallback((commit: boolean) => {
    stopAutoScroll();
    const drag = webDragRef.current;
    setWebDrag(null);
    if (!drag || !commit) return;
    const { dragIndex, dropIndex } = drag;
    const current = clientsRef.current;
    const draggedId = current[dragIndex]?.id;
    let target = dropIndex;
    if (target > dragIndex) target -= 1; // removing the item shifts later slots up
    const willMove = !!draggedId && dragIndex >= 0 && dragIndex < current.length && target !== dragIndex;
    if (!willMove) return;
    setClients(prev => {
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(Math.max(0, Math.min(next.length, target)), 0, item);
      return next;
    });
    setUserMovedIds(prev => new Set(prev).add(draggedId!));
  }, [stopAutoScroll]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const node = getContainerNode();
    if (!node) return;

    const onPointerMove = (e: PointerEvent) => {
      if (!webDragRef.current) return;
      e.preventDefault();
      lastPointerYRef.current = e.clientY;
      updateOverlayPosition(e.clientY);
      maybeAutoScroll(e.clientY);
      const dropIndex = computeDropIndex(e.clientY);
      const drag = webDragRef.current;
      if (drag && dropIndex !== drag.dropIndex) {
        setWebDrag({ ...drag, dropIndex });
      }
    };

    const onPointerUp = () => {
      if (!webDragRef.current) return;
      finishWebDrag(true);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerCancel = () => {
      if (!webDragRef.current) return;
      finishWebDrag(false);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const handle = target?.closest?.('[data-dragindex]') as HTMLElement | null;
      if (!handle) return;
      const dragIndex = Number(handle.getAttribute('data-dragindex'));
      if (isNaN(dragIndex)) return;
      e.preventDefault();
      lastPointerYRef.current = e.clientY;
      setExpandedId(null);
      setWebDrag({ dragIndex, dropIndex: dragIndex });
      // Position the floating overlay on the next frame (it mounts with this state update)
      requestAnimationFrame(() => updateOverlayPosition(e.clientY));
      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerCancel);
    };

    node.addEventListener('pointerdown', onPointerDown);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      stopAutoScroll();
    };
  }, [loading, computeDropIndex, updateOverlayPosition, maybeAutoScroll, finishWebDrag, stopAutoScroll]);

  // ---------- Save / discard ----------

  const handleSave = async () => {
    if (writeCount === 0) return;
    const message = movedCount > 0
      ? `You moved ${movedCount} client${movedCount === 1 ? '' : 's'}. Saving will renumber ${writeCount} client${writeCount === 1 ? '' : 's'} so the round order stays sequential. Continue?`
      : `No clients were moved, but the stored numbering has gaps or duplicates. Saving will renumber ${writeCount} client${writeCount === 1 ? '' : 's'} into a clean 1-${clients.length} sequence. Continue?`;
    const ok = await confirmAsync('Save round order', message);
    if (!ok) return;

    try {
      setSaving(true);
      const changes: { id: string; newNumber: number }[] = [];
      clients.forEach((c, i) => {
        if (originalNumberById.current.get(c.id) !== i + 1) {
          changes.push({ id: c.id, newNumber: i + 1 });
        }
      });

      for (let i = 0; i < changes.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        changes.slice(i, i + BATCH_LIMIT).forEach(ch => {
          batch.update(doc(db, 'clients', ch.id), { roundOrderNumber: ch.newNumber });
        });
        await batch.commit();
      }

      // Sync the baseline so the screen reflects a clean state
      originalNumberById.current = new Map(clients.map((c, i) => [c.id, i + 1]));
      originalIndexById.current = new Map(clients.map((c, i) => [c.id, i]));
      setClients(prev => prev.map((c, i) => ({ ...c, roundOrderNumber: i + 1 })));
      setUserMovedIds(new Set());

      showAlert('Saved', `Round order updated for ${changes.length} client${changes.length === 1 ? '' : 's'}.`);
    } catch (err) {
      console.error('RoundOrderManager: save failed', err);
      showAlert('Error', 'Failed to save the new round order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (movedCount > 0) {
      const ok = await confirmAsync('Discard changes', 'You have unsaved round order changes. Discard them?');
      if (!ok) return;
    }
    router.back();
  };

  const handleReset = async () => {
    if (movedCount === 0) return;
    const ok = await confirmAsync('Reset', 'Revert the list to the last saved order?');
    if (!ok) return;
    setClients(prev => {
      const next = [...prev].sort((a, b) =>
        (originalIndexById.current.get(a.id) ?? 0) - (originalIndexById.current.get(b.id) ?? 0));
      return next;
    });
    setUserMovedIds(new Set());
    setExpandedId(null);
  };

  // ---------- Rendering ----------

  const isFiltered = filteredClients !== null;
  const data = isFiltered ? filteredClients! : clients;
  const totalCount = clients.length;

  const indexById = useMemo(() => new Map(clients.map((c, i) => [c.id, i])), [clients]);

  const renderRow = useCallback(({ item }: { item: Client }) => {
    const index = indexById.get(item.id) ?? 0;
    const dragActive = webDrag !== null;
    return (
      <Row
        client={item}
        index={index}
        moved={userMovedIds.has(item.id)}
        expanded={expandedId === item.id}
        isDragSource={dragActive && webDrag!.dragIndex === index}
        showTopIndicator={!isFiltered && dragActive && webDrag!.dropIndex === index}
        showBottomIndicator={!isFiltered && dragActive && index === totalCount - 1 && webDrag!.dropIndex === totalCount}
        draggable={!isFiltered}
        totalCount={totalCount}
        onToggleExpand={toggleExpand}
        onMoveToPosition={moveToPosition}
      />
    );
  }, [indexById, webDrag, userMovedIds, expandedId, isFiltered, totalCount, toggleExpand, moveToPosition]);

  const renderNativeRow = useCallback(({ item, drag, isActive }: any) => {
    const index = indexById.get(item.id) ?? 0;
    const row = (
      <Row
        client={item}
        index={index}
        moved={userMovedIds.has(item.id)}
        expanded={expandedId === item.id}
        isDragSource={false}
        showTopIndicator={false}
        showBottomIndicator={false}
        draggable={!isFiltered}
        totalCount={totalCount}
        onToggleExpand={toggleExpand}
        onMoveToPosition={moveToPosition}
        onNativeDrag={drag}
        nativeDragActive={isActive}
      />
    );
    return ScaleDecorator ? <ScaleDecorator>{row}</ScaleDecorator> : row;
  }, [indexById, userMovedIds, expandedId, isFiltered, totalCount, toggleExpand, moveToPosition]);

  const keyExtractor = useCallback((item: Client) => item.id, []);
  const getItemLayout = useCallback((_: any, index: number) => (
    { length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index }
  ), []);

  if (loading) {
    return (
      <ThemedView style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Loading clients…</ThemedText>
      </ThemedView>
    );
  }

  const draggedClient = webDrag ? clients[webDrag.dragIndex] : null;

  return (
    <ThemedView style={[
      styles.container,
      // On web the page itself scrolls unless the screen is height-constrained;
      // pin to the window height so the list scrolls internally (required for drag auto-scroll).
      // maxHeight + overflow guard against flexbox min-height:auto flooring the container.
      // Map mode is NOT pinned: the map has an explicit height and small screens
      // (landscape phones) are better served by letting the page scroll.
      Platform.OS === 'web' && viewMode === 'list' &&
        ({ height: windowHeight, maxHeight: windowHeight, overflow: 'hidden' } as any),
    ]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={handleDiscard}>
          <ThemedText style={styles.backButtonText}>←</ThemedText>
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <ThemedText type="title" style={styles.title}>Round Order Manager</ThemedText>
          <ThemedText style={styles.subtitle}>
            {totalCount} client{totalCount === 1 ? '' : 's'}
            {movedCount > 0 ? `  ·  ${movedCount} moved (unsaved)` : ''}
          </ThemedText>
        </View>
        <GuideHelpButton slug="roundordermanager" color="#007AFF" style={{ marginLeft: 8 }} />
        {movedCount > 0 && (
          <Pressable style={styles.resetButton} onPress={handleReset}>
            <ThemedText style={styles.resetButtonText}>Reset</ThemedText>
          </Pressable>
        )}
      </View>

      {needsNormalization && viewMode === 'list' && (
        <View style={styles.noticeBanner}>
          <ThemedText style={styles.noticeText}>
            The stored numbering has gaps or duplicates. Tap Save to renumber all clients into a clean sequence.
          </ThemedText>
        </View>
      )}

      {/* List | Map toggle */}
      <View style={styles.viewToggle}>
        <Pressable
          style={[styles.viewToggleButton, viewMode === 'list' && styles.viewToggleButtonActive]}
          onPress={() => setViewMode('list')}
        >
          <ThemedText style={[styles.viewToggleText, viewMode === 'list' && styles.viewToggleTextActive]}>
            List
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.viewToggleButton, viewMode === 'map' && styles.viewToggleButtonActive]}
          onPress={() => setViewMode('map')}
        >
          <ThemedText style={[styles.viewToggleText, viewMode === 'map' && styles.viewToggleTextActive]}>
            Map
          </ThemedText>
        </Pressable>
      </View>

      {viewMode === 'map' && (
        <>
          <View style={styles.mapBanner}>
            <ThemedText style={styles.mapBannerText}>
              {pinnedCount} of {totalCount} pinned
              {totalCount - pinnedCount > 0
                ? `  ·  ${totalCount - pinnedCount} need a location (set via Edit Customer)`
                : ''}
            </ThemedText>
          </View>
          <View style={[styles.mapContainer, { height: mapHeight }]}>
            <ClientMapView clients={clients} onEditLocation={handleEditPin} />
          </View>
        </>
      )}

      {/* Search */}
      {viewMode === 'list' && (
        <>
      <TextInput
        style={styles.searchInput}
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search by address, name or account number…"
        placeholderTextColor="#999"
        autoCorrect={false}
      />
      {isFiltered && (
        <ThemedText style={styles.filterHint}>
          Showing {data.length} match{data.length === 1 ? '' : 'es'} — tap a client to move it, or clear the search to drag.
        </ThemedText>
      )}

      {/* List */}
      <View style={styles.listContainer} ref={listContainerRef}>
        {Platform.OS !== 'web' && DraggableFlatList && !isFiltered ? (
          <DraggableFlatList
            data={data}
            keyExtractor={keyExtractor}
            renderItem={renderNativeRow}
            onDragEnd={({ data: reordered, from, to }: { data: Client[]; from: number; to: number }) => {
              setClients(reordered);
              if (from !== to && reordered[to]) {
                const movedId = reordered[to].id;
                setUserMovedIds(prev => new Set(prev).add(movedId));
              }
            }}
            getItemLayout={getItemLayout}
            initialNumToRender={20}
            windowSize={10}
          />
        ) : (
          <FlatList
            ref={flatListRef}
            data={data}
            keyExtractor={keyExtractor}
            renderItem={renderRow}
            getItemLayout={isFiltered ? undefined : getItemLayout}
            extraData={`${webDrag?.dragIndex ?? -1}:${webDrag?.dropIndex ?? -1}:${expandedId ?? ''}:${movedCount}:${writeCount}`}
            onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            initialNumToRender={20}
            windowSize={10}
          />
        )}

        {/* Floating overlay for the dragged row (web only) */}
        {draggedClient && (
          <View ref={overlayRef} style={styles.dragOverlay} pointerEvents="none">
            <View style={styles.positionBadge}>
              <ThemedText style={styles.positionText}>{(webDrag?.dragIndex ?? 0) + 1}</ThemedText>
            </View>
            <View style={styles.rowBody}>
              <ThemedText style={styles.addressText} numberOfLines={1}>
                {clientAddress(draggedClient)}
              </ThemedText>
              {!!draggedClient.name && (
                <ThemedText style={styles.nameText} numberOfLines={1}>{draggedClient.name}</ThemedText>
              )}
            </View>
            <ThemedText style={styles.dragHandleText}>⠿</ThemedText>
          </View>
        )}
      </View>
        </>
      )}

      {/* Pin correction picker (opened from map popups) */}
      <LocationPickerModal
        visible={editingPinClient !== null}
        initialLatitude={editingPinClient?.latitude ?? null}
        initialLongitude={editingPinClient?.longitude ?? null}
        addressLabel={editingPinClient ? clientAddress(editingPinClient) : undefined}
        onConfirm={handleConfirmPin}
        onCancel={() => setEditingPinClient(null)}
      />

      {/* Sticky footer — list mode only. Pin edits save immediately, so map mode has
          nothing to Save/Discard, and hiding the footer gives the map the space instead. */}
      {viewMode === 'list' && (
      <View style={styles.footer}>
        <Pressable
          style={[styles.discardButton, saving && styles.buttonDisabled]}
          onPress={handleDiscard}
          disabled={saving}
        >
          <ThemedText style={styles.footerButtonText}>
            {movedCount > 0 ? 'Discard' : 'Back'}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.saveButton, (saving || writeCount === 0) && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving || writeCount === 0}
        >
          <ThemedText style={styles.footerButtonText}>
            {saving
              ? 'Saving…'
              : movedCount > 0
                ? `Save (${movedCount} moved)`
                : needsNormalization
                  ? 'Save (fix numbering)'
                  : 'Save'}
          </ThemedText>
        </Pressable>
      </View>
      )}
    </ThemedView>
  );
}

export default function RoundOrderManagerScreen() {
  return (
    <PermissionGate perm="viewClients" fallback={
      <ThemedView style={[styles.container, styles.center]}>
        <ThemedText>You do not have permission to manage the round order.</ThemedText>
      </ThemedView>
    }>
      <RoundOrderManagerContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 24 : 60,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#007AFF',
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    fontSize: 22,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#ff9800',
  },
  resetButtonText: {
    color: '#e65100',
    fontSize: 14,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  viewToggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewToggleButtonActive: {
    backgroundColor: '#007AFF',
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  viewToggleTextActive: {
    color: '#fff',
  },
  mapContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
  },
  mapBanner: {
    backgroundColor: '#eef3fb',
    borderWidth: 1,
    borderColor: '#c5d4ee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  mapBannerText: {
    fontSize: 13,
    color: '#2c5aa0',
  },
  searchInput: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f2f2f2',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#333',
    marginBottom: 8,
  },
  filterHint: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  noticeBanner: {
    backgroundColor: '#fff8e1',
    borderWidth: 1,
    borderColor: '#ffd54f',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 13,
    color: '#7a5c00',
    lineHeight: 18,
  },
  listContainer: {
    flex: 1,
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eee',
    // Allow this flex child to shrink below its content height so the inner list scrolls (web)
    ...(Platform.OS === 'web' ? ({ minHeight: 0 } as any) : {}),
  },
  rowWrapper: {
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingLeft: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowDragSource: {
    opacity: 0.35,
    backgroundColor: '#e3f2fd',
  },
  positionBadge: {
    width: 44,
    alignItems: 'flex-start',
  },
  positionText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  rowBody: {
    flex: 1,
    paddingRight: 8,
  },
  addressText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    lineHeight: 18,
  },
  nameText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
  },
  movedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff9800',
    marginRight: 6,
  },
  dragHandle: {
    width: 56,
    height: ROW_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'grab', touchAction: 'none' } as any) : {}),
  },
  dragHandleText: {
    fontSize: 20,
    color: '#bbb',
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as any) : {}),
  },
  dropIndicatorTop: {
    position: 'absolute',
    top: -2,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#007AFF',
    zIndex: 10,
  },
  dropIndicatorBottom: {
    position: 'absolute',
    bottom: -2,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#007AFF',
    zIndex: 10,
  },
  dragOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 18,
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 8,
    zIndex: 100,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 12px rgba(0,0,0,0.25)' } as any)
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 8,
        }),
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f7f9fc',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  expandedLabel: {
    fontSize: 14,
    color: '#555',
  },
  positionInput: {
    width: 72,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#333',
  },
  expandedButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  expandedButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  expandedButtonAlt: {
    backgroundColor: '#eef3fb',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c5d4ee',
  },
  expandedButtonAltText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'web' ? (isMobileBrowser() ? 16 : 4) : 24,
  },
  discardButton: {
    flex: 1,
    backgroundColor: '#8e8e93',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButton: {
    flex: 2,
    backgroundColor: '#4caf50',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  footerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
