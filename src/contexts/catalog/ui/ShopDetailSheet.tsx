import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useShopDetail } from "./hooks/useShopDetail";
import { feedImage, onImgError } from "../../../shared/ui/image";
import { usecases } from "../../../app/composition-root";
import { Icon } from "../../../shared/ui/Icon";
import type { ReservationRoute, ShopDetail } from "../domain/shop";
import { useNaverCta } from "../../../shared/platform/use-naver-cta";

type Props = {
  shopId: string;
  onClose: () => void;
  onReserveClick: (
    shopId: string,
    route: ReservationRoute,
    meta?: {
      isPartner: boolean;
      slot?: { date: string; time: string };
      district?: string;
      category?: string;
    },
  ) => void;
};
const tabs = [
  ["home", "홈"],
  ["menu", "가격"],
  ["availability", "예약"],
  ["review", "리뷰"],
] as const;
type Tab = (typeof tabs)[number][0];

export function ShopDetailSheet({ shopId, onClose, onReserveClick }: Props) {
  const { detail, loading } = useShopDetail(shopId);
  const [active, setActive] = useState<Tab>("home");
  const [showAllMenus, setShowAllMenus] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const sections = useRef<Partial<Record<Tab, HTMLElement | null>>>({});
  const viewed = useRef<string | null>(null);
  const galleryTracked = useRef(false);
  useEffect(() => {
    if (!detail || detail.id !== shopId || viewed.current === shopId) return;
    viewed.current = shopId;
    usecases.analytics.track({
      event: "detail_view",
      shopId,
      isPartner: detail.isPartner,
      shopCategory: detail.category,
      shopDistrict: detail.gu,
    });
  }, [detail, shopId]);
  useEffect(() => {
    const t0 = Date.now();
    return () =>
      usecases.analytics.track({
        event: "detail_close",
        shopId,
        ms: Date.now() - t0,
      });
  }, [shopId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  function jump(tab: Tab) {
    setActive(tab);
    scroll.current?.scrollTo({
      top: tab === "home" ? 0 : (sections.current[tab]?.offsetTop ?? 0) - 42,
      behavior: "smooth",
    });
    if (tab === "menu" || tab === "review")
      usecases.analytics.track({
        event: tab === "menu" ? "menu_view" : "review_view",
        shopId,
        isPartner: detail?.isPartner,
      });
  }
  function onGallerySwipe() {
    if (galleryTracked.current) return;
    galleryTracked.current = true;
    usecases.analytics.track({ event: "gallery_view", shopId });
  }
  return (
    <div
      className="shop-detail"
      role="dialog"
      aria-modal="true"
      aria-label={detail?.name ?? "샵 상세"}
    >
      <header className="detail-header">
        <button className="icon-button" aria-label="뒤로" onClick={onClose}>
          <Icon name="back" size={26} />
        </button>
        <div className="detail-header-actions">
          <a
            href="https://app.themuselab.kr/favorites"
            className="icon-button shop-favorite"
            aria-label="즐겨찾기 — 앱에서 열기"
          >
            <Icon name="star" size={24} />
          </a>
          <button
            className="icon-button"
            aria-label="상세 닫기"
            onClick={onClose}
          >
            <Icon name="close" size={24} />
          </button>
        </div>
      </header>
      <div
        ref={scroll}
        className="detail-scroll"
        onScroll={() => {
          const y = (scroll.current?.scrollTop ?? 0) + 65;
          const found = [...tabs]
            .reverse()
            .find(
              ([key]) =>
                key !== "home" &&
                sections.current[key] &&
                sections.current[key]!.offsetTop <= y,
            );
          setActive(found?.[0] ?? "home");
        }}
      >
        {loading && (
          <div className="detail-empty" role="status">
            불러오는 중…
          </div>
        )}
        {!loading && !detail && (
          <div className="detail-empty">
            샵 정보를 불러올 수 없어요.
            <button onClick={onClose}>지도로 돌아가기</button>
          </div>
        )}
        {detail && (
          <>
            <div className="detail-title">
              <div>
                <h1>{detail.name}</h1>
                <span>{detail.category}샵</span>
              </div>
              <p>
                {detail.gu}
                <span className="meta-dot"> • </span>리뷰{" "}
                {detail.reviewTotal.toLocaleString()}
                {detail.isPartner && (
                  <span className="partner-badge">샥 파트너</span>
                )}
              </p>
            </div>
            <Gallery
              images={[
                ...new Set(
                  [
                    detail.images.representative,
                    ...detail.images.gallery,
                    ...detail.images.review,
                    ...detail.images.menu,
                  ].filter(Boolean) as string[],
                ),
              ]}
              onSwipe={onGallerySwipe}
            />
            <nav className="detail-tabs" role="tablist" aria-label="샵 상세">
              {tabs.map(([key, label]) => (
                <button
                  role="tab"
                  aria-selected={active === key}
                  aria-controls={"shop-section-" + key}
                  key={key}
                  onClick={() => jump(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <section
              id="shop-section-home"
              className="detail-home"
              ref={(e) => {
                sections.current.home = e;
              }}
            >
              {(detail.pilotCoupon || detail.eventDesc) && (
                <div className="detail-event">
                  <img
                    src={import.meta.env.BASE_URL + "map/chip-discount.png"}
                    width={18}
                    height={18}
                    alt=""
                  />
                  <span>{detail.pilotCoupon || detail.eventDesc}</span>
                </div>
              )}
              {detail.roadAddress && (
                <Info icon="arrow">{detail.roadAddress}</Info>
              )}
              <BusinessHours hours={detail.businessHours} />
              {detail.phone && (
                <Info icon="phone">
                  <a
                    href={"tel:" + detail.phone}
                    onClick={() =>
                      onReserveClick(
                        detail.id,
                        {
                          type: "phone",
                          label: "전화예약",
                          value: detail.phone!,
                        },
                        {
                          isPartner: detail.isPartner,
                          district: detail.gu,
                          category: detail.category,
                        },
                      )
                    }
                  >
                    {detail.phone}
                  </a>
                </Info>
              )}
              {detail.instagram && (
                <Info icon="instagram">
                  <a href={detail.instagram} target="_blank" rel="noreferrer">
                    {"@" +
                      detail.instagram
                        .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
                        .split(/[/?]/)[0]}
                  </a>
                </Info>
              )}
              {detail.reservationRoutes
                .filter((r) => r.type === "kakao" && r.value)
                .map((r) => (
                  <Info key={r.type}>
                    <a
                      href={r.value}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        onReserveClick(detail.id, r, {
                          isPartner: detail.isPartner,
                          district: detail.gu,
                          category: detail.category,
                        })
                      }
                    >
                      {r.label}
                    </a>
                  </Info>
                ))}
              {detail.pilotHours && (
                <p className="detail-note">{detail.pilotHours}</p>
              )}
              {detail.introduction && (
                <div className="detail-introduction">
                  <h2>소개</h2>
                  <p>{detail.introduction}</p>
                </div>
              )}
            </section>
            <section
              id="shop-section-menu"
              className="detail-section"
              ref={(e) => {
                sections.current.menu = e;
              }}
            >
              <h2>가격</h2>
              {detail.menus.length ? (
                detail.menus
                  .slice(0, showAllMenus ? undefined : 5)
                  .map((m, i) => (
                    <div className="detail-menu" key={i}>
                      <span>
                        {m.recommend && <small>추천 </small>}
                        {m.name}
                      </span>
                      <strong>
                        {m.price
                          ? m.price.toLocaleString() + "원"
                          : "가격 문의"}
                      </strong>
                    </div>
                  ))
              ) : (
                <p className="detail-note">등록된 가격 정보가 없어요.</p>
              )}
              {detail.menus.length > 5 && (
                <button
                  className="detail-more"
                  onClick={() => {
                    setShowAllMenus((v) => !v);
                    usecases.analytics.track({ event: "menu_view", shopId });
                  }}
                >
                  {showAllMenus ? "접기" : "가격 더보기"}
                </button>
              )}
            </section>
            <section
              id="shop-section-availability"
              className="detail-section"
              ref={(e) => {
                sections.current.availability = e;
              }}
            >
              <Availability detail={detail} onReserveClick={onReserveClick} />
            </section>
            <section
              id="shop-section-review"
              className="detail-section"
              ref={(e) => {
                sections.current.review = e;
              }}
            >
              <h2>
                방문자 리뷰 <span>{detail.reviewTotal.toLocaleString()}</span>
              </h2>
              {detail.reviews.length ? (
                detail.reviews
                  .slice(0, showAllReviews ? undefined : 2)
                  .map((r, i) => (
                    <article className="detail-review" key={i}>
                      <p>{r.body}</p>
                      <div className="review-keywords">
                        {r.keywords.slice(0, 5).map((k) => (
                          <span key={k}>{k}</span>
                        ))}
                      </div>
                      {r.visited && <small>{r.visited}</small>}
                    </article>
                  ))
              ) : (
                <p className="detail-note">아직 등록된 리뷰가 없어요.</p>
              )}
              {detail.reviews.length > 2 && (
                <button
                  className="detail-more"
                  onClick={() => {
                    setShowAllReviews((v) => !v);
                    usecases.analytics.track({
                      event: "review_view",
                      shopId,
                      isPartner: detail.isPartner,
                    });
                  }}
                >
                  {showAllReviews ? "접기" : "리뷰 더보기"}
                </button>
              )}
            </section>
          </>
        )}
      </div>
      {detail && (
        <ReserveBar
          shopId={detail.id}
          isPartner={detail.isPartner}
          routes={detail.reservationRoutes}
          onReserve={(r) =>
            onReserveClick(detail.id, r, {
              isPartner: detail.isPartner,
              district: detail.gu,
              category: detail.category,
            })
          }
        />
      )}
    </div>
  );
}

function Gallery({
  images,
  onSwipe,
}: {
  images: string[];
  onSwipe: () => void;
}) {
  return (
    <div
      className="detail-gallery"
      onScroll={(e) => {
        if (e.currentTarget.scrollLeft > 12) onSwipe();
      }}
      aria-label="샵 사진"
    >
      {images.length
        ? images
            .slice(0, 20)
            .map((src, i) => (
              <img
                key={src + i}
                src={feedImage(src)}
                onError={onImgError}
                alt={"샵 사진 " + (i + 1)}
                loading="lazy"
                decoding="async"
              />
            ))
        : Array.from({ length: 3 }, (_, i) => (
            <span className="detail-photo-placeholder" key={i} />
          ))}
    </div>
  );
}
function Info({
  icon = "arrow",
  children,
}: {
  icon?: "arrow" | "phone" | "clock" | "instagram";
  children: ReactNode;
}) {
  return (
    <div className="detail-info">
      <Icon name={icon} size={16} />
      <div>{children}</div>
    </div>
  );
}
function BusinessHours({ hours }: { hours: ShopDetail["businessHours"] }) {
  if (!hours?.length) return null;
  const now = new Date();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const entry = (day: string) =>
    hours.find((h) => h.day === day) ?? hours.find((h) => h.day === "매일");
  const today = entry(weekdays[now.getDay()]);
  const minute = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const clock = now.getHours() * 60 + now.getMinutes();
  const open = today?.start && today.end ? minute(today.start) : null;
  const end = today?.end
    ? minute(today.end) + (open != null && minute(today.end) <= open ? 1440 : 0)
    : null;
  const pause = today?.breaks?.find(
    (b) => clock >= minute(b.start) && clock < minute(b.end),
  );
  const isOpen =
    open != null && end != null && clock >= open && clock < end && !pause;
  const label = !today
    ? "영업시간"
    : open == null
      ? "휴무"
      : clock < open
        ? "영업 전"
        : pause
          ? "브레이크타임"
          : isOpen
            ? "영업 중"
            : "영업 종료";
  const note = isOpen
    ? `${today?.end}에 영업 종료`
    : open != null && clock < open
      ? `${today?.start}에 영업 시작`
      : pause
        ? `${pause.end}에 영업 재개`
        : null;
  return (
    <Info icon="clock">
      <details className="business-hours">
        <summary>
          <span style={{ color: isOpen ? "#0f9d58" : undefined }}>{label}</span>
          {note && ` · ${note}`} <Icon name="down" size={14} />
        </summary>
        <div>
          {["월", "화", "수", "목", "금", "토", "일"].map((day) => {
            const h = entry(day);
            return (
              <p key={day}>
                <span>{day}</span>
                <span>
                  {h?.start && h.end ? `${h.start}–${h.end}` : "휴무"}
                </span>
              </p>
            );
          })}
        </div>
      </details>
    </Info>
  );
}
function Availability({
  detail,
  onReserveClick,
}: {
  detail: ShopDetail;
  onReserveClick: Props["onReserveClick"];
}) {
  const [day, setDay] = useState(0);
  const [days] = useState(() =>
    Array.from({ length: 3 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        date:
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0"),
        label: ["오늘", "내일", "모레"][i],
        weekday: ["일", "월", "화", "수", "목", "금", "토"][d.getDay()],
      };
    }),
  );
  const [slots, setSlots] = useState<(string[] | null)[]>([null, null, null]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(
      days.map((d) => usecases.reservation.getShopSlots(detail.id, d.date)),
    )
      .then((rows) => {
        const now = new Date();
        const cut =
          String(now.getHours()).padStart(2, "0") +
          ":" +
          String(now.getMinutes()).padStart(2, "0");
        if (alive)
          setSlots(
            rows.map((r, i) =>
              [
                ...new Set(
                  r
                    .map((t) => t.slice(0, 5))
                    .filter((t) => i !== 0 || t >= cut),
                ),
              ].sort(),
            ),
          );
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [detail.id, days]);
  const naver = detail.reservationRoutes.find(
    (r) => r.type === "naver" && r.value,
  );
  const times = slots[day];
  return (
    <>
      <h2>예약 가능 시간</h2>
      <div className="availability-tabs" role="tablist" aria-label="예약 날짜">
        {days.map((d, i) => (
          <button
            key={d.date}
            role="tab"
            aria-selected={day === i}
            onClick={() => {
              setDay(i);
              usecases.analytics.track({
                event: "slot_list_view",
                shopId: detail.id,
                isPartner: detail.isPartner,
                properties: { day_index: i, slot_count: slots[i]?.length ?? 0 },
              });
            }}
          >
            {d.label} ({d.weekday})
            <small>{d.date.slice(5).replace("-", ".")}</small>
          </button>
        ))}
      </div>
      {failed ? (
        <p className="availability-empty">예약 시간을 불러오지 못했어요.</p>
      ) : times === null ? (
        <p className="availability-empty">예약 시간 확인 중…</p>
      ) : !times.length ? (
        <p className="availability-empty">예약이 모두 마감되었어요</p>
      ) : (
        <div className="availability-times">
          {times.map((t) =>
            naver ? (
              <a
                key={t}
                href={naver.value}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  onReserveClick(detail.id, naver, {
                    isPartner: detail.isPartner,
                    district: detail.gu,
                    category: detail.category,
                    slot: { date: days[day].date, time: t },
                  })
                }
              >
                {t}
              </a>
            ) : (
              <span key={t}>{t}</span>
            ),
          )}
        </div>
      )}
      {detail.isPartner && (
        <a
          className="slot-alert-link"
          href={
            "https://app.themuselab.kr/shop/" + encodeURIComponent(detail.id)
          }
        >
          빈자리 알림받기 <Icon name="arrow" size={16} />
        </a>
      )}
    </>
  );
}
const PRIORITY: ReservationRoute["type"][] = [
  "naver",
  "kakao",
  "instagram",
  "phone",
];
function ReserveBar({
  shopId,
  isPartner,
  routes,
  onReserve,
}: {
  shopId: string;
  isPartner: boolean;
  routes: ReservationRoute[];
  onReserve: (route: ReservationRoute) => void;
}) {
  const sorted = routes
    .filter((r) => r.type !== "talktalk" && r.value)
    .sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  const primary = sorted[0];
  const cta = useNaverCta(
    shopId,
    isPartner,
    primary?.type === "naver" && !!primary.value,
  );
  const secondary =
    sorted.find((r) => r.type === "instagram" && r !== primary) ||
    sorted.find((r) => r.type === "phone" && r !== primary);
  const href = (r: ReservationRoute) =>
    r.type === "phone" ? "tel:" + r.value.replace(/[^0-9+]/g, "") : r.value;
  return (
    <footer className="detail-reserve">
      {secondary && (
        <a
          className="reserve-secondary"
          href={href(secondary)}
          target={secondary.type === "phone" ? undefined : "_blank"}
          rel="noreferrer"
          onClick={() => onReserve(secondary)}
        >
          <Icon
            name={secondary.type === "instagram" ? "instagram" : "phone"}
            size={16}
          />
          {secondary.type === "instagram" ? "둘러보기" : "전화예약"}
        </a>
      )}
      {primary ? (
        <a
          className="reserve-primary"
          href={href(primary)}
          target={primary.type === "phone" ? undefined : "_blank"}
          rel="noreferrer"
          onClick={() => {
            cta.onInteraction();
            onReserve(primary);
          }}
        >
          {primary.type === "naver"
            ? (cta.label ?? primary.label)
            : primary.label}
          <Icon name="arrow" size={18} />
        </a>
      ) : (
        <div className="reserve-unavailable">네이버 예약이 불가한 샵이에요</div>
      )}
    </footer>
  );
}
