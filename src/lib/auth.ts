import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import { encode as encodeBase64 } from "base64-arraybuffer";

const TOKEN_KEY = "@auth/token";

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  DeviceEventEmitter.emit("auth:changed", { token });
}

export async function loadToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
  DeviceEventEmitter.emit("auth:changed", { token: null });
}

// Simple wrapper for fetch with Authorization header
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await loadToken();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  return fetch(input, { ...init, headers });
}

// Helpers to create a mock JWT for development using standard encoders
function b64urlFromString(data: string): string {
  const bytes = new TextEncoder().encode(data);
  const b64 = encodeBase64(bytes.buffer);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function makeMockJwt(user: { id: string; name?: string; email?: string }, expSec = 86400): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, any> = {
    sub: user.id,
    name: user.name,
    email: user.email,
    iat: now,
    exp: now + expSec,
    iss: "mock",
  };
  const h = b64urlFromString(JSON.stringify(header));
  const p = b64urlFromString(JSON.stringify(payload));
  const s = "mock-signature";
  return `${h}.${p}.${s}`;
}


