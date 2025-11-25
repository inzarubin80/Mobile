import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";
import CookieManager from "@react-native-cookies/cookies";
import CryptoJS from "crypto-js";
import { refreshToken } from "./api";
import { API_BASE, MOBILE_APP_SECRET } from "./config";

const TOKEN_KEY = "@auth/token";
const REFRESH_TOKEN_KEY = "@auth/refresh_token";

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
  await clearRefreshToken();
  // Очищаем куки при логауте
  try {
    await CookieManager.clearAll();
  } catch (error) {
    console.warn("[clearToken] Failed to clear cookies:", error);
  }
  DeviceEventEmitter.emit("auth:changed", { token: null });
}

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export async function loadRefreshToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearRefreshToken(): Promise<void> {
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

// Promise для синхронизации конкурентных refresh запросов
let refreshPromise: Promise<string | null> | null = null;

// Helper function to generate HMAC signature for request
// Теперь подписываем только timestamp для упрощения
function generateRequestSignature(
  method: string,
  url: string,
  body: string | null,
  timestamp: number
): string {
  // Формируем строку для подписи: только timestamp
  const signString = String(timestamp);
  
  // Логируем строку для подписи (для отладки)
  console.log("[generateRequestSignature] Sign string (timestamp only):", signString);
  console.log("[generateRequestSignature] Signature data:", {
    timestamp: timestamp,
    timestampType: typeof timestamp,
    signString: signString
  });
  
  // Генерируем HMAC-SHA256 подпись
  const signature = CryptoJS.HmacSHA256(signString, MOBILE_APP_SECRET);
  const base64Signature = CryptoJS.enc.Base64.stringify(signature);
  
  console.log("[generateRequestSignature] Generated signature:", {
    signature: base64Signature,
    signatureLength: base64Signature.length,
    secretLength: MOBILE_APP_SECRET.length,
    secretFirstChars: MOBILE_APP_SECRET.substring(0, 5) + '...'
  });
  
  return base64Signature;
}

// Helper function to parse URL without using URL constructor (React Native compatibility)
function parseUrl(url: string): { protocol: string; host: string; hostname: string; pathname: string } | null {
  try {
    // Парсим URL вручную: http://host:port/path
    const match = url.match(/^(https?):\/\/([^\/:]+)(?::(\d+))?(\/.*)?$/);
    if (!match) return null;
    
    const [, protocol, hostname, port, pathname] = match;
    const host = port ? `${hostname}:${port}` : hostname;
    
    return {
      protocol: protocol || 'http',
      host,
      hostname,
      pathname: pathname || '/'
    };
  } catch (e) {
    return null;
  }
}

// Helper function to get cookies and format them as Cookie header
async function getCookieHeader(url: string): Promise<string> {
  try {
    let cookies: any = {};
    let usedUrl = url;
    
    // Пытаемся получить куки для полного URL
    cookies = await CookieManager.get(url, true); // true = включая httpOnly
    
    // Если куки не найдены для полного URL, пробуем базовый домен
    if (!cookies || Object.keys(cookies).length === 0) {
      const urlParts = parseUrl(url);
      if (urlParts) {
        const baseUrl = `${urlParts.protocol}//${urlParts.host}`;
        cookies = await CookieManager.get(baseUrl, true);
        usedUrl = baseUrl;
        if (cookies && Object.keys(cookies).length > 0) {
          console.log("[apiFetch] Found cookies for base URL:", baseUrl);
        }
      }
    }
    
    // Также пробуем получить все куки для домена
    if (!cookies || Object.keys(cookies).length === 0) {
      const urlParts = parseUrl(url);
      if (urlParts) {
        const domainUrl = `${urlParts.protocol}//${urlParts.hostname}`;
        cookies = await CookieManager.get(domainUrl, true);
        usedUrl = domainUrl;
        if (cookies && Object.keys(cookies).length > 0) {
          console.log("[apiFetch] Found cookies for domain:", domainUrl);
        }
      }
    }
    
    const cookieHeader = Object.entries(cookies || {})
      .map(([name, cookie]) => {
        // cookie может быть объектом с полем value или строкой
        const value = typeof cookie === 'object' && cookie !== null && 'value' in cookie 
          ? (cookie as any).value 
          : cookie;
        return `${name}=${value}`;
      })
      .join('; ');
    
    // Логируем куки для refresh запросов
    if (url.includes('/api/user/refresh')) {
      console.log("[apiFetch] Cookies for refresh request:", {
        requestedUrl: url,
        usedUrl: usedUrl,
        cookiesCount: Object.keys(cookies || {}).length,
        cookies: Object.entries(cookies || {}).map(([name, cookie]) => ({
          name,
          value: typeof cookie === 'object' && cookie !== null && 'value' in cookie 
            ? (cookie as any).value 
            : cookie,
          fullCookie: cookie
        })),
        cookieHeader: cookieHeader || '(empty)'
      });
    }
    
    return cookieHeader;
  } catch (error) {
    console.warn("[apiFetch] Failed to get cookies:", error);
    return '';
  }
}

// Helper function to add cookies to headers
async function addCookiesToHeaders(url: string, headers: Headers): Promise<void> {
  const cookieHeader = await getCookieHeader(url);
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }
}

