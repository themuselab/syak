import type { ShopSummary } from "../domain/shop";
import { CATEGORY_COLORS } from "./theme";
import { thumb } from "../../../shared/ui/image";

type Props = {
  shop: ShopSummary;
  onClick: (s: ShopSummary) => void;
  variant?: "list" | "rail";
};

/** 샵 미리보기 카드 — 리스트뷰/컬렉션 공용. */
export function ShopCard({ shop, onClick, variant = "list" }: Props) {
  const rail = variant === "rail";
  return (
    <button
      onClick={() => onClick(shop)}
      style={{
        display: "flex",
        flexDirection: rail ? "column" : "row",
        gap: rail ? 6 : 12,
        width: rail ? 132 : "100%",
        padding: rail ? 0 : "10px 16px",
        border: "none",
        background: "transparent",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        {shop.representativeImage ? (
          <img
            src={thumb(shop.representativeImage, rail ? 280 : 160)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              width: rail ? 132 : 72,
              height: rail ? 100 : 72,
              borderRadius: 12,
              objectFit: "cover",
              background: "#f2f2f4",
            }}
          />
        ) : (
          <div
            style={{
              width: rail ? 132 : 72,
              height: rail ? 100 : 72,
              borderRadius: 12,
              background: "#f2f2f4",
            }}
          />
        )}
        <Badges shop={shop} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: rail ? 13 : 15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {shop.name}
        </div>
        <div style={{ fontSize: 11, color: CATEGORY_COLORS[shop.category], marginTop: 2 }}>
          {shop.category} · {shop.priceTier}
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: rail ? 1 : 4 }}>
          {shop.gu} · 리뷰 {shop.reviewCount.toLocaleString()}
        </div>
      </div>
    </button>
  );
}

function Badges({ shop }: { shop: ShopSummary }) {
  const badges: string[] = [];
  if (shop.firstVisitDeal) badges.push("첫방문특가");
  if (shop.hasEvent) badges.push("이벤트");
  if (!badges.length) return null;
  return (
    <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 4 }}>
      {badges.map((b) => (
        <span
          key={b}
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            background: b === "첫방문특가" ? "#ec4899" : "#ff8c42",
            borderRadius: 4,
            padding: "1px 4px",
          }}
        >
          {b}
        </span>
      ))}
    </div>
  );
}
