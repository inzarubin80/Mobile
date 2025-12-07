import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { Icon } from "@rneui/base";
import type { ViolationChatMessage } from "../types/api";

interface ChatTabProps {
  messages: ViolationChatMessage[];
  currentUserId: number | null;
  error: string | null;
  sending: boolean;
  onSend: (text: string) => void | Promise<void>;
  onUpdateMessage: (id: string, text: string) => void | Promise<void>;
  onDeleteMessage: (id: string) => void | Promise<void>;
}

export default function ChatTab({
  messages,
  currentUserId,
  error,
  sending,
  onSend,
  onUpdateMessage,
  onDeleteMessage,
}: ChatTabProps) {
  const [inputValue, setInputValue] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);

  const canSend = inputValue.trim().length > 0 && !sending;

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    try {
      if (editingMessageId) {
        await onUpdateMessage(editingMessageId, text);
        setEditingMessageId(null);
      } else {
        await onSend(text);
      }
      setInputValue("");
    } catch {
      // ошибка уже обработана выше
    }
  }, [inputValue, onSend, editingMessageId, onUpdateMessage]);

  const formatTime = useCallback((dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, []);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [messages]
  );

  const renderItem = useCallback(
    ({ item }: { item: ViolationChatMessage }) => {
      const isSystem = item.is_system;
      const isMe = !isSystem && currentUserId != null && item.user_id === currentUserId;
      const displayName =
        isMe
          ? "Вы"
          : item.user_name && item.user_name.trim().length > 0
          ? item.user_name
          : `Участник #${item.user_id}`;

      if (isSystem) {
        return (
          <View style={styles.systemMessageRow}>
            <Text style={styles.systemMessageText}>{item.text}</Text>
          </View>
        );
      }

      if (isMe) {
        return (
          <View style={[styles.messageRow, styles.messageRowMe]}>
            <View style={styles.myMessageColumn}>
              <View style={[styles.bubble, styles.bubbleMe]}>
                <Text style={styles.authorLabel}>{displayName}</Text>
                <Text style={styles.messageText}>{item.text}</Text>
                <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
              </View>
              <View style={styles.messageActionsRow}>
                <TouchableOpacity
                  onPress={() => {
                    setEditingMessageId(item.id);
                    setInputValue(item.text);
                  }}
                  style={styles.messageActionButton}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Icon name="edit" type="material" size={18} color="#007AFF" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      "Удалить сообщение",
                      "Вы уверены, что хотите удалить это сообщение?",
                      [
                        { text: "Отмена", style: "cancel" },
                        {
                          text: "Удалить",
                          style: "destructive",
                          onPress: async () => {
                            try {
                              await onDeleteMessage(item.id);
                            } catch {
                              // ошибка уже обработана наверху
                            }
                          },
                        },
                      ]
                    );
                  }}
                  style={styles.messageActionButton}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Icon name="delete-outline" type="material" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      }

      return (
        <View style={[styles.messageRow, styles.messageRowOther]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {displayName.trim().charAt(0).toUpperCase() || "U"}
            </Text>
          </View>
          <View style={[styles.bubble, styles.bubbleOther]}>
            <Text style={styles.authorLabel}>{displayName}</Text>
            <Text style={styles.messageText}>{item.text}</Text>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
        </View>
      );
    },
    [currentUserId, formatTime, onDeleteMessage]
  );

  const keyExtractor = useCallback((item: ViolationChatMessage) => item.id, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      {editingMessageId && (
        <View style={styles.editingIndicatorRow}>
          <Text style={styles.editingIndicatorText}>Редактирование сообщения</Text>
          <TouchableOpacity
            onPress={() => {
              setEditingMessageId(null);
              setInputValue("");
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Icon name="close" type="material" size={16} color="#999" />
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      <ScrollView
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
      >
        {sortedMessages.map((item) => (
          <View key={keyExtractor(item)}>{renderItem({ item })}</View>
        ))}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Напишите сообщение..."
          placeholderTextColor="#A0A0A0"
          value={inputValue}
          onChangeText={setInputValue}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon
            name="send"
            type="material"
            size={20}
            color={canSend ? "#FFFFFF" : "#C0C0C0"}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  editingIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  editingIndicatorText: {
    fontSize: 12,
    color: "#555",
  },
  errorText: {
    fontSize: 12,
    color: "#FF3B30",
    marginBottom: 4,
  },
  messagesList: {
    maxHeight: 280,
    marginBottom: 12,
  },
  messagesContent: {
    paddingBottom: 4,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  messageRowMe: {
    justifyContent: "flex-end",
  },
  messageRowOther: {
    justifyContent: "flex-start",
  },
  systemMessageRow: {
    alignItems: "center",
    marginBottom: 6,
  },
  systemMessageText: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#F2F2F7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    alignSelf: "flex-end",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMe: {
    backgroundColor: "#E3F2FF",
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  bubbleOther: {
    backgroundColor: "#F2F2F7",
    borderBottomLeftRadius: 4,
  },
  myMessageColumn: {
    alignItems: "flex-end",
    maxWidth: "85%",
  },
  authorLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 2,
    fontWeight: "600",
  },
  messageText: {
    fontSize: 14,
    color: "#111",
  },
  timeText: {
    fontSize: 11,
    color: "#999",
    alignSelf: "flex-end",
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F9F9F9",
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: "#000",
    maxHeight: 80,
    paddingVertical: 4,
    paddingRight: 8,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#007AFF",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#E0E0E0",
  },
  messageActionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
    gap: 8,
  },
  messageActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E5ECFF",
    alignItems: "center",
    justifyContent: "center",
  },
});
