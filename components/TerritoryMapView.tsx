import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { PROXIMITY_METERS } from '../services/territoryService';

// Native-only WebView (web uses an iframe)
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

const MESSAGE_TAG = 'guvnor-territory-map';

export type TerritoryClientPin = {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address: string;
};

export type TerritoryActivityLayer = {
  id: string;
  colour: string;
  label: string; // e.g. "Canvassing · Tue 21 Oct · travis@…"
  points: { lat: number; lng: number }[];
  /** clientId -> time visited (ISO) */
  visited: Record<string, string>;
};

export type TerritoryLiveState = {
  lat: number;
  lng: number;
  accuracy?: number;
  colour: string;
  points: { lat: number; lng: number }[];
  visited: Record<string, string>;
};

export type TerritoryMapState = {
  clients: TerritoryClientPin[];
  activities: TerritoryActivityLayer[];
  live: TerritoryLiveState | null;
};

/** JSON safe to embed inside a <script> block. */
const embedJson = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

function buildHtml(initial: TerritoryMapState): string {
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
  .popup-meta { font-size: 12px; color: #2e7d32; margin-top: 4px; font-weight: 600; }
  .legend {
    position: absolute; right: 10px; bottom: 24px; z-index: 1000;
    background: rgba(255,255,255,0.92); border-radius: 8px; padding: 6px 10px;
    font: 12px/1.5 sans-serif; color: #333; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  .legend .row { display: flex; align-items: center; gap: 6px; }
  .legend .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; border: 1.5px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.25); }
</style>
</head>
<body>
<div id="map"></div>
<div class="legend">
  <div class="row"><span class="dot" style="background:#1565c0"></span>Customer</div>
  <div class="row"><span class="dot" style="background:#2e7d32"></span>Visited by an activity</div>
  <div class="row"><span class="dot" style="background:#f57c00;opacity:.45;border-color:transparent"></span>Ground covered</div>
</div>
<script>
  var PROX = ${PROXIMITY_METERS};
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
  var fmtWhen = function (iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) +
        ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  };

  // Canvas renderer: thousands of small circles stay smooth.
  var map = L.map('map', { preferCanvas: true });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  var coverageLayer = L.layerGroup().addTo(map);   // shaded ground per activity
  var clientLayer = L.layerGroup().addTo(map);     // discreet customer dots (on top of coverage)
  var liveLayer = L.layerGroup().addTo(map);

  var clientMarkers = {};  // id -> circleMarker
  var clientData = {};     // id -> pin
  var fitted = false;
  var liveZoomed = false;

  var baseStyle = { radius: 4, color: '#ffffff', weight: 1.5, fillColor: '#1565c0', fillOpacity: 0.95 };
  var visitedStyle = { radius: 6, color: '#ffffff', weight: 1.5, fillColor: '#2e7d32', fillOpacity: 1 };

  var popupHtml = function (pin, visits) {
    var html = '<div>' +
      (pin.name ? '<div class="popup-name">' + escapeHtml(pin.name) + '</div>' : '') +
      '<div class="popup-line">' + escapeHtml(pin.address) + '</div>';
    for (var i = 0; i < visits.length; i++) {
      html += '<div class="popup-meta">Visited ' + escapeHtml(fmtWhen(visits[i].at)) +
        (visits[i].label ? ' · ' + escapeHtml(visits[i].label) : '') + '</div>';
    }
    return html + '</div>';
  };

  var upsertClient = function (pin) {
    clientData[pin.id] = pin;
    var m = clientMarkers[pin.id];
    if (m) {
      m.setLatLng([pin.lat, pin.lng]);
    } else {
      m = L.circleMarker([pin.lat, pin.lng], baseStyle);
      m.bindPopup('');
      clientLayer.addLayer(m);
      clientMarkers[pin.id] = m;
    }
  };

  var render = function (state) {
    // Clients
    var seen = {};
    for (var i = 0; i < state.clients.length; i++) { upsertClient(state.clients[i]); seen[state.clients[i].id] = true; }
    Object.keys(clientMarkers).forEach(function (id) {
      if (!seen[id]) { clientLayer.removeLayer(clientMarkers[id]); delete clientMarkers[id]; delete clientData[id]; }
    });

    // Visits: id -> [{at,label}]
    var visits = {};
    var addVisits = function (visited, label) {
      Object.keys(visited || {}).forEach(function (id) {
        (visits[id] = visits[id] || []).push({ at: visited[id], label: label });
      });
    };
    for (var a = 0; a < state.activities.length; a++) addVisits(state.activities[a].visited, state.activities[a].label);
    if (state.live) addVisits(state.live.visited, 'this activity');

    Object.keys(clientMarkers).forEach(function (id) {
      var v = visits[id] || [];
      var m = clientMarkers[id];
      m.setStyle(v.length ? visitedStyle : baseStyle);
      if (v.length) m.bringToFront();
      m.setPopupContent(popupHtml(clientData[id], v));
    });

    // Coverage: a soft disc around each sampled position, no connecting line.
    coverageLayer.clearLayers();
    var drawCoverage = function (points, colour, opacity) {
      for (var p = 0; p < points.length; p++) {
        coverageLayer.addLayer(L.circle([points[p].lat, points[p].lng], {
          radius: PROX, stroke: false, fillColor: colour, fillOpacity: opacity, interactive: false
        }));
      }
    };
    for (var b = 0; b < state.activities.length; b++) drawCoverage(state.activities[b].points, state.activities[b].colour, 0.16);
    if (state.live) drawCoverage(state.live.points, state.live.colour, 0.22);

    // Live position
    liveLayer.clearLayers();
    if (state.live) {
      if (state.live.accuracy && state.live.accuracy > 5) {
        liveLayer.addLayer(L.circle([state.live.lat, state.live.lng], {
          radius: state.live.accuracy, color: '#1976d2', weight: 1, fillColor: '#1976d2', fillOpacity: 0.08, interactive: false
        }));
      }
      liveLayer.addLayer(L.circleMarker([state.live.lat, state.live.lng], {
        radius: 8, color: '#ffffff', weight: 3, fillColor: '#1976d2', fillOpacity: 1, interactive: false
      }));
      if (!liveZoomed) { map.setView([state.live.lat, state.live.lng], 17); liveZoomed = true; fitted = true; }
      else if (state.follow) { map.panTo([state.live.lat, state.live.lng], { animate: true }); }
    } else {
      liveZoomed = false;
    }

    if (!fitted) {
      var all = [];
      Object.keys(clientMarkers).forEach(function (id) { all.push(clientMarkers[id].getLatLng()); });
      for (var c = 0; c < state.activities.length; c++) for (var q = 0; q < state.activities[c].points.length; q++) all.push(L.latLng(state.activities[c].points[q].lat, state.activities[c].points[q].lng));
      if (all.length > 0) { map.fitBounds(L.latLngBounds(all).pad(0.05)); fitted = true; }
      else { map.setView([54.093, -2.894], 6); }
    }
  };

  window.__applyState = function (state) { try { render(state); } catch (e) { send({ type: 'error', message: String(e && e.message || e) }); } };
  window.__fitActivities = function (state) {
    var all = [];
    for (var c = 0; c < state.activities.length; c++) for (var q = 0; q < state.activities[c].points.length; q++) all.push(L.latLng(state.activities[c].points[q].lat, state.activities[c].points[q].lng));
    if (all.length > 0) map.fitBounds(L.latLngBounds(all).pad(0.1));
  };

  window.__applyState(${embedJson(initial)});
  send({ type: 'ready' });
