import { useEffect, useRef, useState } from "react";
import { useShopDetail } from "./hooks/useShopDetail";
import { thumbW, FALLBACK_IMAGE, onImgError } from "../../../shared/ui/image";
import { usecases } from "../../../app/composition-root";
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

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        background: "#fff",
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
          width: 36,
          height: 36,
          borderRadius: 18,
          border: "none",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,.2)",
          fontSize: 18,
        }}
      >
        ←
      </button>

      {loading && <div style={{ padding: 40, textAlign: "center", color: "#999" }}>불러오는 중…</div>}
      {!loading && !detail && <div style={{ padding: 40, textAlign: "center", color: "#999" }}>정보 없음</div>}

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
          />

          <div style={{ padding: "14px 16px 100px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{detail.name}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {detail.isPartner && <DBadge tone="partner">샥 파트너</DBadge>}
              {detail.hasEvent && <DBadge tone="event">{detail.eventPrice ?? "할인"}</DBadge>}
              <DBadge tone="price">{detail.priceTier}</DBadge>
            </div>
            {/* 평점·지역·시술 한 줄로 합침 (정보 정리) */}
            <div style={{ fontSize: 13, color: "#888", marginTop: 10 }}>
              리뷰 {detail.reviewTotal.toLocaleString()} · {detail.gu}
              {detail.services.length > 0 && ` · ${detail.services.slice(0, 3).join("·")}`}
            </div>

            {/* 파일럿(파트너) 전용 배너 — 사장님 확인된 할인 + 빈 시간 (수동 큐레이션) */}
            {detail.pilotCoupon && (
              <div style={{ background: "linear-gradient(135deg,#fff8e8,#ffefcb)", border: "1.5px solid #f5cf7a", borderRadius: 13, padding: "12px 13px", marginTop: 12 }}>
                <span style={{ display: "inline-block", background: "#f59e0b", color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 8, marginBottom: 7 }}>
                  샥 파트너 혜택
                </span>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: "#92600c", fontWeight: 700 }}>{detail.pilotCoupon}</div>
                {detail.pilotHours && (
                  <div style={{ fontSize: 12, color: "#b07d1e", marginTop: 5, fontWeight: 600 }}>빈자리: {detail.pilotHours}</div>
                )}
              </div>
            )}

            {/* 할인/이벤트 박스 (스크랩) — 파일럿 배너 없을 때만 */}
            {!detail.pilotCoupon && detail.hasEvent && detail.eventDesc && (
              <div style={{ background: "linear-gradient(135deg,#fff0f7,#ffe4f0)", border: "1.5px solid #f8c6dd", borderRadius: 13, padding: "12px 13px", marginTop: 12 }}>
                <span style={{ display: "inline-block", background: "#ec4899", color: "#fff", fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 8, marginBottom: 7 }}>
                  {detail.eventPrice ?? "할인"}
                </span>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#9b2a5e", fontWeight: 600, whiteSpace: "pre-line" }}>{detail.eventDesc}</div>
              </div>
            )}

            {/* ⚡ 오늘 바로 예약 — 당일예약이 핵심이라 가장 크게(솔리드 핑크) */}
            {todaySlots && todaySlots.length > 0 && (
              <div style={{ marginTop: 16, padding: 15, borderRadius: 15, background: "linear-gradient(135deg,#ec4899,#db2777)", color: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>오늘 바로 예약</span>
                  <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>지금 남은 시간</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
                  {todaySlots.slice(0, 18).map((t) => (
                    <a
                      key={t}
                      href={detail.reservationRoutes.find((r) => r.type === "naver")?.value || "#"}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => onReserveClick(detail.id, { type: "naver", label: "네이버로 예약", value: "" }, { slot: { date: todayYmd(), time: t }, district: detail.gu, category: detail.category })}
                      style={{ padding: "8px 14px", borderRadius: 18, background: "#fff", color: "#db2777", fontSize: 14, fontWeight: 800, textDecoration: "none" }}
                    >
                      {t}
                    </a>
                  ))}
                </div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 11 }}>시간을 누르면 네이버 예약으로 이동해요.</div>
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
                    <div style={{ background: "#fdeef6", border: "1px solid #f8c6dd", borderRadius: 10, padding: "9px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: "#9b2a5e" }}>최저 · {rep.name}</span>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#ec4899" }}>{rep.price.toLocaleString()}원~</span>
                    </div>
                  )}
                  {detail.menus.slice(0, showAllMenus ? 30 : 5).map((m, i) => {
                    const isRep = !!rep && m.name === rep.name && m.price === rep.price;
                    return (
                      <div
                        key={i}
                        style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}
                      >
                        <span>
                          {isRep && <span style={{ color: "#ec4899", fontWeight: 800, marginRight: 4 }}>최저가</span>}
                          {m.recommend && <span style={{ color: "#ec4899", fontWeight: 700, marginRight: 4 }}>추천</span>}
                          {m.name}
                        </span>
                        <span style={{ fontWeight: isRep ? 800 : 600, color: isRep ? "#ec4899" : undefined }}>
                          {m.price ? `${m.price.toLocaleString()}원` : "—"}
                        </span>
                      </div>
                    );
                  })}
                  {!showAllMenus && detail.menus.length > 5 && (
                    <button onClick={() => setShowAllMenus(true)} style={moreBtnStyle}>
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
                    <a href={detail.instagram} target="_blank" rel="noreferrer" style={{ color: "#ec4899" }}>
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
                  <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid #f4f4f6" : "none" }}>
                    <div style={{ fontSize: 13, lineHeight: 1.45 }}>{r.body}</div>
                    {r.keywords.length > 0 && (
                      <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {r.keywords.slice(0, 4).map((k) => (
                          <span key={k} style={{ fontSize: 10, color: "#888", background: "#f5f5f7", borderRadius: 4, padding: "1px 5px" }}>
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.visited && <div style={{ fontSize: 11, color: "#bbb", marginTop: 3 }}>{r.visited}</div>}
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

function Gallery({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!images.length)
    return (
      <img
        src={FALLBACK_IMAGE}
        alt=""
        style={{ width: "100%", height: 300, objectFit: "cover", display: "block", background: "#fdeef2" }}
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
          onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
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
          <div style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, fontWeight: 600, borderRadius: 12, padding: "3px 11px" }}>
            {idx + 1} / {shown.length}
          </div>
        )}
      </div>
      {/* 썸네일 스트립 — 작업 사진 한눈에 훑기, 탭하면 크게 */}
      {shown.length > 1 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px 4px", scrollbarWidth: "none" }}>
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
                borderRadius: 9,
                flexShrink: 0,
                cursor: "pointer",
                border: i === idx ? "2px solid #ec4899" : "2px solid transparent",
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
  width: "100%", marginTop: 8, padding: "9px", border: "1px solid #eee", borderRadius: 9,
  background: "#fff", color: "#999", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

const DTONES = {
  partner: { bg: "#f59e0b", color: "#fff" },
  event: { bg: "#ec4899", color: "#fff" },
  price: { bg: "#f0f0f3", color: "#6b6b72" },
  first: { bg: "#fff1e3", color: "#e3820f" },
} as const;
function DBadge({ tone, children }: { tone: keyof typeof DTONES; children: React.ReactNode }) {
  const c = DTONES[tone];
  return <span style={{ fontSize: 13, fontWeight: 600, color: c.color, background: c.bg, borderRadius: 7, padding: "4px 10px" }}>{children}</span>;
}

function SlotsCard({ slots, naverUrl, onPick }: { slots: string[]; naverUrl?: string; onPick: (time: string) => void }) {
  return (
    <div style={{ marginTop: 12, padding: "11px 12px", borderRadius: 12, background: "#fafafa", border: "1px solid #eee" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#666" }}>내일도 예약 가능</span>
        <span style={{ fontSize: 10.5, color: "#aaa", fontWeight: 600 }}>매시간 갱신</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
        {slots.slice(0, 12).map((t) => (
          <a
            key={t}
            href={naverUrl || "#"}
            target="_blank"
            rel="noreferrer"
            onClick={() => onPick(t)}
            style={{ padding: "5px 10px", borderRadius: 15, background: "#fff", color: "#999", border: "1px solid #ddd", fontSize: 12, fontWeight: 600, textDecoration: "none" }}
          >
            {t}
          </a>
        ))}
        {slots.length > 12 && <span style={{ fontSize: 11, color: "#bbb", padding: "5px 2px" }}>+{slots.length - 12}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px" }}>{title}</h3>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 13 }}>
      <span style={{ color: "#999", flexShrink: 0, width: 60 }}>{label}</span>
      <span style={{ color: "#333" }}>{value}</span>
    </div>
  );
}

// 네이버 톡톡은 제외 — 예약(네이버 예약) 중심으로 정확하게
const ROUTE_PRIORITY: ReservationRoute["type"][] = ["naver", "kakao", "instagram", "phone"];

function ReserveBar({ routes: allRoutes, onReserve }: { routes: ReservationRoute[]; onReserve: (r: ReservationRoute) => void }) {
  const routes = allRoutes.filter((r) => r.type !== "talktalk");
  if (!routes.length)
    return (
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: 16, background: "#fff", borderTop: "1px solid #eee", textAlign: "center", color: "#bbb", fontSize: 13, zIndex: 41 }}>
        예약 정보 없음
      </div>
    );
  const sorted = [...routes].sort((a, b) => ROUTE_PRIORITY.indexOf(a.type) - ROUTE_PRIORITY.indexOf(b.type));
  const primary = sorted[0];
  const others = sorted.slice(1, 4);
  const href = (r: ReservationRoute) => (r.type === "phone" ? `tel:${r.value}` : r.value);
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "12px 16px 16px", background: "#fff", borderTop: "1px solid #eee", zIndex: 41 }}>
      {others.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, justifyContent: "center" }}>
          {others.map((r) => (
            <a
              key={r.type}
              href={href(r)}
              target={r.type === "phone" ? undefined : "_blank"}
              rel="noreferrer"
              onClick={() => onReserve(r)}
              style={{ padding: "7px 14px", borderRadius: 18, border: "1.5px solid #e5e5e5", color: "#555", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
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
        style={{ display: "block", textAlign: "center", padding: 16, borderRadius: 14, background: "#ec4899", color: "#fff", fontWeight: 800, fontSize: 16, textDecoration: "none" }}
      >
        {primary.label}
      </a>
    </div>
  );
}
