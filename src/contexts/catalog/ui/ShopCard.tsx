import { useEffect, useRef } from "react";
import { usecases } from "../../../app/composition-root";
import type { ShopSummary } from "../domain/shop";
import { feedImage, onImgError } from "../../../shared/ui/image";
import { Icon } from "../../../shared/ui/Icon";

export function ShopCard({
  shop,
  onClick,
}: {
  shop: ShopSummary;
  onClick: (shop: ShopSummary) => void;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5)
        )
          return;
        usecases.analytics.track({
          event: "impression",
          shopId: shop.id,
          isPartner: shop.isPartner,
          source: "list",
        });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [shop.id, shop.isPartner]);
  const photos = shop.photos?.length
    ? shop.photos.slice(0, 3)
    : shop.representativeImage
      ? [shop.representativeImage]
      : [];
  const times = shop.todayTimes;
  const deal =
    shop.pilotCoupon ||
    shop.eventPrice ||
    (shop.firstVisitDeal ? "첫방문 특가" : null);
  return (
    <article ref={element} className="shop-feed-card">
      <div className="shop-feed-heading">
        <button className="shop-feed-open" onClick={() => onClick(shop)}>
          <h2>{shop.name}</h2>
        </button>
        <a
          href="https://app.themuselab.kr/favorites"
          className="icon-button shop-favorite"
          aria-label={shop.name + " 즐겨찾기 — 앱에서 열기"}
        >
          <Icon name="star" size={24} />
        </a>
      </div>
      <button
        className="shop-feed-open shop-feed-meta"
        onClick={() => onClick(shop)}
      >
        {shop.isPartner && <span className="partner-badge">샥 파트너</span>}
        {deal && <span className="shop-deal">{deal}</span>}
        {shop.priceTier && shop.priceTier !== "미정" && (
          <>
            {deal && <span className="meta-dot">•</span>}
            <span>{shop.priceTier}</span>
          </>
        )}
        {(deal || (shop.priceTier && shop.priceTier !== "미정")) && (
          <span className="meta-dot">•</span>
        )}
        <span>{shop.gu}</span>
      </button>
      <button
        className={
          "shop-feed-open shop-feed-slots " + (times?.length ? "has-slots" : "")
        }
        onClick={() => onClick(shop)}
      >
        <Icon name="clock" size={14} />
        {times?.length ? (
          <span>
            오늘 <b>{times.slice(0, 3).join(" ")}</b>
            {times.length > 3 && " 외 +" + (times.length - 3)}
          </span>
        ) : (
          <span>
            {times
              ? "당일 예약이 마감되었어요"
              : shop.todayOpen
                ? "오늘 예약 가능한 시간을 확인해보세요"
                : "예약 가능 시간을 확인해보세요"}
          </span>
        )}
      </button>
      {photos.length > 0 && (
        <div className="shop-feed-photos" aria-label={shop.name + " 사진"}>
          {photos.map((src, i) => (
            <button
              key={src + i}
              onClick={() => onClick(shop)}
              aria-label={shop.name + " 사진 " + (i + 1)}
            >
              <img
                src={feedImage(src)}
                onError={onImgError}
                alt=""
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}
      {shop.previewReview && (
        <button className="shop-feed-review" onClick={() => onClick(shop)}>
          <span>{shop.previewReview}</span>
        </button>
      )}
    </article>
  );
}
