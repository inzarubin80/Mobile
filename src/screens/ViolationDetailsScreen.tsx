import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  Alert,
  Modal,
  TextInput,
  Share,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { launchImageLibrary, launchCamera, Asset } from "react-native-image-picker";
import { PermissionsAndroid } from "react-native";
import { Button, Card, Input, Badge, Avatar, Icon } from "@rneui/base";
import type { Violation, ViolationRequest } from "../types/api";
import { getViolationById, closeViolationRequest } from "../lib/api";

type RootStackParamList = {
  ViolationDetails: { violation: Violation; id?: string };
};

type ViolationDetailsRouteProp = RouteProp<RootStackParamList, "ViolationDetails">;

export default function ViolationDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute<ViolationDetailsRouteProp>();
  const { violation: initialViolation, id } = route.params;
  const [violation, setViolation] = useState<Violation>(initialViolation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"gallery" | "chat" | "history">("gallery");
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionType, setResolutionType] = useState<"resolved" | "partially" | null>(null);
  const [resolutionComment, setResolutionComment] = useState("");
  const [resolutionPhotos, setResolutionPhotos] = useState<Array<{ uri: string; name?: string; type?: string }>>([]);
  const [submittingResolution, setSubmittingResolution] = useState(false);
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ uri: string; index: number; photos: any[] } | null>(null);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get("window"));
  const isMountedRef = useRef(true);

  // Обновление размеров экрана при изменении ориентации
  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setScreenDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  // Log lifecycle events and set mounted flag
  useEffect(() => {
    console.log("[ViolationDetails] Component mounted");
    isMountedRef.current = true;
    return () => {
      console.log("[ViolationDetails] Component unmounting");
      isMountedRef.current = false;
    };
  }, []);

  // Log navigation events
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      console.log("[ViolationDetails] Navigation: beforeRemove");
      isMountedRef.current = false;
    });
    return unsubscribe;
  }, [navigation]);

  // Load violation details on mount if we have an ID
  useEffect(() => {
    const violationId = id || initialViolation.id;
    console.log("[ViolationDetails] Initial violation:", JSON.stringify(initialViolation, null, 2));
    console.log("[ViolationDetails] Initial photos:", initialViolation.photos);
    if (violationId) {
      setLoading(true);
      setError(null);
      getViolationById(violationId)
        .then((data) => {
          // Check if component is still mounted before updating state
          if (!isMountedRef.current) {
            console.log("[ViolationDetails] Component unmounted, skipping state update");
            return;
          }
          console.log("[ViolationDetails] Loaded data:", JSON.stringify(data, null, 2));
          console.log("[ViolationDetails] Loaded photos:", data.photos);
          console.log("[ViolationDetails] Loaded requests:", data.requests);
          // Merge loaded data with initial data (initial takes precedence for fields like type, status)
          setViolation((prev) => {
            const merged = { ...prev, ...data, id: violationId };
            console.log("[ViolationDetails] Merged violation:", JSON.stringify(merged, null, 2));
            console.log("[ViolationDetails] Merged photos:", merged.photos);
            console.log("[ViolationDetails] Merged requests:", merged.requests);
            return merged;
          });
          setLoading(false);
        })
        .catch((err) => {
          // Check if component is still mounted before updating state
          if (!isMountedRef.current) {
            console.log("[ViolationDetails] Component unmounted, skipping error state update");
            return;
          }
          console.error("[ViolationDetails] Failed to load:", err);
          setError(err.message || "Не удалось загрузить данные");
          setLoading(false);
          // Keep initial violation data on error
        });
    }
  }, [id, initialViolation.id]);

  // Показываем кнопки статусов только если проблема еще не решена
  // Новые статусы: new, confirmed, resolved, partially_resolved
  const canMarkAsResolved = 
    violation.status === "new" || 
    violation.status === "confirmed" || 
    violation.status === "in_progress" || 
    !violation.status;

  const handleComplain = useCallback(() => {
    Alert.alert("Пожаловаться", "Функция будет доступна в ближайшее время");
  }, []);

  const handleSubscribe = useCallback(() => {
    Alert.alert("Подписаться", "Функция будет доступна в ближайшее время");
  }, []);

  const handleResolved = useCallback(() => {
    setResolutionType("resolved");
    setShowResolutionForm(true);
  }, []);

  const handlePartiallyResolved = useCallback(() => {
    setResolutionType("partially");
    setShowResolutionForm(true);
  }, []);

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

  const addResolutionPhotoFromGallery = useCallback(async () => {
    try {
      const res = await launchImageLibrary({
        mediaType: "photo",
        quality: 0.8,
        selectionLimit: 10,
      });

      if (res?.assets?.length) {
        const newPhotos = res.assets
          .filter((a: Asset) => !!a.uri)
          .map((a: Asset) => ({
            uri: a.uri!,
            name: a.fileName || undefined,
            type: a.type || undefined,
          }));

        setResolutionPhotos(prev => {
          const existingUris = new Set(prev.map(p => p.uri));
          const uniqueNewPhotos = newPhotos.filter(p => !existingUris.has(p.uri));
          return [...prev, ...uniqueNewPhotos];
        });
      }
    } catch (e: any) {
      if (e.message !== "User cancelled image selection") {
        Alert.alert("Ошибка", e.message || "Не удалось выбрать фото");
      }
    }
  }, []);

  const addResolutionPhotoFromCamera = useCallback(async () => {
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

        setResolutionPhotos(prev => {
          const existingUris = new Set(prev.map(p => p.uri));
          const uniqueNewPhotos = newPhotos.filter(p => !existingUris.has(p.uri));
          return [...prev, ...uniqueNewPhotos];
        });
      }
    } catch (e: any) {
      if (e.message !== "User cancelled image selection") {
        Alert.alert("Ошибка камеры", e.message || "Не удалось сделать фото");
      }
    }
  }, [requestCameraPermission]);

  const removeResolutionPhoto = useCallback((uri: string) => {
    setResolutionPhotos(prev => prev.filter(p => p.uri !== uri));
  }, []);

  const handleSubmitResolution = useCallback(async () => {
    if (!resolutionComment.trim()) {
      Alert.alert("Ошибка", "Пожалуйста, добавьте комментарий");
      return;
    }

    if (!violation.id) {
      Alert.alert("Ошибка", "Не указан ID нарушения");
      return;
    }

    setSubmittingResolution(true);

    try {
      const status = resolutionType === "resolved" ? "closed" : "partially_closed";
      
      await closeViolationRequest(violation.id, {
        status,
        comment: resolutionComment.trim(),
        photos: resolutionPhotos.length > 0 ? resolutionPhotos : undefined,
      });

      // Обновляем данные нарушения
      const updatedViolation = await getViolationById(violation.id);
      if (isMountedRef.current) {
        setViolation(prev => ({ ...prev, ...updatedViolation, id: violation.id }));
      }

      Alert.alert("Успешно", "Заявка на решение отправлена");
      setShowResolutionForm(false);
      setResolutionComment("");
      setResolutionPhotos([]);
      setResolutionType(null);
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message || "Не удалось отправить заявку");
    } finally {
      if (isMountedRef.current) {
        setSubmittingResolution(false);
      }
    }
  }, [resolutionType, resolutionComment, resolutionPhotos, violation.id]);

  const handleShare = useCallback(async () => {
    try {
      const shareUrl = `https://greenwarden.app/violations/${violation.id}`;
      const message = `Проблема: ${violation.description || violation.type}\n${shareUrl}`;
      await Share.share({
        message,
        url: shareUrl,
        title: "Поделиться проблемой",
      });
    } catch (error: any) {
      if (error.message !== "User did not share") {
        Alert.alert("Ошибка", "Не удалось поделиться");
      }
    }
  }, [violation]);

  const formatDate = useCallback((dateStr?: string) => {
    if (!dateStr) return "Дата неизвестна";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }, []);

  const getTypeLabel = useCallback((type?: string) => {
    if (!type) return "Нарушение";
    const labels: Record<string, string> = {
      garbage: "Мусор",
      pollution: "Загрязнение",
      air: "Загрязнение воздуха",
      deforestation: "Вырубка леса",
      other: "Другое",
    };
    return labels[type] || type;
  }, []);

  const getRequestStatusLabel = useCallback((status: string) => {
    const labels: Record<string, string> = {
      open: "Создание",
      partially_closed: "Частично решено",
      closed: "Полностью решено",
    };
    return labels[status] || status;
  }, []);

  const getRequestStatusColor = useCallback((status: string) => {
    const colors: Record<string, string> = {
      open: "#34C759", // green
      partially_closed: "#FF9500", // orange
      closed: "#007AFF", // blue
    };
    return colors[status] || "#999";
  }, []);

  const getRequestStatusIcon = useCallback((status: string) => {
    const icons: Record<string, string> = {
      open: "note-add",
      partially_closed: "hourglass-empty",
      closed: "check-circle",
    };
    return icons[status] || "help-circle";
  }, []);

  const toggleRequestExpanded = useCallback((requestId: string) => {
    setExpandedRequests((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  }, []);

  const openFullscreenPhoto = useCallback((photo: any, photos: any[], index: number) => {
    setFullscreenPhoto({ uri: photo.thumb_url || photo.url, index, photos });
  }, []);

  const closeFullscreenPhoto = useCallback(() => {
    setFullscreenPhoto(null);
  }, []);

  const copyRequestInfo = useCallback(async (request: ViolationRequest) => {
    const info = [
      `Статус: ${getRequestStatusLabel(request.status)}`,
      `Дата: ${formatDate(request.created_at)}`,
      request.comment ? `Комментарий: ${request.comment}` : "",
      request.photos && request.photos.length > 0 ? `Фото: ${request.photos.length}` : "",
    ].filter(Boolean).join("\n");
    
    try {
      // Используем Clipboard из React Native (если доступен) или Share
      if (Platform.OS === "ios" || Platform.OS === "android") {
        // Пробуем использовать встроенный Clipboard
        const Clipboard = require("react-native").Clipboard;
        if (Clipboard && Clipboard.setString) {
          Clipboard.setString(info);
          Alert.alert("Скопировано", "Информация о заявке скопирована");
        } else {
          // Fallback на Share
          await Share.share({ message: info, title: "Информация о заявке" });
        }
      } else {
        await Share.share({ message: info, title: "Информация о заявке" });
      }
    } catch (error: any) {
      // Если Clipboard не доступен, используем Share
      try {
        await Share.share({ message: info, title: "Информация о заявке" });
      } catch (shareError: any) {
        if (shareError.message !== "User did not share") {
          Alert.alert("Ошибка", "Не удалось скопировать информацию");
        }
      }
    }
  }, [getRequestStatusLabel, formatDate]);

  const shareRequest = useCallback(async (request: ViolationRequest) => {
    try {
      const info = [
        `Статус: ${getRequestStatusLabel(request.status)}`,
        `Дата: ${formatDate(request.created_at)}`,
        request.comment || "",
      ].filter(Boolean).join("\n");
      
      await Share.share({
        message: info,
        title: "Информация о заявке",
      });
    } catch (error: any) {
      if (error.message !== "User did not share") {
        Alert.alert("Ошибка", "Не удалось поделиться");
      }
    }
  }, [getRequestStatusLabel, formatDate]);

  const formatTimeAgo = useCallback((dateStr?: string) => {
    if (!dateStr) return "Дата неизвестна";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "только что";
      if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? "минуту" : diffMins < 5 ? "минуты" : "минут"} назад`;
      if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? "час" : diffHours < 5 ? "часа" : "часов"} назад`;
      if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? "день" : diffDays < 5 ? "дня" : "дней"} назад`;
      
      return formatDate(dateStr);
    } catch {
      return formatDate(dateStr);
    }
  }, [formatDate]);

  const photos = violation.photos || [];
  
  // Log photos for debugging (only once per violation change)
  useEffect(() => {
    console.log("[ViolationDetails] Violation changed, photos:", photos.length);
    if (photos.length > 0) {
      photos.forEach((photo, idx) => {
        console.log(`[ViolationDetails] Photo ${idx}:`, {
          id: photo.id,
          url: photo.url,
          thumb_url: photo.thumb_url,
        });
      });
    }
  }, [violation.id, photos.length]);

  return (
    <View style={styles.container}>
      {/* Loading overlay - always mounted to prevent Fabric crashes */}
      <View
        style={[
          styles.loadingOverlay,
          { opacity: loading ? 1 : 0, pointerEvents: loading ? "auto" : "none" },
        ]}
      >
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Загрузка...</Text>
      </View>
      {/* Error banner - always mounted to prevent Fabric crashes */}
      <View
        style={[
          styles.errorBanner,
          { opacity: error && !loading ? 1 : 0, pointerEvents: error && !loading ? "auto" : "none" },
        ]}
      >
        <Text style={styles.errorText}>{error || ""}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {violation.type && (
              <View style={[styles.typeBadge, { backgroundColor: getTypeColor(violation.type) }]}>
                <Text style={styles.typeText}>{getTypeLabel(violation.type)}</Text>
              </View>
            )}
            <Text style={styles.date}>{formatDate(violation.created_at)}</Text>
          </View>
          <Text style={styles.coords}>
            {violation.lat.toFixed(6)}, {violation.lng.toFixed(6)}
          </Text>
          {violation.description && (
            <Text style={styles.description}>{violation.description}</Text>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "gallery" && styles.tabActive]}
            onPress={() => setActiveTab("gallery")}
          >
            <Text style={[styles.tabText, activeTab === "gallery" && styles.tabTextActive]}>
              Галерея ({photos.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "history" && styles.tabActive]}
            onPress={() => setActiveTab("history")}
          >
            <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
              История {violation.requests && violation.requests.length > 0 ? `(${violation.requests.length})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "chat" && styles.tabActive]}
            onPress={() => setActiveTab("chat")}
          >
            <Text style={[styles.tabText, activeTab === "chat" && styles.tabTextActive]}>Чат</Text>
          </TouchableOpacity>
        </View>

        {/* Content - always mounted to prevent Fabric crashes */}
        <View
          style={[
            styles.galleryContainer,
            {
              opacity: activeTab === "gallery" ? 1 : 0,
              pointerEvents: activeTab === "gallery" ? "auto" : "none",
            },
          ]}
        >
          {/* FlatList always mounted to prevent Fabric crashes */}
          <FlatList
            data={photos.length > 0 ? photos : []}
            numColumns={2}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const imageUri = item.thumb_url || item.url;
              return (
                <TouchableOpacity style={styles.photoItem} onPress={() => {}}>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.photo}
                    resizeMode="cover"
                    onError={(e) => {
                      if (isMountedRef.current) {
                        console.error("[ViolationDetails] Image load error:", e.nativeEvent.error, "URI:", imageUri);
                      }
                    }}
                    onLoad={() => {
                      if (isMountedRef.current) {
                        console.log("[ViolationDetails] Image loaded successfully:", imageUri);
                      }
                    }}
                  />
                </TouchableOpacity>
              );
            }}
            scrollEnabled={false}
            columnWrapperStyle={styles.photoRow}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Нет фотографий</Text>
              </View>
            }
            removeClippedSubviews={false}
          />
        </View>
        {/* History Container */}
        <View
          style={[
            styles.historyContainer,
            {
              opacity: activeTab === "history" ? 1 : 0,
              pointerEvents: activeTab === "history" ? "auto" : "none",
            },
          ]}
        >
          {violation.requests && violation.requests.length > 0 ? (
            <View style={styles.historyList}>
              {[...violation.requests]
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .map((item) => {
                  const isExpanded = expandedRequests.has(item.id);
                  const hasContent = (item.comment && item.comment.trim()) || (item.photos && item.photos.length > 0);
                  return (
                    <Card key={item.id} containerStyle={[styles.requestCardRNE, { borderLeftColor: getRequestStatusColor(item.status) }]}>
                      {/* Header - всегда видимый */}
                      <TouchableOpacity
                        style={styles.requestCardHeader}
                        onPress={() => hasContent && toggleRequestExpanded(item.id)}
                        activeOpacity={hasContent ? 0.7 : 1}
                      >
                        <View style={styles.requestHeaderLeft}>
                          <View style={styles.requestHeaderTop}>
                            <Icon
                              name={getRequestStatusIcon(item.status)}
                              type="material"
                              size={22}
                              color={getRequestStatusColor(item.status)}
                              containerStyle={styles.requestStatusIcon}
                            />
                            <Badge
                              value={getRequestStatusLabel(item.status)}
                              status="success"
                              badgeStyle={{ 
                                backgroundColor: getRequestStatusColor(item.status), 
                                paddingHorizontal: 12, 
                                paddingVertical: 5,
                                borderRadius: 12,
                              }}
                              textStyle={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3 }}
                            />
                          </View>
                          <View style={styles.requestMetaInfo}>
                            <View style={styles.requestAuthorContainer}>
                              <Avatar
                                size={22}
                                rounded
                                title={item.created_by_user_id === violation.user_id ? "В" : String(item.created_by_user_id)[0]}
                                containerStyle={{ backgroundColor: "#007AFF", marginRight: 8 }}
                              />
                              <View style={styles.requestAuthorInfo}>
                                <Text style={styles.requestAuthor}>
                                  {item.created_by_user_id === violation.user_id ? "Вы" : `ID ${item.created_by_user_id}`}
                                </Text>
                                <Text style={styles.requestTimeAgo}>{formatTimeAgo(item.created_at)}</Text>
                              </View>
                            </View>
                          </View>
                        </View>
                        <View style={styles.requestHeaderRight}>
                          {item.photos && item.photos.length > 0 && (
                            <View style={styles.requestPhotoCountBadge}>
                              <Icon name="photo-library" type="material" size={14} color="#1976D2" />
                              <Text style={styles.requestPhotoCountText}>{item.photos.length}</Text>
                            </View>
                          )}
                          {hasContent && (
                            <Icon
                              name={isExpanded ? "expand-less" : "expand-more"}
                              type="material"
                              size={24}
                              color="#666"
                            />
                          )}
                        </View>
                      </TouchableOpacity>

                      {/* Expandable content */}
                      {isExpanded && hasContent && (
                        <View style={styles.requestCardExpandable}>
                          {/* Full date in expanded view */}
                          <View style={styles.requestDateExpanded}>
                            <Icon name="schedule" type="material" size={14} color="#999" />
                            <Text style={styles.requestDateExpandedText}>{formatDate(item.created_at)}</Text>
                          </View>
                          {/* Comment */}
                          {item.comment && item.comment.trim() && (
                            <View style={styles.requestCommentContainer}>
                              <View style={styles.requestCommentHeader}>
                                <Icon name="comment" type="material" size={16} color="#666" />
                                <Text style={styles.requestCommentLabel}>Комментарий</Text>
                              </View>
                              <Text style={styles.requestComment}>{item.comment}</Text>
                            </View>
                          )}
                          {/* Photos */}
                          {item.photos && item.photos.length > 0 && (
                            <View style={styles.requestPhotosContainer}>
                              <View style={styles.requestPhotosHeader}>
                                <Icon name="photo-library" type="material" size={16} color="#666" />
                                <Text style={styles.requestPhotosLabel}>Фотографии ({item.photos.length})</Text>
                              </View>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.requestPhotosList}
                              >
                                {item.photos.map((photo, photoIndex) => (
                                  <TouchableOpacity
                                    key={photo.id}
                                    style={styles.requestPhotoItem}
                                    onPress={() => openFullscreenPhoto(photo, item.photos || [], photoIndex)}
                                  >
                                    <Image
                                      source={{ uri: photo.thumb_url || photo.url }}
                                      style={styles.requestPhoto}
                                      resizeMode="cover"
                                    />
                                    <View style={styles.requestPhotoOverlay}>
                                      <Icon name="zoom-in" type="material" size={20} color="#FFFFFF" />
                                    </View>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                            </View>
                          )}
                          {/* Actions */}
                          <View style={styles.requestActions}>
                            <TouchableOpacity
                              style={styles.requestActionButton}
                              onPress={() => shareRequest(item)}
                            >
                              <Icon name="share" type="material" size={18} color="#007AFF" />
                              <Text style={styles.requestActionText}>Поделиться</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.requestActionButton}
                              onPress={() => copyRequestInfo(item)}
                            >
                              <Icon name="content-copy" type="material" size={18} color="#007AFF" />
                              <Text style={styles.requestActionText}>Копировать</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </Card>
                  );
                })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>История заявок пуста</Text>
            </View>
          )}
        </View>
        <View
          style={[
            styles.chatContainer,
            {
              opacity: activeTab === "chat" ? 1 : 0,
              pointerEvents: activeTab === "chat" ? "auto" : "none",
            },
          ]}
        >
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Чат будет доступен в ближайшее время</Text>
          </View>
        </View>

        {/* Primary Actions - Status buttons (always mounted to prevent Fabric crashes) */}
        <View
          style={[
            styles.primaryActions,
            {
              opacity: canMarkAsResolved ? 1 : 0,
              pointerEvents: canMarkAsResolved ? "auto" : "none",
              height: canMarkAsResolved ? undefined : 0,
            },
          ]}
        >
          <Button
            title="✓ Решено"
            onPress={handleResolved}
            buttonStyle={{ backgroundColor: "#34C759" }}
            containerStyle={{ marginBottom: 12 }}
          />
          <Button
            title="~ Частично решено"
            onPress={handlePartiallyResolved}
            buttonStyle={{ backgroundColor: "#FF9500" }}
          />
        </View>

        {/* Secondary Actions */}
        <View style={styles.secondaryActions}>
          <Button
            title="Подписаться"
            onPress={handleSubscribe}
            type="outline"
            buttonStyle={styles.secondaryButtonRNE}
            containerStyle={styles.secondaryButtonContainer}
          />
          <Button
            title="Поделиться"
            onPress={handleShare}
            type="outline"
            buttonStyle={styles.secondaryButtonRNE}
            containerStyle={styles.secondaryButtonContainer}
          />
          <Button
            title="Пожаловаться"
            onPress={handleComplain}
            type="outline"
            buttonStyle={[styles.secondaryButtonRNE, styles.complainButtonRNEStyle]}
            titleStyle={styles.complainButtonTextRNEStyle}
            containerStyle={styles.secondaryButtonContainer}
          />
        </View>
      </ScrollView>

      {/* Resolution Form Modal */}
      <Modal
        visible={showResolutionForm}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!submittingResolution) {
            setShowResolutionForm(false);
            setResolutionComment("");
            setResolutionPhotos([]);
            setResolutionType(null);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {resolutionType === "resolved" ? "Проблема решена" : "Проблема частично решена"}
              </Text>
              <Text style={styles.modalSubtitle}>Добавьте комментарий о решении</Text>
              <Input
                multiline
                numberOfLines={4}
                placeholder="Опишите, что было сделано..."
                value={resolutionComment}
                onChangeText={setResolutionComment}
                inputStyle={{ textAlignVertical: "top", minHeight: 120 }}
                containerStyle={{ paddingHorizontal: 0, marginBottom: 20 }}
                editable={!submittingResolution}
              />

              {/* Photo selection section */}
              <View style={styles.modalPhotoSection}>
                <Text style={styles.modalPhotoSectionTitle}>Фотографии (опционально)</Text>
                <View style={styles.modalPhotoButtons}>
                  <TouchableOpacity
                    style={styles.modalPhotoButton}
                    onPress={addResolutionPhotoFromGallery}
                    disabled={submittingResolution}
                  >
                    <Text style={styles.modalPhotoButtonText}>📷 Галерея</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPhotoButton}
                    onPress={addResolutionPhotoFromCamera}
                    disabled={submittingResolution}
                  >
                    <Text style={styles.modalPhotoButtonText}>📸 Камера</Text>
                  </TouchableOpacity>
                </View>
                {resolutionPhotos.length > 0 && (
                  <FlatList
                    data={resolutionPhotos}
                    horizontal
                    keyExtractor={(item, index) => item.uri + index}
                    renderItem={({ item }) => (
                      <View style={styles.modalPhotoItem}>
                        <Image source={{ uri: item.uri }} style={styles.modalPhotoPreview} />
                        <TouchableOpacity
                          style={styles.modalPhotoRemove}
                          onPress={() => removeResolutionPhoto(item.uri)}
                          disabled={submittingResolution}
                        >
                          <Text style={styles.modalPhotoRemoveText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    contentContainerStyle={styles.modalPhotoList}
                  />
                )}
              </View>

              <View style={styles.modalActions}>
                <Button
                  title="Отмена"
                  onPress={() => {
                    if (!submittingResolution) {
                      setShowResolutionForm(false);
                      setResolutionComment("");
                      setResolutionPhotos([]);
                      setResolutionType(null);
                    }
                  }}
                  disabled={submittingResolution}
                  type="outline"
                  buttonStyle={styles.modalButtonCancelRNE}
                  titleStyle={styles.modalButtonCancelTextRNE}
                  containerStyle={{ flex: 1, marginRight: 6 }}
                />
                <Button
                  title={submittingResolution ? "" : "Отправить"}
                  onPress={handleSubmitResolution}
                  disabled={submittingResolution}
                  loading={submittingResolution}
                  buttonStyle={styles.modalButtonSubmitRNE}
                  containerStyle={{ flex: 1, marginLeft: 6 }}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Fullscreen Photo Modal */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={closeFullscreenPhoto}
      >
        <View style={styles.fullscreenPhotoContainer}>
          <TouchableOpacity
            style={styles.fullscreenPhotoClose}
            onPress={closeFullscreenPhoto}
            activeOpacity={0.8}
          >
            <Icon name="close" type="material" size={32} color="#FFFFFF" />
          </TouchableOpacity>
          {fullscreenPhoto && (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: fullscreenPhoto.index * screenDimensions.width, y: 0 }}
                style={styles.fullscreenPhotoScroll}
                contentContainerStyle={styles.fullscreenPhotoScrollContent}
              >
                {fullscreenPhoto.photos.map((photo, index) => (
                  <View key={photo.id || index} style={[styles.fullscreenPhotoItem, { width: screenDimensions.width, height: screenDimensions.height }]}>
                    <Image
                      source={{ uri: photo.url || photo.thumb_url }}
                      style={[styles.fullscreenPhotoImage, { width: screenDimensions.width, height: screenDimensions.height }]}
                      resizeMode="contain"
                    />
                  </View>
                ))}
              </ScrollView>
              <View style={styles.fullscreenPhotoInfo}>
                <Text style={styles.fullscreenPhotoCounter}>
                  {fullscreenPhoto.index + 1} / {fullscreenPhoto.photos.length}
                </Text>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

function getTypeColor(type?: string): string {
  if (!type) return "#AA96DA";
  const colors: Record<string, string> = {
    garbage: "#FF6B6B",
    pollution: "#4ECDC4",
    air: "#95E1D3",
    deforestation: "#F38181",
    other: "#AA96DA",
  };
  return colors[type] || "#AA96DA";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  typeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  date: {
    fontSize: 12,
    color: "#666",
  },
  coords: {
    fontSize: 13,
    color: "#999",
    marginBottom: 8,
    fontFamily: "monospace",
  },
  description: {
    fontSize: 15,
    color: "#333",
    lineHeight: 22,
    marginTop: 8,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#007AFF",
  },
  tabText: {
    fontSize: 15,
    color: "#666",
    fontWeight: "500",
  },
  tabTextActive: {
    color: "#007AFF",
    fontWeight: "600",
  },
  galleryContainer: {
    backgroundColor: "#FFFFFF",
    padding: 12,
    minHeight: 200,
  },
  photoRow: {
    justifyContent: "space-between",
    marginBottom: 12,
  },
  photoItem: {
    width: "48%",
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  chatContainer: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    minHeight: 200,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
  },
  primaryActions: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    marginTop: 12,
    gap: 12,
  },
  secondaryActions: {
    flexDirection: "row",
    padding: 20,
    gap: 8,
    backgroundColor: "#FFFFFF",
    marginTop: 8,
    flexWrap: "wrap",
  },
  complainButtonSecondary: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FFE5E5",
  },
  complainButtonTextSecondary: {
    color: "#FF3B30",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalScroll: {
    maxHeight: "80%",
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    marginBottom: 20,
    backgroundColor: "#F9F9F9",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorBanner: {
    backgroundColor: "#FFE5E5",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#FFCCCC",
  },
  errorText: {
    color: "#FF3B30",
    fontSize: 14,
    textAlign: "center",
  },
  modalPhotoSection: {
    marginTop: 16,
    marginBottom: 20,
  },
  modalPhotoSectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  modalPhotoButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  modalPhotoButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#F2F2F7",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    alignItems: "center",
  },
  modalPhotoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
  },
  modalPhotoList: {
    gap: 12,
  },
  modalPhotoItem: {
    position: "relative",
    marginRight: 12,
  },
  modalPhotoPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
  },
  modalPhotoRemove: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  modalPhotoRemoveText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 20,
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  historyContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 0,
    alignItems: "flex-start",
  },
  historyList: {
    gap: 12,
    width: "100%",
  },
  requestCardRNE: {
    marginBottom: 12,
    padding: 0,
    borderLeftWidth: 4,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  requestCardHeader: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    minHeight: 80,
  },
  requestHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  requestHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  requestStatusIcon: {
    marginRight: 0,
  },
  requestMetaInfo: {
    gap: 0,
  },
  requestAuthorContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  requestAuthorInfo: {
    flex: 1,
  },
  requestAuthor: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
    marginBottom: 2,
  },
  requestTimeAgo: {
    fontSize: 12,
    color: "#999",
  },
  requestDateExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  requestDateExpandedText: {
    fontSize: 12,
    color: "#666",
  },
  requestHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  requestPhotoCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
    borderWidth: 1,
    borderColor: "#BBDEFB",
  },
  requestPhotoCountText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "700",
  },
  requestCardExpandable: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
    marginTop: 8,
    paddingTop: 16,
  },
  requestCommentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 6,
  },
  requestCommentLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  requestCommentContainer: {
    backgroundColor: "#F9F9F9",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#007AFF",
  },
  requestComment: {
    fontSize: 14,
    color: "#333",
    lineHeight: 20,
  },
  requestPhotosHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  requestPhotosLabel: {
    fontSize: 12,
    color: "#666",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  secondaryButtonRNE: {
    borderColor: "#E5E5EA",
    backgroundColor: "#F2F2F7",
  },
  secondaryButtonContainer: {
    flex: 1,
    minWidth: "30%",
  },
  complainButtonRNEStyle: {
    backgroundColor: "#FFF5F5",
    borderColor: "#FFE5E5",
  },
  complainButtonTextRNEStyle: {
    color: "#FF3B30",
  },
  modalButtonCancelRNE: {
    backgroundColor: "#F2F2F7",
    borderColor: "#E5E5EA",
  },
  modalButtonCancelTextRNE: {
    color: "#000",
  },
  modalButtonSubmitRNE: {
    backgroundColor: "#007AFF",
  },
  requestPhotosContainer: {
    marginTop: 8,
  },
  requestPhotosList: {
    gap: 8,
  },
  requestPhotoItem: {
    width: 110,
    height: 110,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
    marginRight: 10,
    position: "relative",
    borderWidth: 1,
    borderColor: "#E5E5EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  requestPhoto: {
    width: "100%",
    height: "100%",
  },
  requestPhotoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  requestActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  requestActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F2F2F7",
    flex: 1,
    justifyContent: "center",
  },
  requestActionText: {
    fontSize: 14,
    color: "#007AFF",
    fontWeight: "600",
  },
  fullscreenPhotoContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenPhotoClose: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 1000,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenPhotoScroll: {
    flex: 1,
  },
  fullscreenPhotoScrollContent: {
    alignItems: "center",
  },
  fullscreenPhotoItem: {
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenPhotoImage: {
    // Размеры устанавливаются динамически через style prop
  },
  fullscreenPhotoInfo: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fullscreenPhotoCounter: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
});

