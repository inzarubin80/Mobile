import React, { useEffect, useState } from "react";
import { StatusBar, StyleSheet, View, Text } from "react-native";
import { Button } from "@rneui/base";
import MainScreen from "./src/screens/MainScreen";
import AuthScreen from "./src/screens/AuthScreen";
import ViolationDetailsScreen from "./src/screens/ViolationDetailsScreen";
import AddViolationScreen from "./src/screens/AddViolationScreen";
import { DeviceEventEmitter } from "react-native";
import { loadToken, clearToken } from "./src/lib/auth";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ThemeProvider, createTheme } from "@rneui/themed";

const Stack = createNativeStackNavigator();

// Кастомная тема для React Native Elements
const theme = createTheme({
  lightColors: {
    primary: "#007AFF",
    secondary: "#34C759",
    success: "#34C759",
    warning: "#FF9500",
    error: "#FF3B30",
    background: "#F5F5F5",
    white: "#FFFFFF",
    black: "#000000",
    grey0: "#393e42",
    grey1: "#43484d",
    grey2: "#5e6977",
    grey3: "#86939e",
    grey4: "#bdc6cf",
    grey5: "#e1e8ed",
    greyOutline: "#bbb",
    searchBg: "#303337",
    divider: "#E5E5EA",
  },
  darkColors: {
    primary: "#007AFF",
    secondary: "#34C759",
    background: "#000000",
  },
  mode: "light",
  components: {
    Button: {
      raised: true,
      borderRadius: 12,
      buttonStyle: {
        paddingVertical: 14,
      },
      titleStyle: {
        fontSize: 16,
        fontWeight: "700",
      },
    },
    Card: {
      containerStyle: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#E5E5EA",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    },
    Input: {
      containerStyle: {
        paddingHorizontal: 0,
      },
      inputContainerStyle: {
        borderWidth: 1,
        borderColor: "#E5E5EA",
        borderRadius: 12,
        paddingHorizontal: 16,
        backgroundColor: "#F9F9F9",
      },
      inputStyle: {
        fontSize: 16,
      },
    },
  },
});

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    console.log("[App] Component mounted");
    (async () => {
      const t = await loadToken();
      console.log("[App] Token loaded:", t ? "exists" : "null");
      setToken(t);
      setReady(true);
      console.log("[App] Ready state set to true");
    })();
    const sub = DeviceEventEmitter.addListener("auth:changed", (e: any) => {
      console.log("[App] Auth changed event:", e?.token ? "token set" : "token cleared");
      setToken(e?.token || null);
    });
    return () => {
      console.log("[App] Component unmounting");
      sub.remove();
    };
  }, []);

  useEffect(() => {
    console.log("[App] State changed - ready:", ready, "token:", token ? "exists" : "null");
  }, [ready, token]);

  function SplashScreen() {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator>
          {ready ? (
            token ? (
              <>
                <Stack.Screen
                  name="Main"
                  component={MainScreen}
                  options={{
                    title: "Home",
                    headerRight: () => (
                      <Button
                        title="Logout"
                        onPress={async () => {
                          await clearToken();
                        }}
                        type="clear"
                        titleStyle={{ fontSize: 14 }}
                        buttonStyle={{ paddingHorizontal: 10 }}
                      />
                    ),
                  }}
                />
                <Stack.Screen
                  name="ViolationDetails"
                  component={ViolationDetailsScreen}
                  options={{
                    title: "Детали нарушения",
                    presentation: "card",
                  }}
                />
                <Stack.Screen
                  name="AddViolation"
                  component={AddViolationScreen}
                  options={{
                    title: "Новая проблема",
                    presentation: "card",
                  }}
                />
              </>
            ) : (
              <Stack.Screen
                name="Auth"
                component={AuthScreen}
                options={{ headerShown: false }}
              />
            )
          ) : (
            <Stack.Screen
              name="Splash"
              component={SplashScreen}
              options={{ headerShown: false }}
            />
          )}
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
