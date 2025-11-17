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
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { Violation } from "../types/api";
import { getViolationById } from "../lib/api";

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
  const [activeTab, setActiveTab] = useState<"gallery" | "chat">("gallery");
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionType, setResolutionType] = useState<"resolved" | "partially" | null>(null);
  const [resolutionComment, setResolutionComment] = useState("");
  const isMountedRef = useRef(true);

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
          // Merge loaded data with initial data (initial takes precedence for fields like type, status)
          setViolation((prev) => {
            const merged = { ...prev, ...data, id: violationId };
            console.log("[ViolationDetails] Merged violation:", JSON.stringify(merged, null, 2));
            console.log("[ViolationDetails] Merged photos:", merged.photos);
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
  const canMarkAsResolved = violation.status === "new" || violation.status === "in_progress" || !violation.status;

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

  const handleSubmitResolution = useCallback(() => {
    if (!resolutionComment.trim()) {
      Alert.alert("Ошибка", "Пожалуйста, добавьте комментарий");
      return;
    }
    // TODO: Отправить на сервер
    console.log("Submit resolution:", { type: resolutionType, comment: resolutionComment, violationId: violation.id });
    Alert.alert("Успешно", "Заявка на решение отправлена");
    setShowResolutionForm(false);
    setResolutionComment("");
    setResolutionType(null);
  }, [resolutionType, resolutionComment, violation.id]);

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
          <TouchableOpacity style={styles.resolvedButton} onPress={handleResolved}>
            <Text style={styles.resolvedButtonText}>✓ Решено</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.partiallyButton} onPress={handlePartiallyResolved}>
            <Text style={styles.partiallyButtonText}>~ Частично решено</Text>
          </TouchableOpacity>
        </View>

        {/* Secondary Actions */}
        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleSubscribe}>
            <Text style={styles.secondaryButtonText}>Подписаться</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
            <Text style={styles.secondaryButtonText}>Поделиться</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, styles.complainButtonSecondary]} onPress={handleComplain}>
            <Text style={[styles.secondaryButtonText, styles.complainButtonTextSecondary]}>Пожаловаться</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Resolution Form Modal */}
      <Modal
        visible={showResolutionForm}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowResolutionForm(false);
          setResolutionComment("");
          setResolutionType(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {resolutionType === "resolved" ? "Проблема решена" : "Проблема частично решена"}
            </Text>
            <Text style={styles.modalSubtitle}>Добавьте комментарий о решении</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={4}
              placeholder="Опишите, что было сделано..."
              value={resolutionComment}
              onChangeText={setResolutionComment}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowResolutionForm(false);
                  setResolutionComment("");
                  setResolutionType(null);
                }}
              >
                <Text style={styles.modalButtonCancelText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonSubmit]}
                onPress={handleSubmitResolution}
              >
                <Text style={styles.modalButtonSubmitText}>Отправить</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  resolvedButton: {
    backgroundColor: "#34C759",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#34C759",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  resolvedButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  partiallyButton: {
    backgroundColor: "#FF9500",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#FF9500",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  partiallyButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryActions: {
    flexDirection: "row",
    padding: 20,
    gap: 8,
    backgroundColor: "#FFFFFF",
    marginTop: 8,
    flexWrap: "wrap",
  },
  secondaryButton: {
    flex: 1,
    minWidth: "30%",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderWidth: 1,
    borderColor: "#E5E5EA",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "600",
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
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 32,
    maxHeight: "80%",
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
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#F2F2F7",
  },
  modalButtonCancelText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtonSubmit: {
    backgroundColor: "#007AFF",
  },
  modalButtonSubmitText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
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
});

