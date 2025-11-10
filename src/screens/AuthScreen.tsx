import React, { useEffect, useState } from "react";
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
import { saveToken, makeMockJwt } from "../lib/auth";

// Simple in-memory map to keep verifier for a given state until exchange.
const verifierByState = new Map<string, string>();

// Tiny helpers to avoid Node Buffer dependency in React Native
const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const a = i < len ? bytes[i++] : 0;
    const b = i < len ? bytes[i++] : 0;
    const c = i < len ? bytes[i++] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    out +=
      B64_ALPHABET[(triplet >> 18) & 0x3f] +
      B64_ALPHABET[(triplet >> 12) & 0x3f] +
      (i - 1 > len ? "=" : B64_ALPHABET[(triplet >> 6) & 0x3f]) +
      (i > len ? "=" : B64_ALPHABET[triplet & 0x3f]);
  }
  return out;
}
function base64ToUrlSafe(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : "0" + hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}
function randomURLSafe(n: number) {
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
  const b64 = bytesToBase64(arr);
  return base64ToUrlSafe(b64).slice(0, n);
}

function codeChallengeFromVerifier(verifier: string) {
  // js-sha256 may export a function or offer a .create() builder depending on the bundle.
  // Use a runtime fallback so TypeScript typing differences don't cause linter errors.
  const hex =
    typeof (sha256 as any).create === "function"
      ? (sha256 as any).create().update(verifier).hex()
      : (sha256 as any)(verifier);
  const bytes = hexToBytes(hex);
  const b64 = bytesToBase64(bytes);
  return base64ToUrlSafe(b64);
}

export default function AuthScreen() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiBase, setApiBase] = useState<string>("http://10.0.2.2:8090");
  const [detectingApi, setDetectingApi] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      console.log("[AuthScreen] mount - starting API detection");
      setDetectingApi(true);
      const base = await findWorkingApiBase();
      console.log("[AuthScreen] detected api base:", base);
      setApiBase(base);
      setDetectingApi(false);
      await fetchProviders(base);
    })();
  }, []);

  // Try common emulator / local addresses and return the first working one.
  async function findWorkingApiBase(): Promise<string> {
    const candidates = [
      "http://172.29.47.123:8090", // Genymotion
      //"http://localhost:8090", // when emulator maps localhost
    ];
    const timeoutMs = 2000;
    for (const c of candidates) {
      console.log("[AuthScreen] trying api candidate:", c);
      // use AbortController so a hanging fetch doesn't block other candidates
      const controller = new (globalThis as any).AbortController();
      const timer = setTimeout(() => {
        try {
          controller.abort();
        } catch {}
      }, timeoutMs);
      try {
        const res = await fetch(`${c}/api/providers`, { method: "GET", signal: controller.signal });
        clearTimeout(timer);
        console.log("[AuthScreen] candidate response status for", c, "->", res.status);
        if (res && (res.ok || res.status === 200)) {
          console.log("[AuthScreen] working api base found:", c);
          return c;
        }
      } catch (e: any) {
        clearTimeout(timer);
        const msg = e?.name === "AbortError" ? "timeout" : e?.message || e;
        console.warn("[AuthScreen] candidate failed:", c, msg);
        // ignore and try next candidate
      }
    }
    // fallback to the AVD address which is commonly correct
    return "http://10.0.2.2:8090";
  }

  async function fetchProviders(base?: string) {
    setLoading(true);
    const host = base || apiBase;
    try {
      console.log("[AuthScreen] fetchProviders -> url:", `${host}/api/providers`);
      const res = await fetch(`${host}/api/providers`);
      console.log("[AuthScreen] fetchProviders response status:", res.status);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      console.log("[AuthScreen] fetchProviders response body:", data);
      setProviders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("[AuthScreen] fetchProviders error:", err);
      Alert.alert(
        "Error loading providers",
        `${err?.message || "failed to load providers"}\nTried: ${host}\nIf you're on Android emulator use 10.0.2.2 (AVD) or 10.0.3.2 (Genymotion), or use your PC LAN IP and ensure the server listens on 0.0.0.0.`
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleProviderPress(provider: any) {
    setLoading(true);
    try {
      console.log("[AuthScreen] handleProviderPress:", provider);
      // mobile generates verifier + challenge
      const verifier = randomURLSafe(64);
      const challenge = codeChallengeFromVerifier(verifier);
      console.log("[AuthScreen] generated verifier/challenge", { verifier: "(hidden)", challenge });

      // call server login endpoint
      console.log("[AuthScreen] POST to login:", `${apiBase}/api/user/login`);
      const resp = await fetch(`${apiBase}/api/user/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.Provider || provider.provider || provider, code_challenge: challenge }),
      });
      console.log("[AuthScreen] login response status:", resp.status);
      if (!resp.ok) {
        const txt = await resp.text();
        console.warn("[AuthScreen] login failed body:", txt);
        throw new Error(txt || "login failed");
      }
      const json = await resp.json();
      console.log("[AuthScreen] login response json:", json);
      const { auth_url, state } = json;
      if (!auth_url) throw new Error("no auth_url returned");

      // save verifier by state for later exchange
      if (state) verifierByState.set(state, verifier);

      // open system browser with auth_url
      console.log("[AuthScreen] opening auth_url:", auth_url);
      await Linking.openURL(auth_url);
    } catch (err: any) {
      console.error("[AuthScreen] handleProviderPress error:", err);
      Alert.alert("Login error", err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  // --- Deep link handling (warden://auth/callback?provider=yandex&code=...&state=...) ---
  function parseQuery(url: string): Record<string, string> {
    try {
      // Prefer WHATWG URL if available
      // Ensure proper scheme handling by replacing spaces
      const u = new (globalThis as any).URL(url);
      const out: Record<string, string> = {};
      (u.searchParams as any).forEach((v: string, k: string) => (out[k] = v));
      return out;
    } catch {
      const qIndex = url.indexOf("?");
      if (qIndex === -1) return {};
      const query = url.slice(qIndex + 1);
      const out: Record<string, string> = {};
      for (const part of query.split("&")) {
        const [k, v] = part.split("=");
        if (!k) continue;
        out[decodeURIComponent(k)] = decodeURIComponent(v || "");
      }
      return out;
    }
  }

  const handleRedirect = async (url: string) => {
    try {
      console.log("[AuthScreen] handleRedirect url:", url);
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
  };

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
  }, [apiBase]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign in</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(i) => i.Provider}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.item} onPress={() => handleProviderPress(item)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.Name ?? item.Provider}</Text>
                <Text style={styles.small}>{item.Provider}</Text>
              </View>
              <Text style={styles.go}>Open</Text>
            </TouchableOpacity>
          )}
        />
      )}
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
});