// Helper function to save cookies from Set-Cookie headers
async function saveCookiesFromResponse(url: string, res: Response): Promise<void> {
  try {
    // Получаем Set-Cookie заголовок (может содержать несколько кук, разделенных запятыми)
    const setCookieHeader = res.headers.get('Set-Cookie');
    if (!setCookieHeader) return;

    const urlParts = parseUrl(url);
    if (!urlParts) {
      console.warn("[apiFetch] Failed to parse URL:", url);
      return;
    }
    
    const domain = urlParts.hostname;
    const path = urlParts.pathname || '/';
    // Используем полный URL для CookieManager.set() - он требует полный URL
    // Но для получения кук будем использовать базовый URL
    const fullUrl = url;
    const baseUrl = `${urlParts.protocol}//${urlParts.host}`;

    // Правильный парсинг Set-Cookie: разделяем куки по запятым, которые идут после точки с запятой
    // Это нужно, потому что в Expires может быть запятая в дате (например, "Sat, 20 Dec 2025")
    // Алгоритм: ищем паттерн "name=value" в начале, затем ищем следующую запятую после точки с запятой
    const cookieStrings: string[] = [];
    let i = 0;
    
    while (i < setCookieHeader.length) {
      // Пропускаем пробелы в начале
      while (i < setCookieHeader.length && setCookieHeader[i] === ' ') i++;
      if (i >= setCookieHeader.length) break;
      
      const start = i;
      let foundSemicolon = false;
      
      // Ищем до следующей запятой, которая идет после точки с запятой
      while (i < setCookieHeader.length) {
        if (setCookieHeader[i] === ';') {
          foundSemicolon = true;
        } else if (setCookieHeader[i] === ',' && foundSemicolon) {
          // Запятая после точки с запятой - разделитель между куками
          break;
        }
        i++;
      }
      
      const cookieStr = setCookieHeader.substring(start, i).trim();
      if (cookieStr) {
        cookieStrings.push(cookieStr);
      }
      
      // Пропускаем запятую
      if (i < setCookieHeader.length && setCookieHeader[i] === ',') {
        i++;
      }
    }

    // Обрабатываем каждую куку
    for (const cookieStr of cookieStrings) {
      const parts = cookieStr.split(';').map((p: string) => p.trim());
      const [nameValue] = parts;
      if (!nameValue) continue;

      const [name, ...valueParts] = nameValue.split('=');
      const value = valueParts.join('='); // На случай, если значение содержит '='
      if (!name || !value) continue;

      const cookieData: any = {
        name: name.trim(),
        value: value.trim(),
      };

      // Парсим дополнительные атрибуты
      let hasDomain = false;
      let hasPath = false;
      
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i].trim();
        const partLower = part.toLowerCase();
        
        if (partLower.startsWith('expires=')) {
          // Берем все после "expires=", включая запятые в дате
          cookieData.expires = part.substring(8);
        } else if (partLower.startsWith('max-age=')) {
          cookieData.maxAge = parseInt(part.substring(8), 10);
        } else if (partLower === 'secure') {
          cookieData.secure = true;
        } else if (partLower === 'httponly') {
          cookieData.httpOnly = true;
        } else if (partLower.startsWith('samesite=')) {
          cookieData.sameSite = part.substring(9);
        } else if (partLower.startsWith('domain=')) {
          cookieData.domain = part.substring(7);
          hasDomain = true;
        } else if (partLower.startsWith('path=')) {
          cookieData.path = part.substring(5);
          hasPath = true;
        }
      }
      
      // Добавляем domain и path только если они не указаны в Set-Cookie
      // CookieManager может автоматически извлекать их из URL
      if (!hasDomain) {
        cookieData.domain = domain;
      }
      if (!hasPath) {
        cookieData.path = path;
      }

      // Сохраняем куку, используя полный URL (CookieManager требует полный URL)
      // Проверяем, что URL валидный (начинается с http:// или https://)
      if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
        console.error("[apiFetch] Invalid URL format for cookie:", fullUrl);
        return;
      }
      
      try {
        console.log("[apiFetch] Attempting to save cookie:", {
          url: fullUrl,
          cookieName: cookieData.name,
          cookieData: { ...cookieData, value: cookieData.value.substring(0, 20) + '...' }
        });
        
        await CookieManager.set(fullUrl, cookieData);
        
        // Логируем сохранение кук для отладки
        if (url.includes('/api/user/') || url.includes('/api/violations')) {
          console.log("[apiFetch] Successfully saved cookie:", {
            originalUrl: url,
            savedForUrl: fullUrl,
            name: cookieData.name,
            domain: cookieData.domain,
            path: cookieData.path,
            httpOnly: cookieData.httpOnly,
            secure: cookieData.secure,
            sameSite: cookieData.sameSite
          });
        }
      } catch (error: any) {
        console.error("[apiFetch] Failed to save cookie:", {
          url: fullUrl,
          cookieName: cookieData.name,
          error: error?.message || String(error),
          cookieDataKeys: Object.keys(cookieData)
        });
        // Пробуем сохранить с базовым URL как fallback
        try {
          console.log("[apiFetch] Trying to save cookie with base URL as fallback:", baseUrl);
          await CookieManager.set(baseUrl, cookieData);
          console.log("[apiFetch] Successfully saved cookie with base URL as fallback");
        } catch (fallbackError: any) {
          console.error("[apiFetch] Failed to save cookie with base URL too:", {
            baseUrl,
            error: fallbackError?.message || String(fallbackError)
          });
        }
      }
    }
  } catch (error) {
    console.warn("[apiFetch] Failed to save cookies from response:", error);
  }
}

