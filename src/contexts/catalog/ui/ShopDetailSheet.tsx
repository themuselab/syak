import { useEffect, useRef, useState } from "react";
import { useShopDetail } from "./hooks/useShopDetail";
import { thumbW, FALLBACK_IMAGE, onImgError } from "../../../shared/ui/image";
import { usecases } from "../../../app/composition-root";
import { color, radius, shadow, button } from "../../../shared/ui/tokens";
import type { ReservationRoute } from "../domain/shop";

// 대표(최저) 실서비스가 — add-on/잡메뉴(추가·기장·옵션 등) 제외하고 가장 싼 메뉴
const PRICE_NOISE = /제거|오프|off|리무브|리페어|음료|추가|옵션|보강|보수|파라핀|영양제|드릴|보호|글루|기장|길이|증모|붙임|별도/;
function repMenu(menus: { name: string; price: number | null }[]): { name: string; price: number } | null {
  let best: { name: string; price: number } | null = null;
  for (const m of menus) {
    const p = m.price;
    if (!p || p < 5000 || p > 2000000) continue;
    if (PRICE_NOISE.test(m.name || "")) continue;
    if (!best || p < best.price) best = { name: m.name, price: p };
  }
  return best;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayYmd(): string {
  return ymd(new Date());
}
function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return ymd(d);
}
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Props = {
  shopId: string;
  onClose: () => void;
  onReserveClick: (
    shopId: string,
    route: ReservationRoute,
    meta?: { slot?: { date: string; time: string }; district?: string; category?: string },
  ) => void;
};

