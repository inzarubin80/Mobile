import React, { useState, useCallback } from "react";
import { View, StyleSheet, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from "react-native";
import { Icon } from "@rneui/base";

type ChatAuthor = "me" | "system" | "moderator";

interface ChatMessage {
  id: string;
  author: ChatAuthor;
  text: string;
  createdAt: Date;
}

export default function ChatTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "sys-1",
      author: "system",
      text: "Чат пока работает в тестовом режиме. Сообщения не отправляются на сервер.",
      createdAt: new Date(),
    },
    {
      id: "mod-1",
      author: "moderator",
      text: "Задайте вопрос или оставьте комментарий по этой проблеме — скоро здесь появятся ответы операторов.",
      createdAt: new Date(),
    },
  ]);

  const [inputValue, setInputValue] = useState("");

  const formatTime = useCallback((date: Date) => {
    try {
      return date.toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    const newMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: "me",
      text,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setInputValue("");
  }, [inputValue]);

  const canSend = inputValue.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.messagesContainer}>
        {messages.map((msg) => {
          const isMe = msg.author === "me";
          const isSystem = msg.author === "system";

          return (
            <View
              key={msg.id}
              style={[styles.messageRow, isMe ? styles.messageRowMe : styles.messageRowOther]}
            >
              {!isMe && (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {isSystem ? "GW" : "A"}
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.bubble,
                  isMe ? styles.bubbleMe : styles.bubbleOther,
                  isSystem && styles.bubbleSystem,
                ]}
              >
                {!isMe && (
                  <Text style={styles.authorLabel}>
                    {isSystem ? "Система" : "Оператор"}
                  </Text>
                )}
                <Text style={styles.messageText}>{msg.text}</Text>
                <Text style={styles.timeText}>{formatTime(msg.createdAt)}</Text>
              </View>
            </View>
          );
        })}
      </View>

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

      <Text style={styles.previewNote}>
        Сообщения сейчас не отправляются на сервер и видны только вам. Мы работаем над полноценным чатом.
      </Text>
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
  messagesContainer: {
    maxHeight: 280,
    marginBottom: 12,
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
    backgroundColor: "#007AFF",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#F2F2F7",
    borderBottomLeftRadius: 4,
  },
  bubbleSystem: {
    backgroundColor: "#E5F2FF",
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
  previewNote: {
    marginTop: 6,
    fontSize: 11,
    color: "#999",
  },
});
