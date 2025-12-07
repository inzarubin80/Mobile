import React, { useState, useCallback } from "react";
import { View, StyleSheet, Text, TouchableOpacity, Image, ScrollView, Dimensions, Modal, Linking, Alert } from "react-native";
import { Card, Badge, Avatar, Icon } from "@rneui/base";
import type { Violation, ViolationRequest } from "../types/api";
import { API_BASE } from "../lib/config";

interface HistoryTabProps {
  violation: Violation;
  isMountedRef: React.MutableRefObject<boolean>;
  onRequestLike: (request: ViolationRequest) => void;
  onRequestDislike: (request: ViolationRequest) => void;
  onRequestComplain: (request: ViolationRequest) => void;
}

export default function HistoryTab({
  violation,
  isMountedRef,
  onRequestLike,
  onRequestDislike,
  onRequestComplain,
}: HistoryTabProps) {
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

  const resolveAvatarUri = useCallback((raw?: string | null): string | null => {
    if (!raw) return null;
    let uri = raw;
    if (raw.startsWith("/")) {
      uri = `${API_BASE}${raw}`;
    } else if (
      !raw.startsWith("http://") &&
      !raw.startsWith("https://") &&
      !raw.startsWith("file://") &&
      !raw.startsWith("content://")
    ) {
      uri = `${API_BASE}/${raw}`;
    }
    return uri;
  }, []);

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
              const canShowActions =
                item.status === "open" || item.status === "partially_closed" || item.status === "closed";
              const isOwner = item.created_by_user_id === violation.user_id;
              const avatarUri = resolveAvatarUri((item as any).author_avatar_url);
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
                            size={24}
                            rounded
                            source={avatarUri ? { uri: avatarUri } : undefined}
                            title={
                              avatarUri ? undefined : isOwner ? "В" : String(item.created_by_user_id)[0]
                            }
                            containerStyle={{ backgroundColor: "#007AFF", marginRight: 8 }}
                          />
                          <View style={styles.requestAuthorInfo}>
                            <Text style={styles.requestAuthor}>
                              {isOwner ? "Вы" : `ID ${item.created_by_user_id}`}
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

                      {canShowActions && (
                        <View style={styles.requestActionsRow}>
                          <TouchableOpacity
                            style={[
                              styles.requestVoteButton,
                              item.user_vote === "like" && styles.requestVoteButtonLikeActive,
                            ]}
                            onPress={() => onRequestLike(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Icon
                              name="thumb-up"
                              type="material"
                              size={16}
                              color={item.user_vote === "like" ? "#34C759" : "#007AFF"}
                            />
                            {(item.likes ?? 0) > 0 && (
                              <Text style={styles.requestVoteCount}>{item.likes}</Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.requestVoteButton,
                              item.user_vote === "dislike" && styles.requestVoteButtonDislikeActive,
                            ]}
                            onPress={() => onRequestDislike(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Icon
                              name="thumb-down"
                              type="material"
                              size={16}
                              color={item.user_vote === "dislike" ? "#FF3B30" : "#007AFF"}
                            />
                            {(item.dislikes ?? 0) > 0 && (
                              <Text style={styles.requestVoteCount}>{item.dislikes}</Text>
                            )}
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.requestComplainButton}
                            onPress={() => onRequestComplain(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Icon name="report-problem" type="material" size={18} color="#FF3B30" />
                          </TouchableOpacity>

                          {item.author_boosty_url ? (
                            <TouchableOpacity
                              style={styles.requestSupportButton}
                              onPress={() => {
                                const url = item.author_boosty_url;
                                if (!url) return;
                                Linking.openURL(url).catch(() => {
                                  Alert.alert("Ошибка", "Не удалось открыть ссылку Boosty");
                                });
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="favorite" type="material" size={18} color="#FF2D55" />
                              <Text style={styles.requestSupportText}>Поддержать</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      )}
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
    backgroundColor: "transparent",
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
  requestActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
  requestVoteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F2F2F7",
  },
  requestVoteButtonLikeActive: {
    backgroundColor: "#E3FCEC",
  },
  requestVoteButtonDislikeActive: {
    backgroundColor: "#FFECEC",
  },
  requestVoteCount: {
    marginLeft: 4,
    fontSize: 12,
    color: "#555",
    fontWeight: "600",
  },
  requestSupportButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFEFF4",
    borderWidth: 1,
    borderColor: "#FFD1E0",
  },
  requestSupportText: {
    marginLeft: 6,
    fontSize: 12,
    color: "#C2185B",
    fontWeight: "600",
  },
  requestComplainButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFF5F5",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FFE5E5",
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

