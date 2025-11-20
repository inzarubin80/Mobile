import { ExchangeRequest, ExchangeResponse, LoginResponse, Provider, ProvidersResponse, CreateViolationResponse, ViolationType, Violation, Paged } from "../types/api";
import { API_BASE } from "./config";
import { apiFetch } from "./auth";

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
  // Используем apiFetch для добавления необходимых заголовков
  const res = await apiFetch(`${host}/api/providers`, { method: "GET" });
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
  // Используем apiFetch для добавления необходимых заголовков
  const res = await apiFetch(`${host}/api/user/login`, {
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

export async function exchangeCode(input: ExchangeRequest, base?: string): Promise<ExchangeResponse> {
  const host = base || API_BASE;
  const url = `${host}/api/user/exchange`;
  
  // Используем apiFetch, чтобы куки автоматически сохранялись
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  
  // Логируем куки, которые приходят в ответе (для отладки)
  const setCookieHeader = res.headers.get('Set-Cookie');
  if (setCookieHeader) {
    console.log("[exchangeCode] Cookies received in response:", {
      url,
      setCookieHeader: setCookieHeader,
      status: res.status
    });
  } else {
    console.log("[exchangeCode] No Set-Cookie header in response");
  }
  
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `exchange failed (${res.status})`);
  }
  return parseJsonSafe<ExchangeResponse>(res);
}

export async function refreshToken(refreshToken: string | null, base?: string): Promise<ExchangeResponse> {
  const host = base || API_BASE;
  const body = refreshToken 
    ? JSON.stringify({ refresh_token: refreshToken })
    : JSON.stringify({});
  
  console.log("[refreshToken] Making refresh request:", {
    url: `${host}/api/user/refresh`,
    hasRefreshTokenInBody: !!refreshToken,
    body: refreshToken ? "{ refresh_token: '***' }" : "{}"
  });
  
  // Используем apiFetch вместо fetch, чтобы куки автоматически отправлялись
  // apiFetch не будет делать refresh для /api/user/refresh (проверка в коде)
  const res = await apiFetch(`${host}/api/user/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body,
  });
  
  console.log("[refreshToken] Refresh response status:", res.status);
  
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[refreshToken] Refresh failed:", {
      status: res.status,
      error: errText
    });
    throw new Error(errText || `refresh failed (${res.status})`);
  }
  
  // Парсим ответ и логируем его содержимое
  const responseData = await parseJsonSafe<ExchangeResponse>(res);
  console.log("[refreshToken] Refresh response data:", {
    hasToken: !!(responseData.token || responseData.access_token),
    hasRefreshToken: !!responseData.refresh_token,
    hasUserId: !!(responseData as any).user_id,
    responseKeys: Object.keys(responseData)
  });
  
  return responseData;
}

// Create violation (multipart preferred)
export interface CreateViolationParams {
  type: ViolationType;
  description?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  photos?: Array<{ uri: string; name?: string; type?: string }>;
}

export async function createViolation(params: CreateViolationParams, base?: string): Promise<CreateViolationResponse> {
  const host = base || API_BASE;
  const form = new FormData();
  form.append("type", params.type);
  if (params.description) form.append("description", params.description);
  form.append("lat", String(params.lat));
  form.append("lng", String(params.lng));
  if (typeof params.accuracy === "number") form.append("accuracy", String(params.accuracy));
  if (params.photos && params.photos.length) {
    for (const p of params.photos) {
      const name = p.name || `photo_${Math.floor(Math.random() * 1e9)}.jpg`;
      const mime = p.type || "image/jpeg";
      // React Native file form: { uri, name, type }
      // @ts-ignore - RN FormData File value
      form.append("photos", { uri: p.uri, name, type: mime });
    }
  }
  // Use apiFetch to include Authorization automatically; don't set Content-Type to let RN add boundary
  const res = await apiFetch(`${host}/api/violations`, {
    method: "POST",
    body: form as any,
  } as any);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `create violation failed (${res.status})`);
  }
  return parseJsonSafe<CreateViolationResponse>(res);
}

// Fetch violations by bbox only
export async function getViolationsByBbox(
  bbox: [number, number, number, number],
  base?: string
): Promise<Paged<Violation>> {
  const host = base || API_BASE;
  const qs = `bbox=${bbox.join(",")}`;
  const res = await apiFetch(`${host}/api/violations?${qs}`, { method: "GET" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `get violations failed (${res.status})`);
  }
  return parseJsonSafe<Paged<Violation>>(res);
}

// Get violation by ID (public endpoint, no auth required)
export async function getViolationById(id: string, base?: string): Promise<Partial<Violation>> {
  const host = base || API_BASE;
  const url = `${host}/api/violations/${id}`;
  console.log("[getViolationById] Fetching:", url);
  // Используем apiFetch для добавления необходимых заголовков (даже для публичных endpoint)
  const res = await apiFetch(url, { method: "GET" });
  if (res.status === 404) {
    throw new Error("violation not found");
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `get violation failed (${res.status})`);
  }
  const data = await parseJsonSafe<Partial<Violation>>(res);
  console.log("[getViolationById] Raw response:", JSON.stringify(data, null, 2));
  console.log("[getViolationById] Photos array:", data.photos);
  console.log("[getViolationById] Photos count:", data.photos?.length || 0);
  if (data.photos && data.photos.length > 0) {
    data.photos.forEach((photo, idx) => {
      console.log(`[getViolationById] Photo ${idx}:`, {
        id: photo.id,
        url: photo.url,
        thumb_url: photo.thumb_url,
      });
    });
  }
  // Ensure id is set from path parameter
  return { ...data, id };
}


