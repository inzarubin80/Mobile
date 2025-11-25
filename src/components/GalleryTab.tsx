import React from "react";
import { View, StyleSheet, Text, FlatList, TouchableOpacity, Image } from "react-native";
import type { ViolationPhoto } from "../types/api";

interface GalleryTabProps {
  photos: ViolationPhoto[];
  isMountedRef: React.MutableRefObject<boolean>;
}

export default function GalleryTab({ photos, isMountedRef }: GalleryTabProps) {
  return (
    <View style={styles.container}>
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
                    console.error("[GalleryTab] Image load error:", e.nativeEvent.error, "URI:", imageUri);
                  }
                }}
                onLoad={() => {
                  if (isMountedRef.current) {
                    console.log("[GalleryTab] Image loaded successfully:", imageUri);
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
  );
}

const styles = StyleSheet.create({
  container: {
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
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#999",
    textAlign: "center",
  },
});

