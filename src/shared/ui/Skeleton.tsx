/** 로딩 스켈레톤 — 샵 카드 placeholder 목록. */
export function ShopListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div style={{ padding: "4px 16px" }}>
      <style>{`@keyframes syak-shimmer{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}`}</style>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", animation: "syak-shimmer 1.2s ease-in-out infinite" }}>
          <div style={{ width: 72, height: 72, borderRadius: 12, background: "#eee" }} />
          <div style={{ flex: 1, paddingTop: 6 }}>
            <div style={{ width: "60%", height: 14, borderRadius: 4, background: "#eee" }} />
            <div style={{ width: "35%", height: 11, borderRadius: 4, background: "#eee", marginTop: 8 }} />
            <div style={{ width: "45%", height: 11, borderRadius: 4, background: "#eee", marginTop: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