</script>
</body>
</html>`;
}

type Props = {
  state: TerritoryMapState;
  /** Keep the map centred on the live position as it moves. */
  follow?: boolean;
};

export default function TerritoryMapView({ state, follow = true }: Props) {
  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  // Build the HTML once per mount; later changes go through __applyState so the viewport survives.
  const initialHtmlRef = useRef<string | null>(null);
  if (initialHtmlRef.current === null) {
    initialHtmlRef.current = buildHtml(state);
  }

  const push = (payload: TerritoryMapState & { follow: boolean }) => {
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    if (!readyRef.current) {
      pendingRef.current = json;
      return;
    }
    if (Platform.OS === 'web') {
      try {
        iframeRef.current?.contentWindow?.__applyState?.(payload);
      } catch (e) {
        console.warn('TerritoryMapView: failed to push state to iframe', e);
      }
    } else {
      webViewRef.current?.injectJavaScript?.(`window.__applyState && window.__applyState(${json}); true;`);
    }
  };

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    push({ ...state, follow });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, follow]);

  const handleMessageData = (raw: string) => {
    try {
      const data = JSON.parse(raw);
      if (data?.tag !== MESSAGE_TAG) return;
      if (data.type === 'ready') {
        readyRef.current = true;
        if (pendingRef.current) {
          const payload = JSON.parse(pendingRef.current);
          pendingRef.current = null;
          push(payload);
        }
      } else if (data.type === 'error') {
        console.warn('TerritoryMapView (map script):', data.message);
      }
    } catch (_) {
      // Not our message
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const listener = (event: MessageEvent) => {
      if (typeof event.data === 'string') handleMessageData(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        React.createElement('iframe', {
          ref: iframeRef,
          srcDoc: initialHtmlRef.current,
          style: { border: 'none', width: '100%', height: '100%', display: 'block' },
          title: 'Territory map',
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
    ...(Platform.OS === 'web' ? ({ height: '100%' } as any) : {}),
  },
  webview: {
    flex: 1,
  },
});
