export interface Provider {
  Provider: string;
  Name?: string;
  // Allow backend-specific extra fields without breaking the app
  [key: string]: any;
}

export interface LoginResponse {
  auth_url: string;
  state?: string;
  // Attach any extra fields the backend might return
  [key: string]: any;
}

export interface OAuthError {
  error: string;
  error_description?: string;
  state?: string;
}

export type ProvidersResponse = Provider[];

export interface ExchangeRequest {
  provider: string;
  code: string;
  state?: string;
  code_verifier?: string;
}

export interface ExchangeResponse {
  token?: string;
  access_token?: string;
  refresh_token?: string;
  [key: string]: any;
}

// Violations
export type ViolationType = "garbage" | "pollution" | "air" | "deforestation" | "other";

export interface ViolationPhoto {
  id: string;
  url: string;
  thumb_url?: string;
}

export interface CreateViolationResponse {
  id: string;
  created_at?: string;
  type: ViolationType;
  description?: string;
  lat: number;
  lng: number;
  photos?: ViolationPhoto[];
}

export interface Violation {
  id: string;
  type: ViolationType;
  description?: string;
  lat: number;
  lng: number;
  status?: string;
  created_at?: string;
  photos?: ViolationPhoto[];
}

export interface Paged<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}


