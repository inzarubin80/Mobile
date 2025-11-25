import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  Share,
  Platform,
  Dimensions,
  Modal,
} from "react-native";
import { Card, Badge, Avatar, Icon } from "@rneui/base";
import type { Violation, ViolationRequest } from "../types/api";

interface HistoryTabProps {
  violation: Violation;
  isMountedRef: React.MutableRefObject<boolean>;
}

export default function HistoryTab({ violation, isMountedRef }: HistoryTabProps) {
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{ uri: string; index: number; photos: any[] } | null>(null);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get("window"));

  // Обновление размеров экрана при изменении ориентации
  React.useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setScreenDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

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
      open: "#34C759",
      partially_closed: "#FF9500",
      closed: "#007AFF",
    };
    return colors[status] || "#999";
  }, []);

  const getRequestStatusIcon = useCallback((status: string) => {
    const icons: Record<string, string> = {
      open: "add-circle-outline",
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
      if (Platform.OS === "ios" || Platform.OS === "android") {
        const Clipboard = require("react-native").Clipboard;
        if (Clipboard && Clipboard.setString) {
          Clipboard.setString(info);
          Alert.alert("Скопировано", "Информация о заявке скопирована");
        } else {
          await Share.share({ message: info, title: "Информация о заявке" });
        }
      } else {
        await Share.share({ message: info, title: "Информация о заявке" });
      }
    } catch (error: any) {
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

  if (!violation.requests || violation.requests.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>История заявок пуста</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.container}>
        {[...violation.requests]
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((item) => {
              const isExpanded = expandedRequests.has(item.id);
              const hasContent = (item.comment && item.comment.trim()) || (item.photos && item.photos.length > 0);
              return (
                <Card key={item.id} containerStyle={[styles.requestCardRNE, { borderLeftColor: getRequestStatusColor(item.status) }]}>
                  <TouchableOpacity
                    style={styles.requestCardHeader}
                    onPress={() => hasContent && toggleRequestExpanded(item.id)}
                    activeOpacity={hasContent ? 0.7 : 1}
                  >
                    <View style={styles.requestHeaderLeft}>
                      <View style={styles.requestHeaderTop}>
                        <Badge
                          value={getRequestStatusLabel(item.status)}
                          status="success"
                          badgeStyle={{
                            backgroundColor: getRequestStatusColor(item.status),
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 14,
                            minHeight: 26,
                          }}
                          textStyle={{
                            fontSize: 11,
                            fontWeight: "700",
                            letterSpacing: 0.3,
                            lineHeight: 14,
                          }}
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

                  {isExpanded && hasContent && (
                    <View style={styles.requestCardExpandable}>
                      <View style={styles.requestDateExpanded}>
                        <Icon name="schedule" type="material" size={14} color="#999" />
                        <Text style={styles.requestDateExpandedText}>{formatDate(item.created_at)}</Text>
                      </View>
                      {item.comment && item.comment.trim() && (
                        <View style={styles.requestCommentContainer}>
                          <View style={styles.requestCommentHeader}>
                            <Icon name="comment" type="material" size={16} color="#666" />
                            <Text style={styles.requestCommentLabel}>Комментарий</Text>
                          </View>
                          <Text style={styles.requestComment}>{item.comment}</Text>
                        </View>
                      )}
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

      {/* Fullscreen Photo Modal */}
      <Modal
        visible={fullscreenPhoto !== null}
        transparent
        animationType="fade"
        onRequestClose={closeFullscreenPhoto}
      >
        {fullscreenPhoto && (
          <View style={styles.fullscreenPhotoContainer}>
            <TouchableOpacity
              style={styles.fullscreenPhotoClose}
              onPress={closeFullscreenPhoto}
              activeOpacity={0.8}
            >
              <Icon name="close" type="material" size={32} color="#FFFFFF" />
            </TouchableOpacity>
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
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 12,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    flexDirection: "column",
    gap: 12,
    width: "100%",
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
    width: "100%",
    alignSelf: "stretch",
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
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
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
    zIndex: 1001,
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

