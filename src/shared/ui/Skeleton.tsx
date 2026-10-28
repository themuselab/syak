import { color, radius } from "./tokens";

/** 로딩 스켈레톤 — 샵 카드 placeholder 목록 (ShopCard와 같은 썸네일 64·r8·패딩). */
export function ShopListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ padding: "4px 20px" }}>
      <style>{`@keyframes syak-shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "16px 0", animation: "syak-shimmer 1.2s ease-in-out infinite" }}>
          <div style={{ width: 64, height: 64, borderRadius: radius.sm, background: color.line.base }} />
          <div style={{ flex: 1, paddingTop: 6 }}>
            <div style={{ width: "60%", height: 14, borderRadius: 4, background: color.surface.mutedAlt }} />
            <div style={{ width: "35%", height: 11, borderRadius: 4, background: color.surface.mutedAlt, marginTop: 8 }} />
            <div style={{ width: "45%", height: 11, borderRadius: 4, background: color.surface.mutedAlt, marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
