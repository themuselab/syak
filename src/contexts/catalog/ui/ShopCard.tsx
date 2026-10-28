import type { ShopSummary } from "../domain/shop";
import { thumb, FALLBACK_IMAGE, onImgError } from "../../../shared/ui/image";
import { color, radius } from "../../../shared/ui/tokens";

type Props = {
  shop: ShopSummary;
  onClick: (s: ShopSummary) => void;
};

/** 샵 미리보기 카드 — 앱 ShopListCard(compact)·홈 시안 모양:
 *  [썸네일 64, r8]  이름(16 SemiBold) 리뷰 N(12 faint)
 *                   구(14 subtle)
 *                   [태그: 파트너 / 이벤트 / 가격대 / 첫방문 특가] */
export function ShopCard({ shop, onClick }: Props) {
  return (
    <button
      onClick={() => onClick(shop)}
      style={{
        display: "flex",
        gap: 12,
        width: "100%",
        padding: "16px 20px",
        border: "none",
        background: "transparent",
        textAlign: "left",
        cursor: "pointer",
        alignItems: "center",
        fontFamily: "inherit",
      }}
    >
      <img
        src={thumb(shop.representativeImage, 150) ?? FALLBACK_IMAGE}
        onError={onImgError}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ width: 64, height: 64, borderRadius: radius.sm, objectFit: "cover", background: color.line.base, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 16, lineHeight: "22px", color: color.text.strong, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
            {shop.name}
          </span>
          <span style={{ fontSize: 12, lineHeight: "16px", color: color.text.faint, flexShrink: 0 }}>
            리뷰 {shop.reviewCount.toLocaleString()}
          </span>
        </div>
        <div style={{ fontSize: 14, lineHeight: "20px", color: color.text.subtle, marginTop: 2 }}>{shop.gu}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {shop.isPartner && <Badge tone="partner">샥 파트너</Badge>}
          {shop.pilotCoupon ? (
            <Badge tone="event">{shop.pilotCoupon}</Badge>
          ) : (
            shop.hasEvent && <Badge tone="event">{shop.eventPrice ?? "할인"}</Badge>
          )}
          <Badge tone="price">{shop.priceTier}</Badge>
          {shop.firstVisitDeal && <Badge tone="event">첫방문 특가</Badge>}
        </div>
      </div>
    </button>
  );
}

// 홈 시안(app/designs/홈지도뷰/소비자 메인.png) 태그: 이벤트류 = 연분홍 배경 + 핑크 글씨, 가격대 = 회색 배경.
// 파트너 = 앱 "샥 파트너샵" 브랜드 칩 톤(연분홍 + primary-300 테두리).
const TONES = {
  partner: { bg: color.brand.tint, color: color.primary[500], border: color.primary[300] },
  event: { bg: color.primary[50], color: color.primary[500], border: "transparent" },
  price: { bg: color.gray[100], color: color.gray[700], border: "transparent" },
} as const;

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  const c = TONES[tone];
  return (
    <span
      style={{ fontSize: 12, lineHeight: "16px", fontWeight: 500, color: c.color, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: "1px 6px", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {children}
    </span>
  );
}
