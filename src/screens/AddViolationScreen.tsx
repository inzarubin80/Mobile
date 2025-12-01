import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { launchImageLibrary, launchCamera, Asset } from "react-native-image-picker";
import { PermissionsAndroid, Platform } from "react-native";
import { Button, Input } from "@rneui/base";
import { createViolation } from "../lib/api";

type RootStackParamList = {
  AddViolation: {
    initialCoords?: [number, number]; // [lat, lng]
  };
};

type AddViolationRouteProp = RouteProp<RootStackParamList, "AddViolation">;

export default function AddViolationScreen() {
  const navigation = useNavigation();
  const route = useRoute<AddViolationRouteProp>();
  const { initialCoords } = route.params || {};
  const isMountedRef = useRef(true);

  const [coords, setCoords] = useState<[number, number] | null>(initialCoords || null);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<Array<{ uri: string; name?: string; type?: string }>>([]);
  const [submitting, setSubmitting] = useState(false);

  // Отслеживание монтирования компонента и очистка при размонтировании
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Очищаем фотографии при размонтировании для предотвращения утечек памяти и падений
      setPhotos([]);
    };
  }, []);

  // ========== Работа с фотографиями ==========

  const requestCameraPermission = useCallback(async (): Promise<boolean> => {
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
  }, []);

  const addPhotoFromGallery = useCallback(async () => {
    const res = await launchImageLibrary({ mediaType: "photo", selectionLimit: 5 });
    if (res?.assets?.length) {
      const newPhotos = res.assets
        .filter((a: Asset) => !!a.uri)
        .map((a: Asset) => ({
          uri: a.uri!,
          name: a.fileName || undefined,
          type: a.type || undefined,
        }));
      
      // Проверка на дубликаты URI
      if (!isMountedRef.current) return;
      
      setPhotos(prev => {
        if (!isMountedRef.current) return prev;
        
        const existingUris = new Set(prev.map(p => p.uri));
        
        // Сначала убираем дубликаты внутри новых фотографий
        const seenUris = new Set<string>();
        const uniqueNewPhotos = newPhotos.filter(p => {
          if (seenUris.has(p.uri) || existingUris.has(p.uri)) {
            return false;
          }
          seenUris.add(p.uri);
          return true;
        });
        
        if (uniqueNewPhotos.length < newPhotos.length) {
          const duplicates = newPhotos.length - uniqueNewPhotos.length;
          // skipped duplicate photos
        }
        
        return [...prev, ...uniqueNewPhotos];
      });
    }
  }, []);

  const addPhotoFromCamera = useCallback(async () => {
    try {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) {
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
        const newPhotos = res.assets
          .filter((a: Asset) => !!a.uri)
          .map((a: Asset) => ({
            uri: a.uri!,
            name: a.fileName || undefined,
            type: a.type || undefined,
          }));
        
        // Проверка на дубликаты URI
        setPhotos(prev => {
          const existingUris = new Set(prev.map(p => p.uri));
          
          // Сначала убираем дубликаты внутри новых фотографий
          const seenUris = new Set<string>();
          const uniqueNewPhotos = newPhotos.filter(p => {
            if (seenUris.has(p.uri) || existingUris.has(p.uri)) {
              return false;
            }
            seenUris.add(p.uri);
            return true;
          });
          
          if (uniqueNewPhotos.length < newPhotos.length) {
            const duplicates = newPhotos.length - uniqueNewPhotos.length;
            // skipped duplicate photos
          }
          
          return [...prev, ...uniqueNewPhotos];
        });
      }
    } catch (e: any) {
      if (e.message !== "User cancelled image selection") {
        Alert.alert("Ошибка камеры", e.message || "Не удалось сделать фото");
      }
    }
  }, [requestCameraPermission]);

  const removePhoto = useCallback((uri: string) => {
    if (!isMountedRef.current) return;
    setPhotos(prev => {
      if (!isMountedRef.current) return prev;
      return prev.filter(p => p.uri !== uri);
    });
  }, []);

  // ========== Выбор координат на карте ==========

  const selectLocationOnMap = useCallback(() => {
    // Возвращаемся на карту, пользователь выберет место и снова нажмет FAB
    navigation.goBack();
  }, [navigation]);

  // ========== Отправка нарушения ==========

  const submitViolation = async () => {
    if (!coords) {
      Alert.alert("Ошибка", "Выберите место на карте");
      return;
    }

    if (!description.trim()) {
      Alert.alert("Ошибка", "Добавьте описание");
      return;
    }

    setSubmitting(true);


    try {
      const [lat, lng] = coords;
      await createViolation({
        type: "garbage",
        description: description.trim(),
        lat,
        lng,
        photos,
      });

       
      navigation.goBack();
   

    } catch (e: any) {
      Alert.alert("Ошибка отправки", e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Новая проблема</Text>

      {/* Координаты */}
      <View style={styles.section}>
        <Text style={styles.label}>Местоположение</Text>
        {coords && (
          <View style={styles.coordsContainer}>
            <Text style={styles.coordsText}>
              {coords[0].toFixed(5)}, {coords[1].toFixed(5)}
            </Text>
            <Button title="Изменить" onPress={selectLocationOnMap} type="outline" size="sm" />
          </View>
        )}
      </View>

      {/* Описание */}
      <View style={styles.section}>
        <Text style={styles.label}>Описание</Text>
        <Input
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="Например: незаконная свалка в лесу"
          inputStyle={{ minHeight: 100, textAlignVertical: "top" }}
          containerStyle={{ paddingHorizontal: 0 }}
        />
      </View>

      {/* Фотографии */}
      <View style={styles.section}>
        <View style={styles.photosHeader}>
          <Text style={styles.label}>Фотографии ({photos.length})</Text>
          <View style={styles.photoButtonsRow}>
            <Button title="Сделать фото" onPress={addPhotoFromCamera} type="outline" containerStyle={{ marginRight: 8 }} />
            <Button title="Галерея" onPress={addPhotoFromGallery} type="outline" />
          </View>
        </View>

        {/* FlatList always mounted to prevent Fabric crashes */}
        <FlatList
          horizontal
          data={photos.length > 0 ? photos : []}
          keyExtractor={(item, index) => {
            // Используем комбинацию URI и индекса для гарантии уникальности
            // Это защищает от случаев, когда URI может быть undefined или дублироваться
            const key = item.uri || `photo_${index}`;
            return `${key}_${index}`;
          }}
          renderItem={({ item, index }) => {
            if (!item.uri) return null;
            return (
              <View style={styles.photoItem}>
                <Image
                  source={{ uri: item.uri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                  onError={() => {
                    // image load error - silent
                  }}
                  onLoad={() => {
                    // image loaded - silent
                  }}
                />
                <TouchableOpacity onPress={() => {
                  if (isMountedRef.current) {
                    removePhoto(item.uri);
                  }
                }}>
                  <Text style={styles.removePhotoText}>Удалить</Text>
                </TouchableOpacity>
              </View>
            );
          }}
          style={[
            styles.photosList,
            {
              opacity: photos.length > 0 ? 1 : 0,
              height: photos.length > 0 ? undefined : 0,
            },
          ]}
          ListEmptyComponent={null}
          removeClippedSubviews={false}
        />
      </View>

      {/* Кнопка отправки */}
      <View style={styles.submitSection}>
        <Button
          title={submitting ? "Отправка..." : "Отправить"}
          onPress={submitViolation}
          disabled={submitting || !coords || !description.trim()}
          loading={submitting}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  coordsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  coordsText: {
    fontSize: 14,
    color: "#666",
    fontFamily: "monospace",
    flex: 1,
    marginRight: 12,
  },
  noCoordsContainer: {
    marginBottom: 8,
  },
  noCoordsText: {
    fontSize: 14,
    color: "#999",
    marginBottom: 8,
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    textAlignVertical: "top",
    fontSize: 16,
  },
  photosHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  photoButtonsRow: {
    flexDirection: "row",
  },
  photoButtonWrapper: {
    marginRight: 8,
  },
  photosList: {
    marginTop: 8,
  },
  photoItem: {
    marginRight: 12,
    alignItems: "center",
  },
  photoPreview: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  removePhotoText: {
    color: "#d00",
    marginTop: 4,
    fontSize: 12,
  },
  submitSection: {
    marginTop: 8,
    marginBottom: 24,
  },
});

