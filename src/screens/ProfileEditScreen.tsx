import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Button } from "@rneui/base";
import ImageCropPicker from "react-native-image-crop-picker";
import { getProfile, updateProfile, uploadProfileAvatar } from "../lib/api";
import type { UserProfile } from "../types/api";
import { API_BASE } from "../lib/config";

interface Props {
  navigation: any;
}

export default function ProfileEditScreen({ navigation }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [name, setName] = useState("");
  const [boosty, setBoosty] = useState("");
  const [avatarRefresh, setAvatarRefresh] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    getProfile()
      .then((res) => {
        setProfile(res);
        const serverName = res.display_name ?? (res as any).name ?? "";
        setName(serverName);
        setBoosty(res.boosty_url || "");
      })
      .catch((err: any) => {
        Alert.alert("Ошибка", err?.message || "Не удалось загрузить профиль");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const pickCroppedImageFromGallery = async (): Promise<{ uri: string; name?: string; type?: string } | null> => {
    try {
      const res: any = await ImageCropPicker.openPicker({
        mediaType: "photo",
        cropping: true,
        cropperCircleOverlay: true,
        width: 512,
        height: 512,
        compressImageQuality: 0.8,
      });

      if (!res) return null;
      const img = Array.isArray(res) ? res[0] : res;
      return {
        uri: img.path,
        name: img.filename || "avatar.jpg",
        type: img.mime || "image/jpeg",
      };
    } catch (e: any) {
      if (e?.message?.includes("cancelled")) return null;
      throw e;
    }
  };

  const takeCroppedPhoto = async (): Promise<{ uri: string; name?: string; type?: string } | null> => {
    try {
      const res: any = await ImageCropPicker.openCamera({
        mediaType: "photo",
        cropping: true,
        cropperCircleOverlay: true,
        width: 512,
        height: 512,
        compressImageQuality: 0.8,
      });
      if (!res) return null;
      const img = Array.isArray(res) ? res[0] : res;
      return {
        uri: img.path,
        name: img.filename || "avatar.jpg",
        type: img.mime || "image/jpeg",
      };
    } catch (e: any) {
      if (e?.message?.includes("cancelled")) return null;
      throw e;
    }
  };

  const uploadAvatar = async (file: { uri: string; name?: string; type?: string }) => {
    setAvatarUploading(true);
    try {
      // Локальный превью
      setProfile((p) => (p ? { ...p, avatar_url: file.uri } : p));
      setAvatarRefresh((v) => v + 1);

      const resp: any = await uploadProfileAvatar(file);
      if (resp && resp.avatar_url) {
        setProfile((p) => (p ? { ...p, avatar_url: resp.avatar_url } : p));
      } else {
        const fresh = await getProfile();
        setProfile(fresh);
      }
      setAvatarRefresh((v) => v + 1);
      Alert.alert("Аватар обновлён");
    } catch (err: any) {
      Alert.alert("Ошибка", err?.message || "Не удалось загрузить аватар");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert("Изменить фото", "Выберите источник", [
      {
        text: "Галерея",
        onPress: async () => {
          try {
            const file = await pickCroppedImageFromGallery();
            if (file) await uploadAvatar(file);
          } catch (e: any) {
            Alert.alert("Ошибка", e?.message || "Не удалось выбрать фото");
          }
        },
      },
      {
        text: "Камера",
        onPress: async () => {
          try {
            const file = await takeCroppedPhoto();
            if (file) await uploadAvatar(file);
          } catch (e: any) {
            Alert.alert("Ошибка", e?.message || "Не удалось сделать фото");
          }
        },
      },
      { text: "Отмена", style: "cancel" },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedBoosty = boosty.trim();
      const payload: any = {
        name: trimmedName || undefined,
        display_name: trimmedName || undefined,
        // если строка пустая, явно отправляем null чтобы очистить ссылку на сервере
        boosty_url: trimmedBoosty === "" ? null : trimmedBoosty,
      };
      const res = await updateProfile(payload);
      setProfile((prev) => {
        const base = (res && typeof res === "object" ? res : prev) || prev;
        return base
          ? {
              ...base,
              display_name: payload.display_name ?? (base as any).name ?? base.display_name,
              boosty_url:
                payload.boosty_url !== undefined
                  ? payload.boosty_url
                  : base.boosty_url,
            }
          : base;
      });
      setName(payload.display_name ?? "");
      Alert.alert("Сохранено");
      navigation.goBack();
    } catch (err: any) {
      Alert.alert("Ошибка", err?.message || "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={styles.cover} />
        <View style={styles.avatarWrapper}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{(name || "U").charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.avatarActionsRow}>
        <Button
          title="Изменить фото"
          onPress={handleChangePhoto}
          loading={avatarUploading}
          disabled={avatarUploading}
          buttonStyle={styles.avatarActionButton}
          titleStyle={styles.avatarActionTitle}
          containerStyle={{ flex: 1 }}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Имя</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Имя" />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Boosty</Text>
        <TextInput
          style={styles.input}
          value={boosty}
          onChangeText={setBoosty}
          placeholder="https://boosty.to/..."
          autoCapitalize="none"
        />
      </View>

      <Button title="Сохранить" onPress={handleSave} loading={saving} containerStyle={{ marginTop: 16 }} />
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
    backgroundColor: "#1DA1F2",
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
    backgroundColor: "#1DA1F2",
  },
  avatarActionTitle: {
    fontSize: 14,
    fontWeight: "600",
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
});


