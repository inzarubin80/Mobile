import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import sha256 from "js-sha256";
import { encode as encodeBase64 } from "base64-arraybuffer";
import { saveToken, makeMockJwt } from "../lib/auth";
import { getProviders, beginLogin } from "../lib/api";
import { API_BASE } from "../lib/config";
import type { Provider } from "../types/api";
import queryString from "query-string";

// Simple in-memory map to keep verifier for a given state until exchange.
const verifierByState = new Map<string, string>();

// Helpers built on libraries: crypto.getRandomValues + base64-arraybuffer
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomURLSafe(n: number) {
  // PKCE code_verifier should be 43-128 chars; generate enough bytes and slice
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  const b64 = encodeBase64(arr.buffer);
  return toBase64Url(b64).slice(0, n);
}

function codeChallengeFromVerifier(verifier: string) {
  // Use js-sha256 to get byte array, then base64url-encode via library
  const arr: number[] =
    typeof (sha256 as any).array === "function"
      ? (sha256 as any).array(verifier)
      : Array.from(new Uint8Array((sha256 as any).arrayBuffer?.(verifier) || []));
  const bytes = new Uint8Array(arr);
  const b64 = encodeBase64(bytes.buffer);
  return toBase64Url(b64);
}

export default function AuthScreen() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);

  // Lightweight debugger with consistent prefix
  const debug = useCallback((msg: string, extra?: any) => {
    // eslint-disable-next-line no-console
    console.log(`[AuthScreen] ${msg}`, extra ?? "");
  }, []);

  useEffect(() => {
    (async () => {
      await fetchProviders();
    })();
  }, []);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      debug("fetchProviders -> GET", API_BASE + "/api/providers");
      const data = await getProviders();
      const keys = (data || []).map((p) => p?.Provider).filter(Boolean);
      const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (duplicates.length) {
        console.warn("[AuthScreen] duplicate provider keys detected:", Array.from(new Set(duplicates)));
      }
      setProviders(data);
    } catch (err: any) {
      console.error("[AuthScreen] fetchProviders error:", err);
      Alert.alert(
        "Error loading providers",
        `${err?.message || "failed to load providers"}\nServer: ${API_BASE}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Log state changes relevant to layout updates
  useEffect(() => {
    debug("providers changed, count:", providers?.length ?? 0);
  }, [providers, debug]);
  useEffect(() => {
    debug("loading:", loading);
  }, [loading, debug]);

  const handleProviderPress = useCallback(async (provider: Provider) => {
    setLoading(true);
    try {
      // mobile generates verifier + challenge
      const verifier = randomURLSafe(64);
      const challenge = codeChallengeFromVerifier(verifier);

      // call server login endpoint
      debug("beginLogin", { provider: provider.Provider });
      const json = await beginLogin(undefined, provider.Provider, challenge);
      const { auth_url, state } = json;
      if (!auth_url) throw new Error("no auth_url returned");

      // save verifier by state for later exchange
      if (state) verifierByState.set(state, verifier);

      // open system browser with auth_url
      await Linking.openURL(auth_url);
    } catch (err: any) {
      console.error("[AuthScreen] handleProviderPress error:", err);
      Alert.alert("Login error", err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Deep link handling (warden://auth/callback?provider=yandex&code=...&state=...) ---
  function parseQuery(url: string): Record<string, string> {
    const parsed = queryString.parseUrl(url);
    const q = parsed.query as Record<string, string | string[]>;
    const out: Record<string, string> = {};
    Object.keys(q).forEach((k) => {
      const v = q[k];
      out[k] = Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
    });
    return out;
  }

  const handleRedirect = useCallback(async (url: string) => {
    try {
      const params = parseQuery(url);
      const provider = params["provider"] || "yandex";
      const code = params["code"];
      const state = params["state"];
      const oauthError = params["error"];
      const errorDesc = params["error_description"];
      if (oauthError) {
        console.warn("[AuthScreen] oauth error:", oauthError, errorDesc);
        Alert.alert("OAuth error", decodeURIComponent(errorDesc || oauthError));
        return;
      }
      if (!code || !state) {
        console.warn("[AuthScreen] redirect missing code/state");
        return;
      }
      const verifier = verifierByState.get(state);
      if (!verifier) {
        console.warn("[AuthScreen] no verifier for state", state);
        return;
      }
      setLoading(true);
      // MOCK EXCHANGE: generate local JWT for dev flow
      const jwt = makeMockJwt({ id: "mock-user", name: "Mock User" });
      await saveToken(jwt);
      verifierByState.delete(state);
      Alert.alert("Success", "Authenticated successfully (mock)");
    } catch (err: any) {
      console.error("[AuthScreen] handleRedirect error:", err);
      Alert.alert("Exchange error", err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => handleRedirect(url);
    // Subscribe
    const sub: any = (Linking as any).addEventListener
      ? (Linking as any).addEventListener("url", onUrl)
      : null;
    // Handle cold start
    Linking.getInitialURL().then((initial) => {
      if (initial) handleRedirect(initial);
    });
    // Cleanup
    return () => {
      if (sub && typeof sub.remove === "function") sub.remove();
      else if ((Linking as any).removeEventListener) (Linking as any).removeEventListener("url", onUrl);
    };
  }, []);

  const keyExtractor = useCallback((item: Provider, index: number) => {
    const key = item?.Provider ?? `idx-${index}`;
    if (!item?.Provider) {
      console.warn("[AuthScreen] missing Provider key at index", index, item);
    }
    return key;
  }, []);

  const ProviderItem = useCallback(
    ({ item }: { item: Provider }) => {
      useEffect(() => {
        debug("mount row", item.Provider);
        return () => debug("unmount row", item.Provider);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [item.Provider]);
      return (
        <TouchableOpacity style={styles.item} onPress={() => handleProviderPress(item)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.Name ?? item.Provider}</Text>
            <Text style={styles.small}>{item.Provider}</Text>
          </View>
          <Text style={styles.go}>Open</Text>
        </TouchableOpacity>
      );
    },
    [handleProviderPress, debug]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      <FlatList
        data={providers}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => <ProviderItem item={item} />}
        ListEmptyComponent={!loading ? <Text style={styles.small}>No providers</Text> : null}
        removeClippedSubviews={false}
      />
      <View
        style={[
          styles.loadingOverlay,
          { opacity: loading ? 1 : 0, pointerEvents: loading ? "auto" : "none" },
        ]}
      >
        <ActivityIndicator />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  item: { flexDirection: "row", padding: 12, borderBottomWidth: 1, borderColor: "#eee", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "600" },
  small: { color: "#666", fontSize: 12 },
  go: { color: "#007aff", fontWeight: "600" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});


