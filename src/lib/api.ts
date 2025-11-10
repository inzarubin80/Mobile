import { LoginResponse, Provider, ProvidersResponse } from "../types/api";
import { API_BASE } from "./config";

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    // @ts-expect-error allow returning any text for logging upstream
    return text;
  }
}

export async function getProviders(base?: string): Promise<Provider[]> {
  const host = base || API_BASE;
  const res = await fetch(`${host}/api/providers`, { method: "GET" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `failed to load providers (${res.status})`);
  }
  const data = await parseJsonSafe<ProvidersResponse>(res);
  return Array.isArray(data) ? data : [];
}

export async function beginLogin(baseOrProvider: string | undefined, providerOrChallenge: string, maybeChallenge?: string): Promise<LoginResponse> {
  // Preserve old signature (base, provider, challenge) while allowing (provider, challenge)
  const isOldSignature = typeof baseOrProvider === "string" && typeof maybeChallenge === "string";
  const host = isOldSignature ? (baseOrProvider as string) || API_BASE : API_BASE;
  const provider = isOldSignature ? providerOrChallenge : providerOrChallenge;
  const codeChallenge = isOldSignature ? (maybeChallenge as string) : (maybeChallenge as unknown as string) || "";
  const res = await fetch(`${host}/api/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, code_challenge: codeChallenge }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `login failed (${res.status})`);
  }
  return parseJsonSafe<LoginResponse>(res);
}


