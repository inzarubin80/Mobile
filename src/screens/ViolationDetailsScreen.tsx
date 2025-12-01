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
  Share,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { launchImageLibrary, launchCamera, Asset } from "react-native-image-picker";
import { PermissionsAndroid } from "react-native";
import { Button, Input, Icon } from "@rneui/base";
import type { Violation } from "../types/api";
import { getViolationById, closeViolationRequest } from "../lib/api";
import HistoryTab from "../components/HistoryTab";
import ChatTab from "../components/ChatTab";
import TabContent from "../components/TabContent";

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
  const [activeTab, setActiveTab] = useState<"chat" | "history">("history");
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionType, setResolutionType] = useState<"resolved" | "partially" | null>(null);
  const [resolutionComment, setResolutionComment] = useState("");
  const [resolutionPhotos, setResolutionPhotos] = useState<Array<{ uri: string; name?: string; type?: string }>>([]);
  const [submittingResolution, setSubmittingResolution] = useState(false);
  const isMountedRef = useRef(true);
  const [userVote, setUserVote] = useState<"like" | "dislike" | null>(null);
  const [likesCount, setLikesCount] = useState(0);
  const [dislikesCount, setDislikesCount] = useState(0);

  // Log lifecycle events and set mounted flag
  useEffect(() => {
    // component mounted
    isMountedRef.current = true;
    return () => {
      // component unmounting
      isMountedRef.current = false;
    };
  }, []);

  // Log navigation events
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      // navigation beforeRemove
      isMountedRef.current = false;
    });
    return unsubscribe;
  }, [navigation]);

  // Load violation details on mount if we have an ID
  useEffect(() => {
    const violationId = id || initialViolation.id;
    // initial violation loaded
    if (violationId) {
      setLoading(true);
      setError(null);
      getViolationById(violationId)
        .then((data) => {
          // Check if component is still mounted before updating state
          if (!isMountedRef.current) {
            // component unmounted, skip
            return;
          }
          // loaded data
          // Merge loaded data with initial data (initial takes precedence for fields like type, status)
          setViolation((prev) => {
            const merged = { ...prev, ...data, id: violationId };
            // merged violation
            return merged;
          });
          setLoading(false);
        })
        .catch((err) => {
          // Check if component is still mounted before updating state
          if (!isMountedRef.current) {
            // component unmounted, skip error state update
            return;
          }
          // failed to load
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

  const showPrimaryActions = canMarkAsResolved && activeTab === "history";

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

  const handleLikePress = useCallback(() => {
    setUserVote((prev) => {
      if (prev === "like") {
        setLikesCount((c) => Math.max(0, c - 1));
        return null;
      }
      if (prev === "dislike") {
        setDislikesCount((c) => Math.max(0, c - 1));
        setLikesCount((c) => c + 1);
        return "like";
      }
      setLikesCount((c) => c + 1);
      return "like";
    });
  }, []);

  const handleDislikePress = useCallback(() => {
    setUserVote((prev) => {
      if (prev === "dislike") {
        setDislikesCount((c) => Math.max(0, c - 1));
        return null;
      }
      if (prev === "like") {
        setLikesCount((c) => Math.max(0, c - 1));
        setDislikesCount((c) => c + 1);
        return "dislike";
      }
      setDislikesCount((c) => c + 1);
      return "dislike";
    });
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
            <View style={styles.headerRight}>
              <Text style={styles.date}>{formatDate(violation.created_at)}</Text>
            </View>
          </View>
          <Text style={styles.coords}>
            {violation.lat.toFixed(6)}, {violation.lng.toFixed(6)}
          </Text>
          {violation.description && (
            <Text style={styles.description}>{violation.description}</Text>
          )}

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.headerVoteButton,
                userVote === "like" && styles.headerVoteButtonLikeActive,
              ]}
              onPress={handleLikePress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon
                name="thumb-up"
                type="material"
                size={16}
                color={userVote === "like" ? "#34C759" : "#007AFF"}
              />
              {likesCount > 0 && (
                <Text style={styles.headerVoteCount}>{likesCount}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.headerVoteButton,
                userVote === "dislike" && styles.headerVoteButtonDislikeActive,
              ]}
              onPress={handleDislikePress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon
                name="thumb-down"
                type="material"
                size={16}
                color={userVote === "dislike" ? "#FF3B30" : "#007AFF"}
              />
              {dislikesCount > 0 && (
                <Text style={styles.headerVoteCount}>{dislikesCount}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleShare}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="share" type="material" color="#007AFF" size={18} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerComplainButton}
              onPress={handleComplain}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="report-problem" type="material" color="#FF3B30" size={18} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "history" && styles.tabActive]}
            onPress={() => setActiveTab("history")}
          >
            <Text style={[styles.tabText, activeTab === "history" && styles.tabTextActive]}>
              Действия {violation.requests && violation.requests.length > 0 ? `(${violation.requests.length})` : ""}
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
        <TabContent active={activeTab === "history"}>
          <HistoryTab violation={violation} isMountedRef={isMountedRef} />
        </TabContent>
        <TabContent active={activeTab === "chat"}>
          <ChatTab />
        </TabContent>

        {/* Primary Actions - Status buttons (always mounted to prevent Fabric crashes) */}
        <View
          style={[
            styles.primaryActions,
            {
              opacity: showPrimaryActions ? 1 : 0,
              pointerEvents: showPrimaryActions ? "auto" : "none",
              height: showPrimaryActions ? undefined : 0,
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
            containerStyle={{ marginBottom: 12 }}
          />
          <Button
            onPress={handleSubscribe}
            title="Подписаться"
            icon={<Icon name="notifications-active" type="material" color="#FFFFFF" size={20} />}
            iconPosition="left"
            buttonStyle={{ backgroundColor: "#007AFF" }}
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
    backgroundColor: "#F5F5F5",
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    alignSelf: "center",
    width: "80%",
    maxWidth: 320,
  },
  headerVoteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
  },
  headerVoteButtonLikeActive: {
    backgroundColor: "#E3FCEC",
  },
  headerVoteButtonDislikeActive: {
    backgroundColor: "#FFECEC",
  },
  headerVoteCount: {
    marginLeft: 4,
    fontSize: 12,
    color: "#555",
    fontWeight: "600",
  },
  headerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
    justifyContent: "center",
    alignItems: "center",
  },
  headerComplainButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF5F5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFE5E5",
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
    marginTop: 0,
    paddingTop: 0,
  },
  requestCardRNE: {
    marginTop: 0,
    marginBottom: 12,
    marginHorizontal: 0,
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

