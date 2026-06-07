import type { ShopSummary } from "../domain/shop";
import { thumb, FALLBACK_IMAGE, onImgError } from "../../../shared/ui/image";

type Props = {
  shop: ShopSummary;
  onClick: (s: ShopSummary) => void;
};

/** 샵 미리보기 카드 — 사진 + 이름 + 뱃지(이벤트/가격대/첫방문특가) + 리뷰·구. */
export function ShopCard({ shop, onClick }: Props) {
  return (
    <button
      onClick={() => onClick(shop)}
      style={{
        display: "flex",
        gap: 14,
        width: "100%",
        padding: "14px 18px",
        border: "none",
        background: "transparent",
        textAlign: "left",
        cursor: "pointer",
        alignItems: "center",
      }}
    >
      <img
        src={thumb(shop.representativeImage, 150) ?? FALLBACK_IMAGE}
        onError={onImgError}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: 74, height: 74, borderRadius: 14, objectFit: "cover", background: "#f0f0f3", flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 17, color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {shop.name}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
          {shop.hasEvent && <Badge tone="event">이벤트</Badge>}
          <Badge tone="price">{shop.priceTier}</Badge>
          {shop.firstVisitDeal && <Badge tone="first">첫방문 특가</Badge>}
        </div>
        <div style={{ fontSize: 13, color: "#9a9a9f", marginTop: 8 }}>
          리뷰 {shop.reviewCount.toLocaleString()} · {shop.gu}
        </div>
      </div>
    </button>
  );
}

const TONES = {
  event: { bg: "#fdecf1", color: "#e6396a" },
  price: { bg: "#f0f0f3", color: "#6b6b72" },
  first: { bg: "#fff1e3", color: "#e3820f" },
} as const;

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  const c = TONES[tone];
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: c.color, background: c.bg, borderRadius: 7, padding: "3px 9px" }}>
      {children}
    </span>
  );
}
