/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAKAO_KEY?: string;
  readonly VITE_TARGET?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
