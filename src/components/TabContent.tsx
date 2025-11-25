import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

interface TabContentProps {
  active: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}

type VerticalGroupProps = TabContentProps;

/**
 * Компонент для отображения контента вкладки с вертикальной группировкой элементов
 * Управляет видимостью и выравниванием дочерних компонентов по вертикали
 */
export default function TabContent({ active, children, style }: TabContentProps) {
  return (
    <View
      style={[
        styles.verticalGroup,
        {
          opacity: active ? 1 : 0,
          pointerEvents: active ? "auto" : "none",
          height: active ? undefined : 0,
          overflow: active ? "visible" : "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Экспорт типа для использования в других компонентах
export type { VerticalGroupProps };

const styles = StyleSheet.create({
  verticalGroup: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "column",
    // backgroundColor: "#FF0000", // Временный цвет для визуализации границ
  },
});

