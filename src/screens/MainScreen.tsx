import React, { useRef, useCallback, useState, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

// TODO: замените на ваш Yandex Maps JS API ключ
const YANDEX_API_KEY = "REPLACE_WITH_YOUR_YANDEX_JS_API_KEY";

const createHtml = (apiKey: string) => `<!doctype html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1.0, user-scalable=no" />
  <style>html,body,#map{width:100%;height:100%;margin:0;padding:0}</style>
  <script src="https://api-maps.yandex.ru/2.1/?lang=ru_RU&apikey=${apiKey}"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    ymaps.ready(init);
    let map, placemarks = {}, clusterer;

    function init() {
      map = new ymaps.Map('map', { center: [55.751244, 37.618423], zoom: 10 });
      clusterer = new ymaps.Clusterer({ clusterDisableClickZoom: true });
      map.geoObjects.add(clusterer);

      map.events.add('click', function(e) {
        const coords = e.get('coords'); // [lat, lon]
        const id = 'm_' + Date.now();
        const pm = createPlacemark(coords);
        placemarks[id] = pm;
        clusterer.add(pm);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'markerAdded', id, coords }));
      });

      function createPlacemark(coords, iconUrl) {
        if (iconUrl) {
          return new ymaps.Placemark(coords, {}, {
            iconLayout: 'default#image',
            iconImageHref: iconUrl,
            iconImageSize: [32, 32],
            iconImageOffset: [-16, -16]
          });
        }
        return new ymaps.Placemark(coords, {}, { preset: 'islands#redDotIcon' });
      }

      function handleMessage(msgStr) {
        try {
          const msg = JSON.parse(msgStr);
          if (msg.type === 'addMarker') {
            const id = msg.id ?? ('m_' + Date.now());
            const pm = createPlacemark(msg.coords, msg.iconUrl);
            placemarks[id] = pm;
            clusterer.add(pm);
            window.ReactNativeWebView.postMessage(JSON.stringify({ type:'markerAdded', id, coords: msg.coords }));
          }
          if (msg.type === 'removeMarker' && placemarks[msg.id]) {
            clusterer.remove(placemarks[msg.id]); delete placemarks[msg.id];
            window.ReactNativeWebView.postMessage(JSON.stringify({ type:'markerRemoved', id: msg.id }));
          }
          if (msg.type === 'getAllMarkers') {
            const all = Object.entries(placemarks).map(([id, pm]) => ({ id, coords: pm.geometry.getCoordinates() }));
            window.ReactNativeWebView.postMessage(JSON.stringify({ type:'allMarkers', markers: all }));
          }
          if (msg.type === 'setCenter' && msg.coords) {
            map.setCenter(msg.coords, msg.zoom || map.getZoom());
          }
          if (msg.type === 'clearAll') {
            clusterer.removeAll(); placemarks = {}; window.ReactNativeWebView.postMessage(JSON.stringify({ type:'cleared' }));
          }
          if (msg.type === 'importMarkers' && Array.isArray(msg.markers)) {
            msg.markers.forEach(m => {
              const id = m.id ?? ('m_' + Date.now());
              const pm = createPlacemark(m.coords, m.iconUrl);
              placemarks[id] = pm; clusterer.add(pm);
            });
            window.ReactNativeWebView.postMessage(JSON.stringify({ type:'imported', count: msg.markers.length }));
          }
        } catch(e){}
      }

      document.addEventListener('message', e => handleMessage(e.data)); // Android
      window.addEventListener('message', e => handleMessage(e.data));   // iOS
    }
  </script>
</body>
</html>`;

export default function MainScreen() {
  const webviewRef = useRef<WebView | null>(null);
  const [markers, setMarkers] = useState<Array<{ id: string; coords: number[] }>>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [importJson, setImportJson] = useState("");

  const html = useMemo(() => createHtml(YANDEX_API_KEY), []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'markerAdded') {
        setMarkers(prev => {
          if (prev.find(m => m.id === data.id)) return prev;
          return [...prev, { id: data.id, coords: data.coords }];
        });
      }
      if (data.type === 'markerRemoved') {
        setMarkers(prev => prev.filter(m => m.id !== data.id));
      }
      if (data.type === 'allMarkers') {
        setMarkers(data.markers || []);
      }
      if (data.type === 'cleared') {
        setMarkers([]);
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const postMessage = useCallback((msg: any) => {
    const json = JSON.stringify(msg);
    webviewRef.current?.postMessage(json);
  }, []);

  // RN actions
  const addMarkerFromRN = () => postMessage({ type: 'addMarker', coords: [55.76, 37.64] });
  const getAllMarkers = () => postMessage({ type: 'getAllMarkers' });
  const clearAll = () => postMessage({ type: 'clearAll' });
  const centerOn = (coords: number[]) => postMessage({ type: 'setCenter', coords });
  const removeMarker = (id: string) => postMessage({ type: 'removeMarker', id });

  // Export / Import
  const exportMarkers = () => {
    const json = JSON.stringify(markers, null, 2);
    // show modal with json for copy
    setImportJson(json);
    setModalVisible(true);
  };

  const importMarkers = () => {
    try {
      const parsed = JSON.parse(importJson);
      if (!Array.isArray(parsed)) throw new Error('expected array');
      postMessage({ type: 'importMarkers', markers: parsed });
      // merge into RN state after import
      setMarkers(prev => {
        const ids = new Set(prev.map(p => p.id));
        const toAdd = parsed.filter((m: any) => !ids.has(m.id)).map((m: any) => ({ id: m.id ?? 'm_' + Date.now(), coords: m.coords }));
        return [...prev, ...toAdd];
      });
      Alert.alert('Imported', `Imported ${parsed.length} markers`);
    } catch (err: any) {
      Alert.alert('Import error', err.message || 'Invalid JSON');
    }
  };

  // Server sync (simple fetch example)
  const SERVER_URL = 'https://example.com/api/markers'; // replace
  const uploadMarkers = async () => {
    try {
      await fetch(SERVER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(markers) });
      Alert.alert('Upload', 'Markers uploaded');
    } catch (err: any) { Alert.alert('Upload error', err.message || ''); }
  };
  const downloadMarkers = async () => {
    try {
      const res = await fetch(SERVER_URL);
      const data = await res.json();
      if (Array.isArray(data)) {
        postMessage({ type: 'importMarkers', markers: data });
        setMarkers(data.map((m: any) => ({ id: m.id ?? 'm_' + Date.now(), coords: m.coords })));
      }
    } catch (err: any) { Alert.alert('Download error', err.message || ''); }
  };

  // WebSocket example
  useEffect(() => {
    const ws = new WebSocket('wss://example.com/markers');
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'markersUpdate' && Array.isArray(msg.markers)) {
          postMessage({ type: 'importMarkers', markers: msg.markers });
          setMarkers(msg.markers.map((m: any) => ({ id: m.id ?? 'm_' + Date.now(), coords: m.coords })));
        }
      } catch {}
    };
    ws.onerror = () => {};
    return () => { ws.close(); };
  }, [postMessage]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
      />

      <View style={styles.controlsRow}>
        <Button title="Add RN" onPress={addMarkerFromRN} />
        <Button title="Get all" onPress={getAllMarkers} />
        <Button title="Clear" onPress={clearAll} />
        <Button title="Export" onPress={exportMarkers} />
      </View>

      <View style={styles.controlsRow}> 
        <Button title="Upload" onPress={uploadMarkers} />
        <Button title="Download" onPress={downloadMarkers} />
      </View>

      <View style={styles.markerList}>
        <Text style={{ fontWeight: '600', marginBottom: 6 }}>Markers ({markers.length})</Text>
        <FlatList
          data={markers}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.markerItem}>
              <TouchableOpacity onPress={() => centerOn(item.coords)} style={{ flex: 1 }}>
                <Text>{item.id}</Text>
                <Text>{item.coords[0].toFixed(5)}, {item.coords[1].toFixed(5)}</Text>
              </TouchableOpacity>
              <Button title="Del" onPress={() => removeMarker(item.id)} />
            </View>
          )}
        />
      </View>

      <Modal visible={modalVisible} animationType="slide">
        <View style={{ flex: 1, padding: 12 }}>
          <Text style={{ fontWeight: '600', marginBottom: 8 }}>Export / Import JSON</Text>
          <TextInput
            multiline
            value={importJson}
            onChangeText={setImportJson}
            style={{ flex: 1, borderWidth: 1, borderColor: '#ccc', padding: 8 }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Button title="Import" onPress={importMarkers} />
            <Button title="Close" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  controls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'transparent',
    flexDirection: 'column',
  },
  controlsRow: { position: 'absolute', left: 12, top: 12, flexDirection: 'row', gap: 8 },
  markerList: { position: 'absolute', left: 12, bottom: 12, width: 260, maxHeight: 260, backgroundColor: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 6 },
  markerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
});



