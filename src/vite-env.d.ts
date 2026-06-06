/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAKAO_KEY?: string;
  readonly VITE_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
