import { useState } from "react";
import { useCatalog } from "../contexts/catalog/ui/hooks/useCatalog";
import { MapView } from "../contexts/catalog/ui/MapView";
import { CollectionRail } from "../contexts/catalog/ui/CollectionRail";
import { ShopListSheet } from "../contexts/catalog/ui/ShopListSheet";
import { ShopDetailSheet } from "../contexts/catalog/ui/ShopDetailSheet";
import { FilterModal } from "../contexts/catalog/ui/FilterModal";
import { MissedAlertSheet } from "../contexts/lead/ui/MissedAlertSheet";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { usecases } from "./composition-root";
import type { ShopSummary } from "../contexts/catalog/domain/shop";

export default function App() {
  const { shops, collections, loading, error, filter, setFilter } = useCatalog();
  const [snap, setSnap] = useState<"peek" | "full">("peek");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  function openDetail(shop: ShopSummary) {
    setSelectedId(shop.id);
    usecases.analytics.track({ event: "detail_view", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
  }
  function onPinClick(shop: ShopSummary) {
    setHighlightId(shop.id);
    usecases.analytics.track({ event: "pin_click", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
    openDetail(shop);
  }

  const activeFilterCount =
    (filter.categories?.length ?? 0) +
    (filter.priceTiers?.length ?? 0) +
    (filter.hasEventOnly ? 1 : 0) +
    (filter.firstVisitOnly ? 1 : 0) +
    (filter.reservableOnly ? 1 : 0);

  return (
    <div style={{ position: "fixed", inset: 0, fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      {/* 상단 바 */}
      <header style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 15, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(#fff, #ffffffdd 70%, transparent)" }}>
        <strong style={{ fontSize: 18, color: "#ec4899" }}>샥</strong>
        <span style={{ fontSize: 13, color: "#666" }}>
          {loading ? "불러오는 중…" : `${shops.length.toLocaleString()}곳`}
        </span>
        <button
          onClick={() => setFilterOpen(true)}
          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 18, border: "1.5px solid #eee", background: "#fff", fontSize: 13, fontWeight: 600, color: activeFilterCount ? "#ec4899" : "#555" }}
        >
          필터{activeFilterCount ? ` ${activeFilterCount}` : ""}
        </button>
      </header>

      {/* 지도 */}
      <div style={{ position: "absolute", inset: 0 }}>
        {error ? (
          <div style={{ padding: 24, color: "#c00" }}>데이터 로드 실패: {error}</div>
        ) : (
          <MapView shops={shops} highlightedId={highlightId} onPinClick={onPinClick} />
        )}
      </div>

      {/* 바텀시트: peek=컬렉션 / full=리스트 */}
      <BottomSheet snap={snap} onSnapChange={setSnap}>
        {snap === "peek" ? (
          <CollectionRail collections={collections} onShopClick={openDetail} />
        ) : (
          <ShopListSheet shops={shops} onShopClick={openDetail} />
        )}
      </BottomSheet>

      {/* 취소석 플로팅 버튼 */}
      <button
        onClick={() => setLeadOpen(true)}
        style={{ position: "absolute", right: 16, bottom: 240, zIndex: 16, padding: "10px 14px", borderRadius: 24, border: "none", background: "#ec4899", color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 16px rgba(236,72,153,.4)" }}
      >
        🔔 빈자리 알림
      </button>

      {/* 오버레이들 */}
      {selectedId && (
        <ShopDetailSheet
          shopId={selectedId}
          onClose={() => setSelectedId(null)}
          onReserveClick={(shopId, route) =>
            usecases.analytics.track({ event: "reserve_click", shopId, route: route.type })
          }
        />
      )}
      {filterOpen && (
        <FilterModal
          initial={filter}
          onApply={(c) => {
            setFilter(c);
            usecases.analytics.track({ event: "filter_apply" });
          }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {leadOpen && <MissedAlertSheet onClose={() => setLeadOpen(false)} />}
    </div>
  );
}
