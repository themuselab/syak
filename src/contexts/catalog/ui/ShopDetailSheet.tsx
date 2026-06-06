import { useEffect, useState } from "react";
import { useShopDetail } from "./hooks/useShopDetail";
import { thumbW } from "../../../shared/ui/image";
import { usecases } from "../../../app/composition-root";
import type { ReservationRoute } from "../domain/shop";

function tomorrowYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Props = {
  shopId: string;
  onClose: () => void;
  onReserveClick: (shopId: string, route: ReservationRoute) => void;
};

/** 샵 상세 — 전체화면 시트. 이미지/정보/메뉴/이벤트/예약루트. */
export function ShopDetailSheet({ shopId, onClose, onReserveClick }: Props) {
  const { detail, loading } = useShopDetail(shopId);
  const [slots, setSlots] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    usecases.reservation.getShopSlots(shopId, tomorrowYmd()).then((s) => {
      if (alive) setSlots(s);
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
          {/* 이미지 */}
          <Gallery
            images={[
              detail.images.representative,
              ...detail.images.gallery,
              ...detail.images.menu,
            ].filter(Boolean) as string[]}
          />

          <div style={{ padding: "14px 16px 100px" }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{detail.name}</h2>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {detail.hasEvent && <DBadge tone="event">이벤트</DBadge>}
              <DBadge tone="price">{detail.priceTier}</DBadge>
              {detail.firstVisitDeal && <DBadge tone="first">첫방문 특가</DBadge>}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 10 }}>
              ⭐ 리뷰 {detail.reviewTotal.toLocaleString()} · 블로그 {detail.blogReviewTotal.toLocaleString()}
            </div>

            {/* 내일 빈 시간 */}
            {slots && slots.length > 0 && (
              <SlotsCard slots={slots} naverUrl={detail.reservationRoutes.find((r) => r.type === "naver")?.value}
                onPick={() => onReserveClick(detail.id, { type: "naver", label: "네이버로 예약", value: "" })} />
            )}

            {/* 기본 정보 */}
            <Section title="정보">
              <Info label="주소" value={detail.roadAddress} />
              <Info label="영업" value={detail.hoursText} />
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
              {detail.conveniences.length > 0 && (
                <Info label="편의" value={detail.conveniences.join(" · ")} />
              )}
            </Section>

            {/* 메뉴 */}
            {detail.menus.length > 0 && (
              <Section title="메뉴 · 가격">
                {detail.menus.slice(0, 12).map((m, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}
                  >
                    <span>
                      {m.recommend && <span style={{ color: "#ec4899", fontWeight: 700, marginRight: 4 }}>추천</span>}
                      {m.name}
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {m.price ? `${m.price.toLocaleString()}원` : "—"}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {/* 리뷰 */}
            {detail.reviews.length > 0 && (
              <Section title="방문자 리뷰">
                {detail.reviews.map((r, i) => (
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
              </Section>
            )}
          </div>

          {/* 예약하기 (고정 하단) */}
          <ReserveBar routes={detail.reservationRoutes} onReserve={(r) => onReserveClick(detail.id, r)} />
        </>
      )}
    </div>
  );
}

function Gallery({ images }: { images: string[] }) {
  const [idx, setIdx] = useState(0);
  if (!images.length)
    return (
      <div style={{ height: 260, background: "#ededf0", display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", fontSize: 15 }}>
        이미지 갤러리
      </div>
    );
  const shown = images.slice(0, 10);
  return (
    <div style={{ position: "relative" }}>
      <div
        onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
      >
        {shown.map((src, i) => (
          <img
            key={i}
            src={thumbW(src, 700)}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: 280, objectFit: "cover", flexShrink: 0, scrollSnapAlign: "start" }}
          />
        ))}
      </div>
      {shown.length > 1 && (
        <div style={{ position: "absolute", right: 12, bottom: 12, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 12, fontWeight: 600, borderRadius: 12, padding: "3px 11px" }}>
          {idx + 1} / {shown.length}
        </div>
      )}
    </div>
  );
}

const DTONES = {
  event: { bg: "#fdecf1", color: "#e6396a" },
  price: { bg: "#f0f0f3", color: "#6b6b72" },
  first: { bg: "#fff1e3", color: "#e3820f" },
} as const;
function DBadge({ tone, children }: { tone: keyof typeof DTONES; children: React.ReactNode }) {
  const c = DTONES[tone];
  return <span style={{ fontSize: 13, fontWeight: 600, color: c.color, background: c.bg, borderRadius: 7, padding: "4px 10px" }}>{children}</span>;
}

function SlotsCard({ slots, naverUrl, onPick }: { slots: string[]; naverUrl?: string; onPick: () => void }) {
  return (
    <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: "#fdeef2", border: "1px solid #f6c6dc" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>내일 예약 가능 시간</span>
        <span style={{ fontSize: 11, color: "#c2477e", fontWeight: 600 }}>매시간 갱신</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 11 }}>
        {slots.slice(0, 18).map((t) => (
          <a
            key={t}
            href={naverUrl || "#"}
            target="_blank"
            rel="noreferrer"
            onClick={onPick}
            style={{ padding: "7px 13px", borderRadius: 18, background: "#fff", color: "#ec4899", border: "1.5px solid #ec4899", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
          >
            {t}
          </a>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#a4567e", marginTop: 11, lineHeight: 1.55 }}>
        매시간 자동 수집 기준이라 실제 예약 상황과 다를 수 있어요.
        <br />
        시간을 누르면 네이버 예약으로 이동해요.
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

const ROUTE_PRIORITY: ReservationRoute["type"][] = ["naver", "talktalk", "kakao", "instagram", "phone"];

function ReserveBar({ routes, onReserve }: { routes: ReservationRoute[]; onReserve: (r: ReservationRoute) => void }) {
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
