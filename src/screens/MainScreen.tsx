import React, { useRef, useCallback, useState, useMemo } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Button, Alert } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import Geolocation from "react-native-geolocation-service";
import { PermissionsAndroid, Platform } from "react-native";
import { getViolationsByBbox } from "../lib/api";
import type { Violation } from "../types/api";

// TODO: замените на ваш Yandex Maps JS API ключ
const YANDEX_API_KEY = "REPLACE_WITH_YOUR_YANDEX_JS_API_KEY";

// HTML для встроенной карты Yandex Maps
const createMapHtml = (apiKey: string) => `<!doctype html>
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
    let map, placemarks = {};

    function init() {
      map = new ymaps.Map('map', { center: [55.751244, 37.618423], zoom: 10 });

      // Отслеживание изменений видимой области карты
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

      // Обработка сообщений от React Native
      function handleMessage(msgStr) {
        try {
          const msg = JSON.parse(msgStr);
          
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
              // Удаляем все существующие маркеры
              Object.values(placemarks).forEach(function(pm) {
                map.geoObjects.remove(pm);
              });
              placemarks = {};
              
              // Добавляем новые маркеры напрямую на карту
              msg.items.forEach(function(m) {
                const pm = createPlacemark(m.coords, m.iconUrl);
                placemarks[m.id] = pm;
                map.geoObjects.add(pm);
                pm.events.add('click', function() {
                  window.ReactNativeWebView.postMessage(JSON.stringify({ type:'markerClicked', id: m.id }));
                });
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

type ScreenMode = "idle" | "picking";

export default function MainScreen() {
  const navigation = useNavigation<any>();
  const webviewRef = useRef<WebView | null>(null);

  // Состояние экрана
  const [mode, setMode] = useState<ScreenMode>("idle");
  
  // Состояние карты
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null); // [lat, lng]
  const [currentBbox, setCurrentBbox] = useState<[number, number, number, number] | null>(null); // [minLng, minLat, maxLng, maxLat]
  const [violations, setViolations] = useState<Violation[]>([]);

  const mapHtml = useMemo(() => createMapHtml(YANDEX_API_KEY), []);

  // Отправка сообщения в WebView
  const sendToMap = useCallback((msg: any) => {
    const json = JSON.stringify(msg);
    webviewRef.current?.postMessage(json);
  }, []);

  // Загрузка нарушений для видимой области карты
  const loadViolations = useCallback(async (bbox: [number, number, number, number]) => {
    try {
      const resp = await getViolationsByBbox(bbox);
      setViolations(resp.items || []);

      // Отправляем маркеры на карту
      const markers = (resp.items || []).map(v => ({
        id: v.id,
        coords: [v.lat, v.lng] as [number, number],
        iconUrl: v.photos && v.photos.length > 0 ? (v.photos[0].thumb_url || v.photos[0].url) : undefined,
      }));
      sendToMap({ type: "setViolations", items: markers });
    } catch (e) {
      // Игнорируем ошибки сети - пользователь может повторить, переместив карту
    }
  }, [sendToMap]);

  // Обработка сообщений от карты
  const handleMapMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'centerChanged' && Array.isArray(data.center)) {
        // data.center = [lat, lng]
        setMapCenter([data.center[0], data.center[1]]);
      }

      if (data.type === 'boundsChanged' && Array.isArray(data.bbox) && data.bbox.length === 4) {
        // data.bbox = [minLng, minLat, maxLng, maxLat]
        const bbox: [number, number, number, number] = [data.bbox[0], data.bbox[1], data.bbox[2], data.bbox[3]];
        setCurrentBbox(bbox);
        loadViolations(bbox);
      }

      if (data.type === 'markerClicked' && data.id) {
        const violation = violations.find(v => v.id === String(data.id));
        if (violation) {
          navigation.navigate("ViolationDetails", { violation });
        }
      }
    } catch (e) {
      // failed to parse map message - silent
    }
  }, [violations, navigation, loadViolations]);

  // Обновление нарушений при возврате на экран
  useFocusEffect(
    useCallback(() => {
      if (currentBbox) {
        loadViolations(currentBbox);
      }
    }, [currentBbox, loadViolations])
  );

  // ========== Действия для создания проблемы ==========

  const startAddingProblem = useCallback(() => {
    setMode("picking");
    sendToMap({ type: "getCenter" });
  }, [sendToMap]);

  const confirmLocation = useCallback(() => {
    if (mapCenter) {
      setMode("idle");
      navigation.navigate("AddViolation", {
        initialCoords: mapCenter,
      });
    }
  }, [mapCenter, navigation]);

  const cancelLocationPicking = useCallback(() => {
    setMode("idle");
  }, []);

  // ========== Геолокация ==========

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
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
  }, []);

  const moveToMyLocation = useCallback(async () => {
    try {
      const hasPermission = await requestLocationPermission();
      if (!hasPermission) {
        Alert.alert("Нет доступа", "Разрешите доступ к геолокации в настройках");
        return;
      }

      Geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (accuracy && accuracy > 100) {
            Alert.alert("Низкая точность", `Точность ${Math.round(accuracy)}м. Попробуйте ещё раз.`);
          }
          const coords: [number, number] = [latitude, longitude];
          sendToMap({ type: "setCenter", coords, zoom: 18 });
          setMapCenter(coords);
        },
        (err) => {
          Alert.alert("Ошибка геолокации", err?.message || "Не удалось получить координаты");
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || String(e));
    }
  }, [requestLocationPermission, sendToMap]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html: mapHtml }}
        onMessage={handleMapMessage}
        javaScriptEnabled
        domStorageEnabled
        style={styles.webview}
      />

      {/* Кнопка геолокации - всегда видима */}
      <TouchableOpacity
        onPress={moveToMyLocation}
        style={styles.locationButton}
        activeOpacity={0.8}
      >
        <Text style={styles.locationButtonIcon}>📍</Text>
      </TouchableOpacity>

      {/* Кнопка добавления проблемы */}
      {mode === "idle" && (
        <TouchableOpacity onPress={startAddingProblem} style={styles.fab}>
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* Оверлей выбора места на карте */}
      {mode === "picking" && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <View style={styles.crosshair} />
          <View style={styles.bottomBar}>
            <View style={styles.buttonsRow}>
              <TouchableOpacity 
                style={[styles.actionButton, styles.cancelButton]} 
                onPress={cancelLocationPicking}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionButton, styles.primaryButton]} 
                onPress={confirmLocation}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>✓ Подтвердить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
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
  fabText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "700",
  },
  locationButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  locationButtonIcon: {
    fontSize: 24,
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
    backgroundColor: 'rgba(255,255,255,0.98)',
    padding: 20,
    paddingBottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: '100%',
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButton: {
    backgroundColor: '#007aff',
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#d0d0d0',
    flex: 1,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    color: '#333333',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
