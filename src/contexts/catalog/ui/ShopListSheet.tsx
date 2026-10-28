import type { ShopSummary } from "../domain/shop";
import { ShopCard } from "./ShopCard";
import { color, radius } from "../../../shared/ui/tokens";

type Props = {
  shops: ShopSummary[];
  onShopClick: (s: ShopSummary) => void;
  onReset?: () => void;
};

// 시트 맨 아래 회사 표기(목록 끝까지 내렸을 때 보임)
function SiteFooter() {
  return (
    <div style={{ fontSize: 12, color: color.text.faint, textAlign: "center", padding: "20px 16px 8px" }}>
      © 2026 The Muse Lab · contact@themuselab.kr
    </div>
  );
}

/** 샵 리스트 (시트 본문). */
export function ShopListSheet({ shops, onShopClick, onReset }: Props) {
  if (shops.length === 0) {
    return (
      <div style={{ padding: "44px 24px 48px", textAlign: "center" }}>
        {/* 앱 빈 상태(InfoBadge)처럼 회색 (i) */}
        <div style={{ width: 40, height: 40, borderRadius: 20, background: color.gray[200], color: color.gray[500], margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 600 }}>
          i
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: color.text.strong }}>조건에 맞는 샵이 없어요</div>
        <div style={{ fontSize: 14, color: color.text.hint, marginTop: 4 }}>지역·필터·검색어를 바꿔보세요</div>
        {onReset && (
          <button
            onClick={onReset}
            style={{ marginTop: 16, height: 40, padding: "0 20px", borderRadius: radius.full, border: `1px solid ${color.gray[300]}`, background: color.white, color: color.gray[800], fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            필터 초기화
          </button>
        )}
        <SiteFooter />
      </div>
    );
  }
  return (
    <div style={{ paddingBottom: 24 }}>
      {shops.slice(0, 120).map((s) => (
        <div
          key={s.id}
          style={{
            borderBottom: `1px solid ${color.line.divider}`,
            contentVisibility: "auto",
            containIntrinsicSize: "0 97px",
          } as React.CSSProperties}
        >
          <ShopCard shop={s} onClick={onShopClick} />
        </div>
      ))}
      {shops.length > 120 && (
        <div style={{ fontSize: 12, color: color.text.faint, textAlign: "center", padding: 16 }}>
          상위 120곳 표시 · 지역·필터로 좁혀보세요
        </div>
      )}
      <SiteFooter />
    </div>
  );
}
