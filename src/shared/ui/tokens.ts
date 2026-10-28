// 디자인 토큰 — 소비자 앱(app.themuselab.kr, Expo)과 같은 값.
// 출처: app/src/shared/theme/tokens.js (앱의 단일 출처). 값을 바꿀 땐 앱 토큰과 함께 맞춘다.
import type { CSSProperties } from "react";

export const color = {
  primary: {
    50: "#fbecf0",
    100: "#f1c3d1",
    200: "#eaa6ba",
    300: "#e17e9b",
    400: "#db6588",
    500: "#d23e6a",
    600: "#bf3860",
    700: "#952c4b",
    800: "#74223a",
    900: "#581a2d",
  },
  gray: {
    50: "#F8F9FA",
    100: "#F1F3F5",
    200: "#E9ECEF",
    300: "#DEE2E6",
    400: "#C5CCD4",
    500: "#868E96",
    700: "#495057",
    800: "#343A40",
    900: "#212529",
  },
  white: "#FFFFFF",
  myLocation: "#007AFF",
  text: {
    strong: "#1a1a1a",
    base: "#333333",
    muted: "#555555",
    subtle: "#7e7e7e",
    hint: "#868e96",
    weak: "#999999",
    faint: "#adb5bd",
    disabled: "#bfbfbf",
    placeholder: "#c3c3c3",
    inverse: "#FFFFFF",
  },
  line: {
    divider: "#f3f3f3",
    base: "#ebebeb",
    strong: "#e3e3e3",
    handle: "#d9d9d9",
  },
  surface: {
    base: "#FFFFFF",
    muted: "#f3f1f2",
    mutedAlt: "#f1f1f1",
    map: "#e9edf1",
  },
  brand: {
    deep: "#c24a6b", // 선택된 칩 채움
    tint: "#fff1f6", // 브랜드(샥 파트너) 칩 배경
  },
  status: {
    open: "#0f9d58",
    openBg: "#e6f7ed",
    error: "#e03131",
  },
  accent: { favorite: "#FFC107" },
  overlay: { dim: "rgba(0,0,0,.6)" },
} as const;

export const radius = { sm: 8, md: 12, lg: 20, xl: 28, full: 999 } as const;

// 앱 shadow 프리셋(iOS shadow*)을 CSS box-shadow로 옮긴 값
export const shadow = {
  xs: "0 1px 3px rgba(0,0,0,.10)",
  sm: "0 1px 3.5px rgba(0,0,0,.12)",
  md: "0 2px 6px rgba(0,0,0,.15)",
  sheet: "0 -2px 12px rgba(0,0,0,.08)",
} as const;

export const FONT_FAMILY =
  "Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

// 칩 — 지도 위 칩(앱 CategoryChip): 흰 배경 + 그림자, 높이 33, pill.
// selected는 앱 FilterChip 선택 상태(연분홍 배경 + 핑크 테두리·글씨).
export function mapChip(selected = false): CSSProperties {
  return {
    height: 33,
    padding: "0 14px",
    borderRadius: radius.full,
    border: selected ? `1px solid ${color.primary[500]}` : "1px solid transparent",
    background: selected ? color.primary[50] : color.white,
    color: selected ? color.primary[500] : color.text.strong,
    boxShadow: shadow.sm,
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// 앱 FilterChip(바텀시트 칩): 흰 배경 + gray-300 테두리 / 선택 시 primary-50 배경 + primary-500 테두리·글씨.
export function filterChip(selected = false): CSSProperties {
  return {
    flexShrink: 0,
    height: 33,
    padding: "0 12px",
    borderRadius: radius.full,
    border: `1px solid ${selected ? color.primary[500] : color.gray[300]}`,
    background: selected ? color.primary[50] : color.white,
    color: selected ? color.primary[500] : color.gray[800],
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// 앱 SelectChip(필터 모달 칩): 높이 36, 흰 배경, 선택 시 테두리·글씨만 핑크.
export function selectChip(selected = false, pink: string = color.primary[500]): CSSProperties {
  return {
    height: 36,
    padding: "0 14px",
    borderRadius: radius.full,
    border: `1px solid ${selected ? pink : color.gray[300]}`,
    background: color.white,
    color: selected ? pink : color.gray[700],
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

// 앱 기본 버튼: 높이 48, radius sm(8), semibold 16.
export function button(kind: "primary" | "secondary" = "primary", disabled = false): CSSProperties {
  const base: CSSProperties = {
    height: 48,
    borderRadius: radius.sm,
    fontSize: 16,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
    textDecoration: "none",
  };
  if (kind === "secondary")
    return { ...base, border: `1px solid ${color.line.base}`, background: color.white, color: color.text.strong };
  return {
    ...base,
    border: "none",
    background: disabled ? color.primary[100] : color.primary[500],
    color: color.white,
  };
}

// 시트/모달 공통
export const sheetTitle: CSSProperties = { fontSize: 18, fontWeight: 600, color: color.text.strong, margin: 0 };
export const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 600, color: color.text.strong, marginBottom: 12 };
