// Supabase REST(PostgREST) 호출 헬퍼. anon 키(공개). RLS로 보호됨.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

// 무료티어 콜드스타트로 첫 요청이 5xx/타임아웃 나는 경우가 있어 자동 재시도(=새로고침 자동화).
// 5xx·네트워크 에러만 재시도(0.5s,1s 백오프), 4xx/2xx는 즉시 반환.
export async function sbFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    ...(init?.headers || {}),
  };
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...init, headers });
      if (res.status < 500 || i === tries - 1) return res; // 정상/4xx 즉시, 마지막 시도는 그대로 반환
    } catch (e) {
      if (i === tries - 1) throw e; // 마지막 시도까지 실패하면 throw
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return fetch(url, { ...init, headers }); // 도달 불가(타입 충족용)
}

export function sbConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}
