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
  id?: string; // Optional for API response (may not be in detail endpoint)
  type?: ViolationType; // Optional for detail endpoint
  description?: string;
  lat: number;
  lng: number;
  status?: string;
  created_at?: string;
  user_id?: number; // From detail endpoint
  photos?: ViolationPhoto[]; // All photos from all requests (for backward compatibility)
  requests?: ViolationRequest[]; // Array of all requests with detailed info
}

export interface Paged<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

// Violation Request (заявка на закрытие нарушения)
export interface ViolationRequestPhoto {
  id: string;
  request_id?: string; // May be missing in some API responses
  violation_id?: string; // May be present instead of request_id
  url: string;
  thumb_url?: string;
  created_at?: string;
}

export interface ViolationRequest {
  id: string;
  violation_id: string;
  status: "open" | "partially_closed" | "closed";
  created_by_user_id: number;
  // Optional avatar URL of the request author
  author_avatar_url?: string | null;
  comment?: string;
  photos?: ViolationRequestPhoto[];
  created_at: string;
  updated_at: string;
  likes?: number;
  dislikes?: number;
  user_vote?: "like" | "dislike" | "";
   // Boosty link of the request author, if provided by backend
   author_boosty_url?: string | null;
}

// Violation chat
export interface ViolationChatMessage {
  id: string;
  violation_id: string;
  user_id: number;
  user_name?: string;
  text: string;
  is_system: boolean;
  created_at: string;
}

export interface PaginatedViolationChatMessages {
  items: ViolationChatMessage[];
  page: number;
  page_size: number;
  total: number;
}

// User profile
export interface UserProfile {
  id: number;
  // Backend may return either "display_name" or "name"
  display_name?: string;
  name?: string;
  avatar_url?: string | null;
  boosty_url?: string | null;
  connected_providers?: string[]; // e.g. ["yandex","google"]
  // optional provider profile links
  provider_profiles?: Record<string, string | null>;
}

// Violation votes
export interface ViolationVotes {
  violation_id: string;
  likes: number;
  dislikes: number;
  user_vote?: "like" | "dislike" | "";
}


