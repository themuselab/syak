import type { ShopSummary } from "../domain/shop";
import { ShopCard } from "./ShopCard";

type Props = {
  shops: ShopSummary[];
  onShopClick: (s: ShopSummary) => void;
};

/** 바텀시트 full 상태의 리스트뷰. */
export function ShopListSheet({ shops, onShopClick }: Props) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888", padding: "4px 16px 8px" }}>
        {shops.length.toLocaleString()}곳
      </div>
      {shops.slice(0, 200).map((s) => (
        <div key={s.id} style={{ borderTop: "1px solid #f4f4f6" }}>
          <ShopCard shop={s} onClick={onShopClick} variant="list" />
        </div>
      ))}
      {shops.length > 200 && (
        <div style={{ fontSize: 12, color: "#bbb", textAlign: "center", padding: 16 }}>
          상위 200곳 표시 · 필터로 좁혀보세요
        </div>
      )}
    </div>
  );
}