// Simple wrapper for fetch with Authorization header and cookies
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await loadToken();
  const url = typeof input === 'string' ? input : input.toString();
  const headers = new Headers(init.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  headers.set("X-Client-Type", "mobile");
  
  // Генерируем HMAC подпись вместо передачи секрета
  const method = init.method || 'GET';
  const timestamp = Date.now();
  
  // Body больше не используется в подписи, но оставляем параметр для совместимости
  const signature = generateRequestSignature(method, url, null, timestamp);
  headers.set("X-Mobile-Signature", signature);
  headers.set("X-Mobile-Timestamp", String(timestamp));
  
  // Логируем данные для подписи (для отладки)
  const urlPartsForLog = parseUrl(url);
  const pathForLog = urlPartsForLog ? (urlPartsForLog.pathname || '/') + (url.includes('?') ? url.substring(url.indexOf('?')) : '') : url;
  console.log("[apiFetch] Request signature data:", {
    method,
    url,
    path: pathForLog,
    timestamp,
    signature: signature.substring(0, 20) + '...'
  });
  
  // Добавляем куки в заголовки
  await addCookiesToHeaders(url, headers);
  
  // Для FormData НЕ устанавливаем Content-Type - React Native должен сделать это автоматически с boundary
  // Если Content-Type был установлен где-то, удаляем его для FormData
  if (init.body instanceof FormData) {
    headers.delete("Content-Type");
    console.log("[apiFetch] Removed Content-Type header for FormData (RN will set it with boundary)");
  }
  
  // Логируем все заголовки перед отправкой (для отладки)
  const headersObj: Record<string, string> = {};
  headers.forEach((value: string, key: string) => {
    headersObj[key] = value;
  });
  console.log("[apiFetch] Sending request with headers:", {
    url,
    method: init.method || 'GET',
    headers: headersObj,
    hasBody: !!init.body,
    bodyType: init.body ? (init.body instanceof FormData ? 'FormData' : typeof init.body) : 'none'
  });
  
  // Сохраняем body для возможного повторного использования
  const originalBody = init.body;
  
  let res: Response;
  try {
    res = await fetch(input, { ...init, headers });
  } catch (error) {
    console.error("[apiFetch] Network error:", {
      url,
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error
    });
    throw error;
  }
  
  // Логируем ответ
  console.log("[apiFetch] Response received:", {
    url,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries())
  });
  
  // Сохраняем куки из ответа
  await saveCookiesFromResponse(url, res);
  
  // Если получили 401, пытаемся обновить токен и повторить запрос
  // НЕ делаем refresh для самого refresh endpoint, чтобы избежать рекурсии
  if (res.status === 401 && !url.includes('/api/user/refresh')) {
    console.log("[apiFetch] Got 401, attempting token refresh for:", url);
    const refreshTokenValue = await loadRefreshToken();
    
    // Всегда пытаемся сделать refresh, даже если нет refresh token в хранилище
    // В этом случае полагаемся на куки
    if (refreshTokenValue) {
      console.log("[apiFetch] Refresh token found in storage, refreshing...");
    } else {
      console.log("[apiFetch] No refresh token in storage, attempting refresh with cookies...");
    }
    
    // Если уже идет refresh, ждем его завершения
    if (refreshPromise) {
      await refreshPromise;
      // После завершения refresh повторяем запрос с новым токеном
      const newToken = await loadToken();
      const newHeaders = new Headers(init.headers || {});
      if (newToken) newHeaders.set("Authorization", `Bearer ${newToken}`);
      newHeaders.set("Accept", "application/json");
      newHeaders.set("X-Client-Type", "mobile");
      
      // Генерируем новую подпись для повторного запроса (body не используется)
      const retryMethod = init.method || 'GET';
      const retryTimestamp = Date.now();
      const retrySignature = generateRequestSignature(retryMethod, url, null, retryTimestamp);
      newHeaders.set("X-Mobile-Signature", retrySignature);
      newHeaders.set("X-Mobile-Timestamp", String(retryTimestamp));
      
      await addCookiesToHeaders(url, newHeaders);
      // Используем сохраненный body для повторного запроса
      res = await fetch(input, { ...init, body: originalBody, headers: newHeaders });
      // Сохраняем куки из ответа после повторного запроса
      await saveCookiesFromResponse(url, res);
      console.log("[apiFetch] Retry after concurrent refresh, status:", res.status);
    } else {
      // Инициируем refresh
      refreshPromise = (async () => {
        try {
          console.log("[apiFetch] Starting token refresh...");
          // Передаем refreshTokenValue (может быть null) - в этом случае полагаемся на куки
          const refreshResponse = await refreshToken(refreshTokenValue, API_BASE);
          const newAccessToken = refreshResponse.token || refreshResponse.access_token;
          const newRefreshToken = refreshResponse.refresh_token;
          
          console.log("[apiFetch] Refresh response processed:", {
            hasAccessToken: !!newAccessToken,
            hasRefreshToken: !!newRefreshToken,
            accessTokenLength: newAccessToken?.length || 0
          });
          
          if (newAccessToken) {
            await saveToken(newAccessToken);
            console.log("[apiFetch] New access token saved");
            
            if (newRefreshToken) {
              await saveRefreshToken(newRefreshToken);
              console.log("[apiFetch] New refresh token saved");
            } else {
              console.log("[apiFetch] No refresh token in response (server only returns token)");
            }
            
            console.log("[apiFetch] Token refreshed successfully");
            return newAccessToken;
          }
          
          console.error("[apiFetch] No token found in refresh response:", {
            responseKeys: Object.keys(refreshResponse),
            response: refreshResponse
          });
          throw new Error("No token in refresh response");
        } catch (error) {
          console.error("[apiFetch] Token refresh failed:", error);
          // Если refresh не удался, очищаем все токены
          await clearToken();
          throw error;
        } finally {
          refreshPromise = null;
        }
      })();
      
      try {
        await refreshPromise;
          // После успешного refresh повторяем запрос с новым токеном
          const newToken = await loadToken();
          const newHeaders = new Headers(init.headers || {});
          if (newToken) newHeaders.set("Authorization", `Bearer ${newToken}`);
          newHeaders.set("Accept", "application/json");
          newHeaders.set("X-Client-Type", "mobile");
          
          // Генерируем новую подпись для повторного запроса (body не используется)
          const retryMethod2 = init.method || 'GET';
          const retryTimestamp2 = Date.now();
          const retrySignature2 = generateRequestSignature(retryMethod2, url, null, retryTimestamp2);
          newHeaders.set("X-Mobile-Signature", retrySignature2);
          newHeaders.set("X-Mobile-Timestamp", String(retryTimestamp2));
          
          await addCookiesToHeaders(url, newHeaders);
        // Используем сохраненный body для повторного запроса
        res = await fetch(input, { ...init, body: originalBody, headers: newHeaders });
        // Сохраняем куки из ответа после повторного запроса
        await saveCookiesFromResponse(url, res);
        console.log("[apiFetch] Retry after refresh, status:", res.status);
      } catch (error) {
        console.error("[apiFetch] Error during refresh/retry:", error);
        // Если refresh не удался, возвращаем оригинальный 401 ответ
        return res;
      }
    }
  }
  
  return res;
}


