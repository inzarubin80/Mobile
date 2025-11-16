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
  Image,
} from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { launchImageLibrary, launchCamera, Asset } from "react-native-image-picker";
import Geolocation from "react-native-geolocation-service";
import { PermissionsAndroid, Platform } from "react-native";
import { createViolation, getViolationsByBbox } from "../lib/api";

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

      map.events.add('boundschange', function() {
        try {
          const c = map.getCenter();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'centerChanged', center: c }));
          const b = map.getBounds(); // [[lat1, lon1], [lat2, lon2]]
          if (b && b[0] && b[1]) {
            const sw = b[0], ne = b[1];
            const minLat = Math.min(sw[0], ne[0]);
            const maxLat = Math.max(sw[0], ne[0]);
            const minLng = Math.min(sw[1], ne[1]);
            const maxLng = Math.max(sw[1], ne[1]);
            const bbox = [minLng, minLat, maxLng, maxLat];
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'boundsChanged', bbox }));
          }
        } catch(e) {}
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
          if (msg.type === 'getCenter') {
            try {
              const c = map.getCenter();
              window.ReactNativeWebView.postMessage(JSON.stringify({ type:'centerChanged', center: c }));
            } catch(e) {}
          }
          if (msg.type === 'setCenter' && msg.coords) {
            map.setCenter(msg.coords, msg.zoom || map.getZoom());
          }
          if (msg.type === 'setViolations' && Array.isArray(msg.items)) {
            try {
              clusterer.removeAll();
              placemarks = {};
              msg.items.forEach(function(m) {
                const pm = createPlacemark(m.coords, m.iconUrl);
                placemarks[m.id] = pm;
                clusterer.add(pm);
              });
            } catch(e) {}
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
  const [mode, setMode] = useState<"idle" | "picking" | "details">("idle");
  const [center, setCenter] = useState<number[] | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPhotos, setDraftPhotos] = useState<Array<{ uri: string; name?: string; type?: string }>>([]);
  const [draftCoords, setDraftCoords] = useState<number[] | null>(null);
  const [lastBbox, setLastBbox] = useState<[number, number, number, number] | null>(null);

  const html = useMemo(() => createHtml(YANDEX_API_KEY), []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'centerChanged' && Array.isArray(data.center)) {
        setCenter(data.center);
      }
      if (data.type === 'boundsChanged' && Array.isArray(data.bbox) && data.bbox.length === 4) {
        const bbox: [number, number, number, number] = [data.bbox[0], data.bbox[1], data.bbox[2], data.bbox[3]];
        setLastBbox(bbox);
        // fire-and-forget load
        loadViolations(bbox);
      }
    } catch {}
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

  // Problem flow actions
  const startAddProblem = () => {
    setMode("picking");
    postMessage({ type: "getCenter" });
  };
  const confirmPicking = () => {
    setDraftCoords(center || null);
    setMode("details");
  };
  const cancelPicking = () => setMode("idle");

  const ensureLocationPermission = async () => {
    if (Platform.OS !== "android") return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: "Доступ к местоположению",
        message: "Нужен доступ к точному местоположению для установки точки на карте",
        buttonPositive: "OK",
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const locateMe = async () => {
    try {
      const ok = await ensureLocationPermission();
      if (!ok) {
        Alert.alert("Нет доступа", "Разрешите доступ к геолокации в настройках");
        return;
      }
      Geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (accuracy && accuracy > 100) {
            Alert.alert("Низкая точность", `Точность ${Math.round(accuracy)}м. Попробуйте ещё раз.`);
          }
          const coords: number[] = [latitude, longitude];
          postMessage({ type: "setCenter", coords, zoom: 18 });
          setCenter(coords);
        },
        (err) => {
          Alert.alert("Ошибка геолокации", err?.message || "Не удалось получить координаты");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || String(e));
    }
  };

  const addPhoto = async () => {
    const res = await launchImageLibrary({ mediaType: "photo", selectionLimit: 5 });
    if (res?.assets?.length) {
      const items = res.assets
        .filter((a: Asset) => !!a.uri)
        .map((a: Asset) => ({ uri: a.uri!, name: a.fileName || undefined, type: a.type || undefined }));
      setDraftPhotos(prev => [...prev, ...items]);
    }
  };

  const ensureCameraPermission = async () => {
    if (Platform.OS !== "android") return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: "Доступ к камере",
        message: "Нужен доступ к камере для съемки фото",
        buttonPositive: "OK",
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const addPhotoFromCamera = async () => {
    const ok = await ensureCameraPermission();
    if (!ok) {
      Alert.alert("Нет доступа", "Разрешите доступ к камере в настройках");
      return;
    }
    const res = await launchCamera({
      mediaType: "photo",
      cameraType: "back",
      quality: 0.8,
      saveToPhotos: true,
    });
    if (res?.assets?.length) {
      const items = res.assets
        .filter((a: Asset) => !!a.uri)
        .map((a: Asset) => ({ uri: a.uri!, name: a.fileName || undefined, type: a.type || undefined }));
      setDraftPhotos(prev => [...prev, ...items]);
    }
  };
  const removePhoto = (uri: string) => setDraftPhotos(prev => prev.filter(p => p.uri !== uri));

  const submitProblem = async () => {
    if (!draftCoords) { Alert.alert("Выберите место на карте"); return; }
    if (!draftDescription.trim()) { Alert.alert("Добавьте описание"); return; }
    try {
      const [lat, lng] = draftCoords;
      await createViolation({
        type: "garbage",
        description: draftDescription.trim(),
        lat,
        lng,
        photos: draftPhotos,
      });
      // Refresh violations for current bbox
      if (lastBbox) {
        await loadViolations(lastBbox);
      } else {
        postMessage({ type: "getCenter" });
      }
      setDraftDescription("");
      setDraftPhotos([]);
      setDraftCoords(null);
      setMode("idle");
      Alert.alert("Отправлено", "Проблема создана");
    } catch (e: any) {
      Alert.alert("Ошибка отправки", e?.message || String(e));
    }
  };

  const loadViolations = async (bbox: [number, number, number, number]) => {
    try {
      const resp = await getViolationsByBbox(bbox);
      const items = (resp.items || []).map(v => ({
        id: v.id,
        coords: [v.lat, v.lng],
      }));
      postMessage({ type: "setViolations", items });
    } catch (e) {
      // ignore network errors here; user can retry by panning
    }
  };

  // Убраны вспомогательные демо-действия с маркерами

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

      {/* FAB */}
      {mode === "idle" && (
        <TouchableOpacity onPress={startAddProblem} style={styles.fab}>
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700" }}>＋</Text>
        </TouchableOpacity>
      )}

      {/* Picking overlay */}
      {mode === "picking" && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={styles.crosshair} />
          <View style={styles.bottomBar}>
            <Text style={{ fontWeight: "600" }}>
              {center ? `${center[0].toFixed(5)}, ${center[1].toFixed(5)}` : "..."}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ marginRight: 12 }}>
                <Button title="Моё место" onPress={locateMe} />
              </View>
              <View style={{ marginRight: 12 }}>
                <Button title="Отмена" onPress={cancelPicking} />
              </View>
              <View>
                <Button title="Подтвердить" onPress={confirmPicking} />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Убраны демо-кнопки и список маркеров */}

      {/* Details modal */}
      <Modal visible={mode === "details"} animationType="slide" onRequestClose={() => setMode("idle")}>
        <View style={{ flex: 1, padding: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Новая проблема</Text>
          <Text style={{ color: "#666", marginBottom: 8 }}>
            Координаты: {draftCoords ? `${draftCoords[0].toFixed(5)}, ${draftCoords[1].toFixed(5)}` : "не выбрано"}
          </Text>
          <Text style={{ fontWeight: '600', marginBottom: 6 }}>Описание</Text>
          <TextInput
            multiline
            value={draftDescription}
            onChangeText={setDraftDescription}
            placeholder="Например: незаконная свалка в лесу"
            style={{ height: 120, borderWidth: 1, borderColor: '#ccc', padding: 8, borderRadius: 6, marginBottom: 12 }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontWeight: '600' }}>Фотографии ({draftPhotos.length})</Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ marginRight: 8 }}>
                <Button title="Сделать фото" onPress={addPhotoFromCamera} />
              </View>
              <Button title="Галерея" onPress={addPhoto} />
            </View>
          </View>
          <FlatList
            horizontal
            data={draftPhotos}
            keyExtractor={(i) => i.uri}
            renderItem={({ item }) => (
              <View style={{ marginRight: 8, alignItems: 'center' }}>
                <Image source={{ uri: item.uri }} style={{ width: 96, height: 96, borderRadius: 6, backgroundColor: '#eee' }} />
                <TouchableOpacity onPress={() => removePhoto(item.uri)}>
                  <Text style={{ color: '#d00', marginTop: 4 }}>Удалить</Text>
                </TouchableOpacity>
              </View>
            )}
            style={{ marginBottom: 16 }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Button title="Изменить на карте" onPress={() => setMode("picking")} />
            <Button title="Отправить" onPress={submitProblem} />
          </View>
        </View>
      </Modal>

      {/* Убран модал экспорта/импорта */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  crosshair: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderWidth: 2,
    borderColor: '#007aff',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controls: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: 'transparent',
    flexDirection: 'column',
  },
  controlsRow: { position: 'absolute', left: 12, top: 12, flexDirection: 'row' },
  markerList: { position: 'absolute', left: 12, bottom: 12, width: 260, maxHeight: 260, backgroundColor: 'rgba(255,255,255,0.9)', padding: 8, borderRadius: 6 },
  markerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
});