/** 샵 상세 — 전체화면 시트. 이미지/정보/메뉴/이벤트/예약루트. */
export function ShopDetailSheet({ shopId, onClose, onReserveClick }: Props) {
  const { detail, loading } = useShopDetail(shopId);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [todaySlots, setTodaySlots] = useState<string[] | null>(null);
  const [showAllMenus, setShowAllMenus] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  useEffect(() => {
    let alive = true;
    usecases.reservation.getShopSlots(shopId, tomorrowYmd()).then((s) => {
      if (alive) setSlots(s);
    });
    // 오늘 남은 예약 시간 (지난 시간은 제외)
    usecases.reservation.getShopSlots(shopId, todayYmd()).then((s) => {
      if (alive) {
        const now = nowHHMM();
        setTodaySlots(s.map((t) => t.slice(0, 5)).filter((t) => t >= now));
      }
    });
    return () => {
      alive = false;
    };
  }, [shopId]);

  // 상세 체류시간(초) — 닫힐 때 기록. 포폴/가격 보는 시간 = 관심도 신호.
  useEffect(() => {
    const t0 = Date.now();
    return () => {
      usecases.analytics.track({ event: "detail_close", shopId, ms: Date.now() - t0 });
    };
  }, [shopId]);

  // 포폴 사진 넘겨봄 (1회만) / 메뉴 더보기 — 상세 내부 행동
  const galleryTracked = useRef(false);
  function onGallerySwipe() {
    if (galleryTracked.current) return;
    galleryTracked.current = true;
    usecases.analytics.track({ event: "gallery_view", shopId });
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: color.white,
        color: color.text.strong,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 41,
          width: 40,
          height: 40,
          borderRadius: 20,
          border: `1px solid ${color.gray[300]}`,
          background: color.white,
          boxShadow: shadow.xs,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
        }}
        aria-label="뒤로"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.gray[800]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      {loading && <div style={{ padding: 40, textAlign: "center", color: color.text.hint, fontSize: 14 }}>불러오는 중…</div>}
      {!loading && !detail && <div style={{ padding: 40, textAlign: "center", color: color.text.hint, fontSize: 14 }}>정보 없음</div>}

      {detail && (
        <>
          {/* 이미지 — 작업 사진 우선(대표 → 가게갤러리 → 손님 리뷰사진), 가격판(menu)은 맨 뒤 */}
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

          <div style={{ padding: "16px 20px 120px" }}>
            <h2 style={{ fontSize: 24, lineHeight: "32px", letterSpacing: -0.48, fontWeight: 600, margin: 0, color: color.text.strong }}>{detail.name}</h2>
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {detail.isPartner && <DBadge tone="partner">샥 파트너</DBadge>}
              {detail.hasEvent && <DBadge tone="event">{detail.eventPrice ?? "할인"}</DBadge>}
              <DBadge tone="price">{detail.priceTier}</DBadge>
            </div>
            {/* 평점·지역·시술 한 줄로 합침 (정보 정리) */}
            <div style={{ fontSize: 14, color: color.text.subtle, marginTop: 8 }}>
              리뷰 {detail.reviewTotal.toLocaleString()} · {detail.gu}
              {detail.services.length > 0 && ` · ${detail.services.slice(0, 3).join("·")}`}
            </div>

            {/* 파일럿(파트너) 전용 배너 — 사장님 확인된 할인 + 빈 시간 (수동 큐레이션) */}
            {detail.pilotCoupon && (
              <div style={{ background: color.brand.tint, border: `1px solid ${color.primary[300]}`, borderRadius: radius.md, padding: "12px 14px", marginTop: 12 }}>
                <span style={{ display: "inline-block", background: color.primary[500], color: color.white, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4, marginBottom: 8 }}>
                  샥 파트너 혜택
                </span>
                <div style={{ fontSize: 14, lineHeight: "20px", color: color.primary[700], fontWeight: 600 }}>{detail.pilotCoupon}</div>
                {detail.pilotHours && (
                  <div style={{ fontSize: 12, color: color.primary[600], marginTop: 4, fontWeight: 500 }}>빈자리: {detail.pilotHours}</div>
                )}
              </div>
            )}

            {/* 할인/이벤트 박스 (스크랩) — 파일럿 배너 없을 때만 */}
            {!detail.pilotCoupon && detail.hasEvent && detail.eventDesc && (
              <div style={{ background: color.primary[50], borderRadius: radius.md, padding: "12px 14px", marginTop: 12 }}>
                <span style={{ display: "inline-block", background: color.primary[500], color: color.white, fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 4, marginBottom: 8 }}>
                  {detail.eventPrice ?? "할인"}
                </span>
                <div style={{ fontSize: 14, lineHeight: "20px", color: color.primary[700], fontWeight: 500, whiteSpace: "pre-line" }}>{detail.eventDesc}</div>
              </div>
            )}

            {/* ⚡ 오늘 바로 예약 — 당일예약이 핵심이라 가장 크게(솔리드 핑크) */}
            {todaySlots && todaySlots.length > 0 && (
              <div style={{ marginTop: 16, padding: 16, borderRadius: radius.md, background: color.primary[500], color: color.white }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>오늘 바로 예약</span>
                  <span style={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>지금 남은 시간</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
                  {todaySlots.slice(0, 18).map((t) => (
                    <a
                      key={t}
                      href={detail.reservationRoutes.find((r) => r.type === "naver")?.value || "#"}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => onReserveClick(detail.id, { type: "naver", label: "네이버로 예약", value: "" }, { slot: { date: todayYmd(), time: t }, district: detail.gu, category: detail.category })}
                      style={{ height: 36, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: radius.full, background: color.white, color: color.primary[500], fontSize: 14, fontWeight: 600, textDecoration: "none" }}
                    >
                      {t}
                    </a>
                  ))}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 12 }}>시간을 누르면 네이버 예약으로 이동해요.</div>
              </div>
            )}

            {/* 내일도 예약 가능 (보조, 컴팩트) */}
            {slots && slots.length > 0 && (
              <SlotsCard slots={slots}
                naverUrl={detail.reservationRoutes.find((r) => r.type === "naver")?.value}
                onPick={(t) => onReserveClick(detail.id, { type: "naver", label: "네이버로 예약", value: "" }, { slot: { date: tomorrowYmd(), time: t }, district: detail.gu, category: detail.category })} />
            )}

            {/* 메뉴 · 가격 — 예약 시간 다음. 최저가가 무슨 메뉴인지 강조(필터 오해 방지) */}
            {detail.menus.length > 0 && (() => {
              const rep = repMenu(detail.menus);
              return (
                <Section title="메뉴 · 가격">
                  {rep && (
                    <div style={{ background: color.primary[50], borderRadius: radius.sm, padding: "10px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: color.primary[700] }}>최저 · {rep.name}</span>
                      <span style={{ fontSize: 16, fontWeight: 600, color: color.primary[500] }}>{rep.price.toLocaleString()}원~</span>
                    </div>
                  )}
                  {detail.menus.slice(0, showAllMenus ? 30 : 5).map((m, i) => {
                    const isRep = !!rep && m.name === rep.name && m.price === rep.price;
                    return (
                      <div
                        key={i}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", fontSize: 14, color: color.text.base, borderTop: i === 0 ? "none" : `1px solid ${color.line.divider}` }}
                      >
                        <span>
                          {isRep && <span style={{ color: color.primary[500], fontWeight: 600, marginRight: 4 }}>최저가</span>}
                          {m.recommend && <span style={{ color: color.primary[500], fontWeight: 500, marginRight: 4 }}>추천</span>}
                          {m.name}
                        </span>
                        <span style={{ fontWeight: isRep ? 600 : 500, color: isRep ? color.primary[500] : color.text.strong, flexShrink: 0 }}>
                          {m.price ? `${m.price.toLocaleString()}원` : "—"}
                        </span>
                      </div>
                    );
                  })}
                  {!showAllMenus && detail.menus.length > 5 && (
                    <button onClick={() => { setShowAllMenus(true); usecases.analytics.track({ event: "menu_view", shopId }); }} style={moreBtnStyle}>
                      메뉴 {detail.menus.length - 5}개 더보기
                    </button>
                  )}
                </Section>
              );
            })()}

            {/* 기본 정보 */}
            <Section title="정보">
              <Info label="주소" value={detail.roadAddress} />
              {todaySlots !== null && todaySlots.length === 0 && (
                <Info label="오늘 예약" value="오늘은 예약 마감이에요" />
              )}
              <Info label="전화" value={detail.phone} />
              {detail.instagram && (
                <Info
                  label="인스타"
                  value={
                    <a href={detail.instagram} target="_blank" rel="noreferrer" style={{ color: color.primary[500] }}>
                      {detail.instagram.replace("https://www.instagram.com/", "@").split("?")[0]}
                    </a>
                  }
                />
              )}
            </Section>

            {/* 리뷰 — 2개만, 더보기로 펼침 */}
            {detail.reviews.length > 0 && (
              <Section title={`방문자 리뷰 ${detail.reviewTotal.toLocaleString()}`}>
                {detail.reviews.slice(0, showAllReviews ? 30 : 2).map((r, i) => (
                  <div key={i} style={{ padding: "10px 12px", marginTop: i ? 8 : 0, borderRadius: radius.sm, background: color.surface.muted }}>
                    <div style={{ fontSize: 14, lineHeight: "20px", color: color.text.muted }}>{r.body}</div>
                    {r.keywords.length > 0 && (
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {r.keywords.slice(0, 4).map((k) => (
                          <span key={k} style={{ fontSize: 11, color: color.text.subtle, background: color.white, borderRadius: 4, padding: "1px 6px" }}>
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.visited && <div style={{ fontSize: 11, color: color.text.faint, marginTop: 4 }}>{r.visited}</div>}
                  </div>
                ))}
                {!showAllReviews && detail.reviews.length > 2 && (
                  <button onClick={() => setShowAllReviews(true)} style={moreBtnStyle}>리뷰 더보기</button>
                )}
              </Section>
            )}
          </div>

          {/* 예약하기 (고정 하단) */}
          <ReserveBar routes={detail.reservationRoutes} onReserve={(r) => onReserveClick(detail.id, r, { district: detail.gu, category: detail.category })} />
        </>
      )}
    </div>
  );
}

function Gallery({ images, onSwipe }: { images: string[]; onSwipe?: () => void }) {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!images.length)
    return (
      <img
        src={FALLBACK_IMAGE}
        alt=""
        style={{ width: "100%", height: 300, objectFit: "cover", display: "block", background: color.primary[50] }}
      />
    );
  const shown = images.slice(0, 20);
  const jump = (i: number) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div>
      {/* 큰 사진 (스와이프) */}
      <div style={{ position: "relative" }}>
        <div
          ref={scrollRef}
          onScroll={(e) => {
            const i = Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth);
            setIdx(i);
            if (i > 0) onSwipe?.();
          }}
          style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {shown.map((src, i) => (
            <img
              key={i}
              src={thumbW(src)}
              onError={onImgError}
              alt=""
              loading="lazy"
              decoding="async"
              style={{ width: "100%", height: 300, objectFit: "cover", flexShrink: 0, scrollSnapAlign: "start" }}
            />
          ))}
        </div>
        {shown.length > 1 && (
          <div style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(0,0,0,.55)", color: color.white, fontSize: 12, fontWeight: 500, borderRadius: radius.full, padding: "3px 10px" }}>
            {idx + 1} / {shown.length}
          </div>
        )}
      </div>
      {/* 썸네일 스트립 — 작업 사진 한눈에 훑기, 탭하면 크게 */}
      {shown.length > 1 && (
        <div style={{ display: "flex", gap: 4, overflowX: "auto", padding: "8px 20px 4px", scrollbarWidth: "none" }}>
          {shown.map((src, i) => (
            <img
              key={i}
              src={thumbW(src)}
              onError={onImgError}
              alt=""
              loading="lazy"
              onClick={() => jump(i)}
              style={{
                width: 58,
                height: 58,
                objectFit: "cover",
                borderRadius: 6,
                flexShrink: 0,
                cursor: "pointer",
                border: i === idx ? `2px solid ${color.primary[500]}` : "2px solid transparent",
                opacity: i === idx ? 1 : 0.65,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const moreBtnStyle: React.CSSProperties = {
  width: "100%", marginTop: 10, height: 40, border: `1px solid ${color.line.base}`, borderRadius: radius.sm,
  background: color.white, color: color.text.muted, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
};

// 홈 시안 태그 톤: 이벤트 = 연분홍 + 핑크, 가격대 = 회색, 파트너 = 앱 브랜드 칩(연분홍 + primary-300 테두리)
const DTONES = {
  partner: { bg: color.brand.tint, color: color.primary[500], border: color.primary[300] },
  event: { bg: color.primary[50], color: color.primary[500], border: "transparent" },
  price: { bg: color.gray[100], color: color.gray[700], border: "transparent" },
} as const;
function DBadge({ tone, children }: { tone: keyof typeof DTONES; children: React.ReactNode }) {
  const c = DTONES[tone];
  return <span style={{ fontSize: 12, lineHeight: "16px", fontWeight: 500, color: c.color, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 7px" }}>{children}</span>;
}

function SlotsCard({ slots, naverUrl, onPick }: { slots: string[]; naverUrl?: string; onPick: (time: string) => void }) {
  return (
    <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: radius.md, background: color.gray[50], border: `1px solid ${color.line.base}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: color.text.strong }}>내일도 예약 가능</span>
        <span style={{ fontSize: 11, color: color.text.faint, fontWeight: 500 }}>매시간 갱신</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
        {slots.slice(0, 12).map((t) => (
          <a
            key={t}
            href={naverUrl || "#"}
            target="_blank"
            rel="noreferrer"
            onClick={() => onPick(t)}
            style={{ height: 30, display: "inline-flex", alignItems: "center", padding: "0 12px", borderRadius: radius.full, background: color.white, color: color.gray[700], border: `1px solid ${color.gray[300]}`, fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          >
            {t}
          </a>
        ))}
        {slots.length > 12 && <span style={{ fontSize: 12, color: color.text.faint, padding: "6px 2px" }}>+{slots.length - 12}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600, margin: "0 0 12px", color: color.text.strong }}>{title}</h3>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 14, lineHeight: "20px" }}>
      <span style={{ color: color.text.hint, flexShrink: 0, width: 60 }}>{label}</span>
      <span style={{ color: color.text.base }}>{value}</span>
    </div>
  );
}

// 네이버 톡톡은 제외 — 예약(네이버 예약) 중심으로 정확하게
const ROUTE_PRIORITY: ReservationRoute["type"][] = ["naver", "kakao", "instagram", "phone"];

function ReserveBar({ routes: allRoutes, onReserve }: { routes: ReservationRoute[]; onReserve: (r: ReservationRoute) => void }) {
  const routes = allRoutes.filter((r) => r.type !== "talktalk");
  if (!routes.length)
    return (
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: 16, background: color.white, borderTop: `1px solid ${color.line.divider}`, textAlign: "center", color: color.text.faint, fontSize: 14, zIndex: 41 }}>
        예약 정보 없음
      </div>
    );
  const sorted = [...routes].sort((a, b) => ROUTE_PRIORITY.indexOf(a.type) - ROUTE_PRIORITY.indexOf(b.type));
  const primary = sorted[0];
  const others = sorted.slice(1, 4);
  const href = (r: ReservationRoute) => (r.type === "phone" ? `tel:${r.value}` : r.value);
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 20px 16px", background: color.white, borderTop: `1px solid ${color.line.divider}`, zIndex: 41 }}>
      {others.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 10, justifyContent: "center" }}>
          {others.map((r) => (
            <a
              key={r.type}
              href={href(r)}
              target={r.type === "phone" ? undefined : "_blank"}
              rel="noreferrer"
              onClick={() => onReserve(r)}
              style={{ height: 33, display: "inline-flex", alignItems: "center", padding: "0 12px", borderRadius: radius.full, border: `1px solid ${color.gray[300]}`, color: color.gray[800], fontSize: 14, fontWeight: 500, textDecoration: "none" }}
            >
              {r.label}
            </a>
          ))}
        </div>
      )}
      <a
        href={href(primary)}
        target={primary.type === "phone" ? undefined : "_blank"}
        rel="noreferrer"
        onClick={() => onReserve(primary)}
        style={{ ...button("primary"), height: 52 }}
      >
        {primary.label}
      </a>
    </div>
  );
}
