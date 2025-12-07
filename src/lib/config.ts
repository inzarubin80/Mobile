export const API_BASE = "http://172.29.47.123:8090";
export const MOBILE_APP_SECRET = "12544667677898898992222";

export function getViolationChatWsUrl(userId: number): string {
  try {
    const match = API_BASE.match(/^(https?):\/\/([^/]+)(\/.*)?$/);
    if (!match) {
      return "";
    }
    const protocol = match[1];
    const host = match[2];
    const wsProtocol = protocol === "https" ? "wss" : "ws";
    return `${wsProtocol}://${host}/api/ws/violation-chat?user_id=${encodeURIComponent(
      String(userId)
    )}`;
  } catch {
    return "";
  }
}


