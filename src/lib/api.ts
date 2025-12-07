import {
  ExchangeRequest,
  ExchangeResponse,
  LoginResponse,
  Provider,
  ProvidersResponse,
  CreateViolationResponse,
  ViolationType,
  Violation,
  Paged,
  ViolationRequest,
  PaginatedViolationChatMessages,
  ViolationChatMessage,
} from "../types/api";
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
  
  const setCookieHeader = res.headers.get('Set-Cookie');
  
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
  
  // refresh request
  
  // Используем apiFetch вместо fetch, чтобы куки автоматически отправлялись
  // apiFetch не будет делать refresh для /api/user/refresh (проверка в коде)
  const res = await apiFetch(`${host}/api/user/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body,
  });
  
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `refresh failed (${res.status})`);
  }
  
  const responseData = await parseJsonSafe<ExchangeResponse>(res);
  
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
  // Log array of photo URIs being sent
  console.log(
    "[createViolation] Photos to send:",
    params.photos ? params.photos.map((p) => (p.uri ? p.uri : p.name || "<no-name>")) : []
  );

  try {
    const res = await apiFetch(`${host}/api/violations`, {
      method: "POST",
      body: form as any,
    } as any);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `create violation failed (${res.status})`);
    }
    return parseJsonSafe<CreateViolationResponse>(res);
  } catch (error: any) {
    // No client-side timeout here; just propagate error
    throw error;
  }
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
  // Ensure id is set from path parameter
  return { ...data, id };
}

// Close violation request (create a request to close/partially close a violation)
export interface CloseViolationRequestParams {
  status: "partially_closed" | "closed";
  comment?: string;
  photos?: Array<{ uri: string; name?: string; type?: string }>;
}

export async function closeViolationRequest(
  violationId: string,
  params: CloseViolationRequestParams,
  base?: string
): Promise<ViolationRequest> {
  const host = base || API_BASE;
  const form = new FormData();
  form.append("status", params.status);
  if (params.comment) {
    form.append("comment", params.comment);
  }
  if (params.photos && params.photos.length) {
    for (const p of params.photos) {
      const name = p.name || `photo_${Math.floor(Math.random() * 1e9)}.jpg`;
      const mime = p.type || "image/jpeg";
      // React Native file form: { uri, name, type }
      // @ts-ignore - RN FormData File value
      form.append("photos", { uri: p.uri, name, type: mime });
    }
  }
  // Log array of photo URIs being sent
  console.log(
    "[closeViolationRequest] Photos to send:",
    params.photos ? params.photos.map((p) => (p.uri ? p.uri : p.name || "<no-name>")) : []
  );

  try {
    const res = await apiFetch(`${host}/api/violations/${violationId}/close-request`, {
      method: "POST",
      body: form as any,
    } as any);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `close violation request failed (${res.status})`);
    }
    return parseJsonSafe<ViolationRequest>(res);
  } catch (error: any) {
    // No client-side timeout here; just propagate error
    throw error;
  }
}

// Violation chat HTTP API

export async function getViolationChatHistory(
  violationId: string,
  page = 1,
  pageSize = 50,
  base?: string
): Promise<PaginatedViolationChatMessages> {
  const host = base || API_BASE;
  const url = `${host}/api/violations/${violationId}/chat?page=${page}&page_size=${pageSize}`;
  const res = await apiFetch(url, { method: "GET" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `get violation chat history failed (${res.status})`);
  }
  return parseJsonSafe<PaginatedViolationChatMessages>(res);
}

export async function sendViolationChatMessageHttp(
  violationId: string,
  text: string,
  base?: string
): Promise<ViolationChatMessage> {
  const host = base || API_BASE;
  const url = `${host}/api/violations/${violationId}/chat/messages`;
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `send violation chat message failed (${res.status})`);
  }
  return parseJsonSafe<ViolationChatMessage>(res);
}

export async function updateViolationChatMessageHttp(
  violationId: string,
  messageId: string,
  text: string,
  base?: string
): Promise<ViolationChatMessage> {
  const host = base || API_BASE;
  const url = `${host}/api/violations/${violationId}/chat/messages/${messageId}`;
  const res = await apiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `update violation chat message failed (${res.status})`);
  }
  return parseJsonSafe<ViolationChatMessage>(res);
}

export async function deleteViolationChatMessageHttp(
  violationId: string,
  messageId: string,
  base?: string
): Promise<void> {
  const host = base || API_BASE;
  const url = `${host}/api/violations/${violationId}/chat/messages/${messageId}`;
  const res = await apiFetch(url, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `delete violation chat message failed (${res.status})`);
  }
  // most likely 204/200 with empty body – ignore payload
}

// ViolationRequest votes & complaints

export interface ViolationRequestVoteResponse {
  violation_request_id: string;
  likes: number;
  dislikes: number;
  user_vote?: "like" | "dislike" | "";
}

export async function postViolationRequestVote(
  requestId: string,
  value: "like" | "dislike" | "none",
  base?: string
): Promise<ViolationRequestVoteResponse> {
  const host = base || API_BASE;
  const url = `${host}/api/violation-requests/${requestId}/vote`;
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `post violation request vote failed (${res.status})`);
  }
  return parseJsonSafe<ViolationRequestVoteResponse>(res);
}

export interface CreateViolationRequestComplaintParams {
  reason?: string;
  message?: string;
}

export async function postViolationRequestComplaint(
  requestId: string,
  params: CreateViolationRequestComplaintParams = {},
  base?: string
): Promise<void> {
  const host = base || API_BASE;
  const url = `${host}/api/violation-requests/${requestId}/complaints`;
  const res = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(errText || `post violation request complaint failed (${res.status})`);
  }
  // 201/200 body is not used on mobile
}

