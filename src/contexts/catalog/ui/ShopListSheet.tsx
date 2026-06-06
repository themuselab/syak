import type { ShopSummary } from "../domain/shop";
import { ShopCard } from "./ShopCard";

type Props = {
  shops: ShopSummary[];
  onShopClick: (s: ShopSummary) => void;
};

/** 샵 리스트 (시트 본문). */
export function ShopListSheet({ shops, onShopClick }: Props) {
  if (shops.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "#999" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
        <div style={{ fontSize: 14 }}>조건에 맞는 샵이 없어요</div>
        <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>지역·필터·검색어를 바꿔보세요</div>
      </div>
    );
  }
  return (
    <div style={{ paddingBottom: 24 }}>
      {shops.slice(0, 120).map((s, i) => (
        <div
          key={s.id}
          style={{
            borderTop: i === 0 ? "none" : "1px solid #f4f4f6",
            contentVisibility: "auto",
            containIntrinsicSize: "0 102px",
          } as React.CSSProperties}
        >
          <ShopCard shop={s} onClick={onShopClick} />
        </div>
      ))}
      {shops.length > 120 && (
        <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 16 }}>
          상위 120곳 표시 · 지역·필터로 좁혀보세요
        </div>
      )}
    </div>
  );
}
