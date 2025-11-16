import React, { useEffect, useState } from "react";
import { StatusBar, StyleSheet, View, Text, TouchableOpacity } from "react-native";
import MainScreen from "./src/screens/MainScreen";
import AuthScreen from "./src/screens/AuthScreen";
import ViolationDetailsScreen from "./src/screens/ViolationDetailsScreen";
import { DeviceEventEmitter } from "react-native";
import { loadToken, clearToken } from "./src/lib/auth";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

const Stack = createNativeStackNavigator();

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      setToken(t);
      setReady(true);
    })();
    const sub = DeviceEventEmitter.addListener("auth:changed", (e: any) => {
      setToken(e?.token || null);
    });
    return () => sub.remove();
  }, []);

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
                      <TouchableOpacity
                        onPress={async () => {
                          await clearToken();
                        }}
                        style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 6 }}
                      >
                        <Text>Logout</Text>
                      </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
