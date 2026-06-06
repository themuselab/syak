import { useShopDetail } from "./hooks/useShopDetail";
import { ROUTE_ICON } from "./theme";
import type { ReservationRoute } from "../domain/shop";

type Props = {
  shopId: string;
  onClose: () => void;
  onReserveClick: (shopId: string, route: ReservationRoute) => void;
};

/** 샵 상세 — 전체화면 시트. 이미지/정보/메뉴/이벤트/예약루트. */
export function ShopDetailSheet({ shopId, onClose, onReserveClick }: Props) {
  const { detail, loading } = useShopDetail(shopId);

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
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{detail.name}</h2>
            <div style={{ fontSize: 13, color: "#ec4899", marginTop: 4 }}>
              {detail.category}
              {detail.firstVisitDeal && " · 첫방문특가"}
              {detail.hasEvent && " · 이벤트중"}
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
              ⭐ 리뷰 {detail.reviewTotal.toLocaleString()} · 블로그 {detail.blogReviewTotal.toLocaleString()}
            </div>

            {/* 기본 정보 */}
            <Section title="정보">
              <Info label="📍 주소" value={detail.roadAddress} />
              <Info label="🕐 영업" value={detail.hoursText} />
              <Info label="📞 전화" value={detail.phone} />
              {detail.instagram && (
                <Info
                  label="📷 인스타"
                  value={
                    <a href={detail.instagram} target="_blank" rel="noreferrer" style={{ color: "#c13584" }}>
                      {detail.instagram.replace("https://www.instagram.com/", "@").split("?")[0]}
                    </a>
                  }
                />
              )}
              {detail.conveniences.length > 0 && (
                <Info label="✨ 편의" value={detail.conveniences.join(" · ")} />
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
                      {m.recommend && "⭐ "}
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
  if (!images.length) return <div style={{ height: 200, background: "#f2f2f4" }} />;
  return (
    <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
      {images.slice(0, 10).map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          loading="lazy"
          style={{ width: i === 0 ? "100%" : 240, height: 240, objectFit: "cover", flexShrink: 0, scrollSnapAlign: "start" }}
        />
      ))}
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

function ReserveBar({ routes, onReserve }: { routes: ReservationRoute[]; onReserve: (r: ReservationRoute) => void }) {
  if (!routes.length)
    return (
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: 12, background: "#fff", borderTop: "1px solid #eee", textAlign: "center", color: "#bbb", fontSize: 13 }}>
        예약 정보 없음
      </div>
    );
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
        background: "#fff",
        borderTop: "1px solid #eee",
        display: "flex",
        gap: 8,
        zIndex: 41,
      }}
    >
      {routes.slice(0, 3).map((r) => (
        <a
          key={r.type}
          href={r.type === "phone" ? `tel:${r.value}` : r.value}
          target={r.type === "phone" ? undefined : "_blank"}
          rel="noreferrer"
          onClick={() => onReserve(r)}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "12px 8px",
            borderRadius: 12,
            background: r.type === "naver" ? "#03c75a" : "#ec4899",
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          {ROUTE_ICON[r.type]} {r.label}
        </a>
      ))}
    </div>
  );
}
