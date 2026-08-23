// 백엔드(syak_BE) API 호출 헬퍼. 소비자 카탈로그/슬롯을 RDS 백엔드에서 읽는다.
// (예전엔 Supabase REST 직접 호출 → egress 정지에 취약했음)
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://api.themuselab.kr/api/v1";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_BASE}/${path}`;
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500 || i === tries - 1) return res;
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return fetch(url, init);
}

/** GET → JSON. 실패 시 throw */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`api GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/** POST(JSON) */
export async function apiPost(path: string, body: unknown): Promise<Response> {
  return apiFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
