<!-- 9274efcc-f684-49dc-8a92-322779b990d2 12b1f574-1a83-42e2-a163-5e5326ad27b2 -->
# Centralize API calls and types

We’ll introduce a small API layer and shared type definitions, then refactor `AuthScreen` to use it. This keeps all server interactions and types in one place while reusing the existing `apiFetch` and token storage.

## Changes

- Add `src/types/api.ts` for shared types (Provider, LoginResponse, OAuthError, etc.).
- Add `src/lib/api.ts` with functions:
- `getProviders(base: string): Promise<Provider[]>`
- `beginLogin(base: string, provider: string, codeChallenge: string): Promise<LoginResponse>`
- Refactor `src/screens/AuthScreen.tsx` to use `api.getProviders` and `api.beginLogin`.
- Keep PKCE helpers and deep-link handling in `AuthScreen` unchanged for now.

## Notes

- We’ll keep `apiBase` detection in `AuthScreen` and pass it into the API functions.
- Authenticated requests elsewhere can use existing `apiFetch` wrapper from `src/lib/auth.ts`.

### To-dos

- [ ] Create shared API types in src/types/api.ts
- [ ] Create API client in src/lib/api.ts using fetch/apiFetch
- [ ] Refactor AuthScreen to use centralized API client
- [ ] Build and run to verify no regressions