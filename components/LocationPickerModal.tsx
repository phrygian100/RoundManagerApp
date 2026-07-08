import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from './ThemedText';

// Native-only WebView (react-native-webview does not run on web; web uses an iframe)
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

export type PickedLocation = { latitude: number; longitude: number };

type Props = {
  visible: boolean;
  /** Existing/predicted pin. When absent the map opens over the UK for manual placement. */
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  /** Shown in the header so the user knows whose pin they're placing. */
  addressLabel?: string;
  onConfirm: (location: PickedLocation) => void;
  onCancel: () => void;
  /**
   * Optional: re-attempt the automated location guess (e.g. after the user has refined
   * the address fields behind this modal). Return null when nothing was found.
   * When provided, a "Re-guess" button appears between Cancel and Confirm.
   */
  onReguess?: () => Promise<PickedLocation | null>;
};

const MESSAGE_TAG = 'guvnor-location-picker';

// Rough centre of the UK for when we have no better starting point.
const UK_CENTER = { lat: 54.093, lng: -2.894 };
const UK_ZOOM = 6;
const PIN_ZOOM = 16;

function buildMapHtml(lat: number | null, lng: number | null): string {
  const hasPin = lat !== null && lng !== null;
  const centerLat = hasPin ? lat : UK_CENTER.lat;
  const centerLng = hasPin ? lng : UK_CENTER.lng;
  const zoom = hasPin ? PIN_ZOOM : UK_ZOOM;

  // Single Leaflet implementation shared by both platforms. Communication back to the
  // host is via ReactNativeWebView.postMessage (native) or parent.postMessage (web iframe).
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  .hint {
    position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
    z-index: 1000; background: rgba(0,0,0,0.65); color: #fff; padding: 6px 14px;
    border-radius: 16px; font-family: sans-serif; font-size: 13px; white-space: nowrap;
  }
</style>
</head>
<body>
<div id="map"></div>
<div class="hint" id="hint">${hasPin ? 'Drag the pin or tap to reposition' : 'Tap the map to place the pin'}</div>
<script>
  var send = function (payload) {
    var msg = JSON.stringify(Object.assign({ tag: '${MESSAGE_TAG}' }, payload));
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  };

  var map = L.map('map').setView([${centerLat}, ${centerLng}], ${zoom});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var marker = null;
  var reportPin = function (latlng) {
    send({ type: 'pin', lat: latlng.lat, lng: latlng.lng });
  };
  var placeMarker = function (latlng) {
    if (marker) {
      marker.setLatLng(latlng);
    } else {
      marker = L.marker(latlng, { draggable: true }).addTo(map);
      marker.on('dragend', function () { reportPin(marker.getLatLng()); });
      document.getElementById('hint').textContent = 'Drag the pin or tap to reposition';
    }
    reportPin(latlng);
  };

  ${hasPin ? `placeMarker(L.latLng(${lat}, ${lng}));` : ''}

  map.on('click', function (e) { placeMarker(e.latlng); });

  // Called by the host after a re-guess: move the pin and jump the view there.
  window.__setPin = function (lat, lng) {
    var latlng = L.latLng(lat, lng);
    placeMarker(latlng);
    map.setView(latlng, ${PIN_ZOOM});
  };

  send({ type: 'ready' });
</script>
</body>
</html>`;
}

export default function LocationPickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  addressLabel,
  onConfirm,
  onCancel,
  onReguess,
}: Props) {
  const initialLat = typeof initialLatitude === 'number' ? initialLatitude : null;
  const initialLng = typeof initialLongitude === 'number' ? initialLongitude : null;

  const [pin, setPin] = useState<PickedLocation | null>(null);
  const [reguessing, setReguessing] = useState(false);
  const [reguessMessage, setReguessMessage] = useState<string | null>(null);

  // Reset the working pin whenever the modal is (re)opened with new inputs.
  useEffect(() => {
    if (visible) {
      setPin(initialLat !== null && initialLng !== null
        ? { latitude: initialLat, longitude: initialLng }
        : null);
      setReguessing(false);
      setReguessMessage(null);
    }
  }, [visible, initialLat, initialLng]);

  const html = useMemo(
    () => buildMapHtml(initialLat, initialLng),
    [initialLat, initialLng]
  );

  const handleMessageData = useCallback((raw: string) => {
    try {
      const data = JSON.parse(raw);
      if (data?.tag !== MESSAGE_TAG) return;
      if (data.type === 'pin' && typeof data.lat === 'number' && typeof data.lng === 'number') {
        setPin({ latitude: data.lat, longitude: data.lng });
      }
    } catch (_) {
      // Not our message
    }
  }, []);

  // Web: listen for messages posted by the iframe.
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;
    const listener = (event: MessageEvent) => {
      if (typeof event.data === 'string') handleMessageData(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [visible, handleMessageData]);

  const iframeRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);

  // Move the pin inside the live map (used by re-guess) without rebuilding the HTML.
  const applyPinToMap = (loc: PickedLocation) => {
    setPin(loc);
    if (Platform.OS === 'web') {
      try {
        iframeRef.current?.contentWindow?.__setPin?.(loc.latitude, loc.longitude);
      } catch (e) {
        console.warn('LocationPickerModal: failed to move pin in iframe', e);
      }
    } else {
      webViewRef.current?.injectJavaScript?.(
        `window.__setPin && window.__setPin(${loc.latitude}, ${loc.longitude}); true;`
      );
    }
  };

  const handleReguess = async () => {
    if (!onReguess || reguessing) return;
    setReguessing(true);
    setReguessMessage(null);
    try {
      const hit = await onReguess();
      if (hit) {
        applyPinToMap(hit);
      } else {
        setReguessMessage('No match found — refine the address and try again, or place the pin by hand.');
      }
    } catch (e) {
      console.warn('LocationPickerModal: re-guess failed', e);
      setReguessMessage('Lookup failed — please try again.');
    } finally {
      setReguessing(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Set Location</ThemedText>
            {!!addressLabel && (
              <ThemedText style={styles.subtitle} numberOfLines={2}>{addressLabel}</ThemedText>
            )}
          </View>

          <View style={styles.mapContainer}>
            {Platform.OS === 'web' ? (
              React.createElement('iframe', {
                ref: iframeRef,
                srcDoc: html,
                style: { border: 'none', width: '100%', height: '100%' },
                title: 'Location picker map',
              })
            ) : (
              <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{ html }}
                onMessage={(event: any) => handleMessageData(event?.nativeEvent?.data)}
                javaScriptEnabled
                domStorageEnabled
                style={styles.webview}
              />
            )}
          </View>

          <View style={styles.footer}>
            <ThemedText style={styles.coordsText}>
              {reguessMessage
                ? reguessMessage
                : pin
                  ? `📍 ${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}`
                  : 'No pin placed yet'}
            </ThemedText>
            <View style={styles.buttonsRow}>
              <Pressable style={styles.cancelButton} onPress={onCancel}>
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </Pressable>
              {!!onReguess && (
                <Pressable
                  style={[styles.reguessButton, reguessing && styles.confirmButtonDisabled]}
                  disabled={reguessing}
                  onPress={handleReguess}
                >
                  <ThemedText style={styles.reguessButtonText}>
                    {reguessing ? 'Guessing…' : 'Re-guess'}
                  </ThemedText>
                </Pressable>
              )}
              <Pressable
                style={[styles.confirmButton, !pin && styles.confirmButtonDisabled]}
                disabled={!pin}
                onPress={() => pin && onConfirm(pin)}
              >
                <ThemedText style={styles.confirmButtonText}>Confirm Location</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 700,
    height: '85%',
    maxHeight: 700,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#eaeaea',
  },
  webview: {
    flex: 1,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  coordsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  reguessButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: '#eef3fb',
    alignItems: 'center',
  },
  reguessButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  confirmButton: {
    flex: 2,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#9ec3f7',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
