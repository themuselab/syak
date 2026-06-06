// Supabase REST(PostgREST) 호출 헬퍼. anon 키(공개). RLS로 보호됨.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
export const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

export function sbFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      ...(init?.headers || {}),
    },
  });
}

export function sbConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}
