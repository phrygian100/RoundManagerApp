import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { Client } from '../types/client';

// Native-only WebView (web uses an iframe)
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const MESSAGE_TAG = 'guvnor-client-map';

// Pin colours by provenance: human-confirmed vs automated guesses.
const PIN_COLORS: Record<string, string> = {
  manual: '#2e7d32', // green — human confirmed
  postcode: '#ef6c00', // amber — postcode centroid guess
  address: '#1565c0', // blue — address search guess
  unknown: '#616161',
};

type MapPin = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address: string;
  cost: string;
  interval: string;
  position: string;
  source: string;
};

const clientDisplayAddress = (c: Client): string => {
  const parts = [c.address1, c.town, c.postcode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : (c.address || 'No address');
};

const formatInterval = (frequency: Client['frequency']): string => {
  if (frequency === undefined || frequency === null || frequency === '') return '';
  if (typeof frequency === 'string' && /^one[- ]?off$/i.test(frequency)) return 'One-off';
  const weeks = Number(frequency);
  if (Number.isFinite(weeks) && weeks > 0) {
    return weeks === 1 ? 'Every week' : `Every ${weeks} weeks`;
  }
  return String(frequency);
};

const toPin = (c: Client): MapPin => ({
  id: c.id,
  lat: c.latitude as number,
  lng: c.longitude as number,
  name: c.name || '',
  address: clientDisplayAddress(c),
  cost: typeof c.quote === 'number' ? `£${c.quote}` : '',
  interval: formatInterval(c.frequency),
  position: typeof c.roundOrderNumber === 'number' ? `#${c.roundOrderNumber}` : '',
  source: c.geoSource || 'unknown',
});

const hasPin = (c: Client) => typeof c.latitude === 'number' && typeof c.longitude === 'number';

/** JSON safe to embed inside a <script> block. */
const embedJson = (value: unknown): string =>
  JSON.stringify(value).replace(/</g, '\\u003c');

function buildClientMapHtml(pins: MapPin[]): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  .popup-name { font-weight: bold; font-size: 14px; margin-bottom: 2px; }
  .popup-line { font-size: 13px; color: #333; margin-bottom: 2px; }
  .popup-meta { font-size: 12px; color: #777; margin-bottom: 6px; }
  .popup-edit {
    display: block; width: 100%; box-sizing: border-box; text-align: center;
    background: #007AFF; color: #fff; border: none; border-radius: 6px;
    padding: 7px 10px; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .legend {
    position: absolute; bottom: 14px; left: 10px; z-index: 1000;
    background: rgba(255,255,255,0.92); border-radius: 8px; padding: 8px 12px;
    font-family: sans-serif; font-size: 12px; color: #333;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  .legend .dot { display: inline-block; width: 10px; height: 10px; border-radius: 5px; margin-right: 6px; }
</style>
</head>
<body>
<div id="map"></div>
<div class="legend">
  <div><span class="dot" style="background:${PIN_COLORS.manual}"></span>Confirmed</div>
  <div><span class="dot" style="background:${PIN_COLORS.postcode}"></span>Postcode guess</div>
  <div><span class="dot" style="background:${PIN_COLORS.address}"></span>Address guess</div>
</div>
<script>
  var COLORS = ${embedJson(PIN_COLORS)};

  var send = function (payload) {
    var msg = JSON.stringify(Object.assign({ tag: '${MESSAGE_TAG}' }, payload));
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  };

  var escapeHtml = function (s) {
    return String(s || '').replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  window.__editClient = function (id) { send({ type: 'edit', id: id }); };

  var map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var markers = {}; // client id -> circleMarker

  var popupHtml = function (pin) {
    return '<div>' +
      (pin.name ? '<div class="popup-name">' + escapeHtml(pin.name) + '</div>' : '') +
      '<div class="popup-line">' + escapeHtml(pin.address) + '</div>' +
      '<div class="popup-line">' +
        (pin.cost ? escapeHtml(pin.cost) : '') +
        (pin.cost && pin.interval ? ' · ' : '') +
        (pin.interval ? escapeHtml(pin.interval) : '') +
      '</div>' +
      (pin.position ? '<div class="popup-meta">Round position ' + escapeHtml(pin.position) + '</div>' : '') +
      '<button class="popup-edit" onclick="__editClient(\\'' + pin.id + '\\')">Edit location</button>' +
    '</div>';
  };

  var upsertPin = function (pin) {
    var color = COLORS[pin.source] || COLORS.unknown;
    var existing = markers[pin.id];
    if (existing) {
      existing.setLatLng([pin.lat, pin.lng]);
      existing.setStyle({ color: color, fillColor: color });
      existing.setPopupContent(popupHtml(pin));
    } else {
      var m = L.circleMarker([pin.lat, pin.lng], {
        radius: 8, weight: 2, color: color, fillColor: color, fillOpacity: 0.75
      }).addTo(map);
      m.bindPopup(popupHtml(pin));
      markers[pin.id] = m;
    }
  };

  // Applied after an edit so the marker moves without reloading (preserves the viewport).
  window.__applyPins = function (pins) {
    for (var i = 0; i < pins.length; i++) upsertPin(pins[i]);
  };

  var initialPins = ${embedJson(pins)};
  window.__applyPins(initialPins);

  if (initialPins.length > 0) {
    var group = L.featureGroup(Object.keys(markers).map(function (k) { return markers[k]; }));
    map.fitBounds(group.getBounds().pad(0.05));
  } else {
    map.setView([54.093, -2.894], 6);
  }

  send({ type: 'ready' });
</script>
</body>
</html>`;
}

type Props = {
  /** All clients to show; ones without coordinates are ignored here (surface them outside the map). */
  clients: Client[];
  /** Fired when the user taps "Edit location" in a pin popup. */
  onEditLocation: (clientId: string) => void;
};

export default function ClientMapView({ clients, onEditLocation }: Props) {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);

  // Build the HTML once per mount so pin edits don't reload the map and lose the viewport;
  // subsequent client changes are pushed into the live map via __applyPins.
  const initialHtmlRef = useRef<string | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = buildClientMapHtml(clients.filter(hasPin).map(toPin));
  }

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const pins = clients.filter(hasPin).map(toPin);
    const json = JSON.stringify(pins).replace(/</g, '\\u003c');
    if (Platform.OS === 'web') {
      try {
        iframeRef.current?.contentWindow?.__applyPins?.(pins);
      } catch (e) {
        console.warn('ClientMapView: failed to push pin updates to iframe', e);
      }
    } else {
      webViewRef.current?.injectJavaScript?.(
        `window.__applyPins && window.__applyPins(${json}); true;`
      );
    }
  }, [clients]);

  const handleMessageData = (raw: string) => {
    try {
      const data = JSON.parse(raw);
      if (data?.tag !== MESSAGE_TAG) return;
      if (data.type === 'edit' && typeof data.id === 'string') {
        onEditLocation(data.id);
      }
    } catch (_) {
      // Not our message
    }
  };

  // Web: listen for messages from the iframe.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: MessageEvent) => {
      if (typeof event.data === 'string') handleMessageData(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEditLocation]);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        React.createElement('iframe', {
          ref: iframeRef,
          srcDoc: initialHtmlRef.current,
          // display:block + explicit 100% height: iframes default to 150px tall when
          // percentage heights fail to resolve, which wrecks the layout.
          style: { border: 'none', width: '100%', height: '100%', display: 'block' },
          title: 'Client map',
        })
      ) : (
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: initialHtmlRef.current }}
          onMessage={(event: any) => handleMessageData(event?.nativeEvent?.data)}
          javaScriptEnabled
          domStorageEnabled
          style={styles.webview}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eaeaea',
    // Web: fill the parent's explicit height directly rather than relying on flex
    // resolution through the RN-web wrapper (the iframe needs a definite ancestor height).
    ...(Platform.OS === 'web' ? ({ height: '100%' } as any) : {}),
  },
  webview: {
    flex: 1,
  },
});
