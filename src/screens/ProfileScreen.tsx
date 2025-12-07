import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  Linking,
} from "react-native";
import { Button, Icon } from "@rneui/base";
import { getProfile, unlinkAuthProvider, getProviders, beginLogin } from "../lib/api";
import { clearToken } from "../lib/auth";
import type { UserProfile } from "../types/api";
import { API_BASE } from "../lib/config";
import { useFocusEffect } from "@react-navigation/native";

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<any[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
  const [avatarRefresh, setAvatarRefresh] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    getProfile()
      .then((res) => {
        setProfile(res);
      })
      .catch((err: any) => {
        Alert.alert("Ошибка", err?.message || "Не удалось загрузить профиль");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    loadProviders();
  }, [load, loadProviders]);

  // Обновляем профиль и провайдеров при возврате на экран
  useFocusEffect(
    useCallback(() => {
      load();
      loadProviders();
    }, [load, loadProviders])
  );

  const loadProviders = useCallback(() => {
    setProvidersLoading(true);
    getProviders()
      .then((res) => {
        setAvailableProviders(res || []);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setProvidersLoading(false));
  }, []);

  const handleLinkProvider = async (providerCode: string) => {
    try {
      setLinkingProvider(providerCode);
      const res = await beginLogin(undefined, providerCode);
      if (res && res.auth_url) {
        // open external auth url
        Linking.openURL(res.auth_url);
        Alert.alert("Открылось окно авторизации", "Завершите авторизацию в браузере, затем обновите профиль.");
      } else {
        Alert.alert("Ошибка", "Не удалось получить ссылку для авторизации");
      }
    } catch (err: any) {
      Alert.alert("Ошибка", err?.message || "Не удалось начать привязку");
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleUnlink = async (provider: string) => {
    Alert.alert("Открепить", `Открепить ${provider}?`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Открепить",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            const res = await unlinkAuthProvider(provider);
            setProfile(res);
            Alert.alert("Откреплено");
          } catch (err: any) {
            Alert.alert("Ошибка", err?.message || "Не удалось открепить провайдера");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleLogout = async () => {
    await clearToken();
    // navigation handled by App listeners
  };

  const resolveAvatarUri = (raw?: string | null): string | null => {
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
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return `${uri}?v=${avatarRefresh}`;
    }
    return uri;
  };

  const avatarUri = resolveAvatarUri(profile?.avatar_url);

  if (loading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* Верхний блок как в Twitter: обложка + аватар поверх */}
      <View style={styles.header}>
        <View style={styles.cover} />
        <View style={styles.avatarWrapper}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{(profile?.display_name || "U").charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Имя и Boosty */}
      <View style={styles.nameBlock}>
        <Text style={styles.displayName}>
          {profile?.display_name ?? (profile as any)?.name ?? "Имя пользователя"}
        </Text>
        {profile?.id != null && (
          <Text style={styles.handle}>id: {profile.id}</Text>
        )}
        {profile?.boosty_url ? (
          <TouchableOpacity
            onPress={() => {
              if (profile?.boosty_url) {
                Linking.openURL(profile.boosty_url).catch(() => {});
              }
            }}
          >
            <Text style={styles.boostyLink}>{profile.boosty_url}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Список провайдеров авторизации */}
      <View style={styles.providersSection}>
        <Text style={styles.sectionTitle}>Способы входа</Text>
        {providersLoading ? (
          <ActivityIndicator />
        ) : (
          availableProviders.map((prov) => {
            const code = prov.provider;
            const connected = profile?.connected_providers?.includes(code);
            return (
              <View key={code} style={styles.providerRow}>
                <Text style={styles.providerName}>{prov.name || code}</Text>
                <View style={{ flexDirection: "row" }}>
                  {connected ? (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ color: "#34C759", marginRight: 8 }}>Подключён</Text>
                      <TouchableOpacity onPress={() => handleUnlink(code)} style={styles.unlinkButton}>
                        <Icon name="link-off" type="material" color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleLinkProvider(code)}
                      style={[styles.unlinkButton, { backgroundColor: "#E8F2FF" }]}
                      disabled={!!linkingProvider}
                    >
                      <Text style={{ color: "#007AFF" }}>Привязать</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
        <Button title="Обновить" onPress={() => { load(); loadProviders(); }} type="clear" />
      </View>

      <View style={{ marginTop: 24 }}>
        <Button title="Выйти" onPress={handleLogout} buttonStyle={{ backgroundColor: "#FF3B30" }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    paddingBottom: 32,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    backgroundColor: "#FFFFFF",
    marginBottom: 40,
  },
  cover: {
    height: 110,
    backgroundColor: "#1DA1F2", // twitter blue
  },
  avatarWrapper: {
    position: "absolute",
    left: 16,
    bottom: -40,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#EEE",
  },
  avatar: { width: "100%", height: "100%" },
  avatarPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DDD",
  },
  avatarInitial: { fontSize: 32, color: "#555" },
  avatarActionsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  avatarActionButton: {
    borderRadius: 999,
    paddingVertical: 8,
  },
  avatarActionButtonOutline: {
    backgroundColor: "#FFFFFF",
    borderColor: "#1DA1F2",
  },
  avatarActionTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  avatarActionTitleOutline: {
    color: "#1DA1F2",
  },
  nameBlock: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  displayName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  handle: {
    marginTop: 2,
    fontSize: 14,
    color: "#6B7280",
  },
  boostyLink: {
    marginTop: 6,
    fontSize: 14,
    color: "#1DA1F2",
  },
  field: { marginTop: 12 },
  label: { fontSize: 12, color: "#6B7280", marginBottom: 4, marginHorizontal: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E5EA",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#FFF",
    marginHorizontal: 16,
  },
  providersSection: { marginTop: 20 },
  sectionTitle: { fontWeight: "700", marginBottom: 8 },
  providerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  providerName: { fontSize: 14 },
  unlinkButton: { padding: 8, borderRadius: 8, backgroundColor: "#FFF5F5" },
  helper: { color: "#999" },
});


