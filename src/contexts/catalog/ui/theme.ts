// catalog UI 표시용 상수 (도메인 아님 — 색/라벨 같은 표현 관심사).
import type { Category } from "../../../shared/domain/category";

export const CATEGORY_COLORS: Record<Category, string> = {
  네일: "#ec4899",
  헤어: "#7b5cff",
  속눈썹: "#ff8c42",
  왁싱: "#2bb3c0",
  반영구: "#c0392b",
  피부: "#27ae60",
  마사지: "#8e44ad",
  태닝: "#d4a017",
};

export const ROUTE_ICON: Record<string, string> = {
  naver: "🟢",
  talktalk: "💬",
  kakao: "💛",
  instagram: "📷",
  phone: "📞",
};
