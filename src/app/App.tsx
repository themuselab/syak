import { useState } from "react";
import { useCatalog } from "../contexts/catalog/ui/hooks/useCatalog";
import { MapView } from "../contexts/catalog/ui/MapView";
import { CollectionRail } from "../contexts/catalog/ui/CollectionRail";
import { ShopListSheet } from "../contexts/catalog/ui/ShopListSheet";
import { ShopDetailSheet } from "../contexts/catalog/ui/ShopDetailSheet";
import { FilterModal } from "../contexts/catalog/ui/FilterModal";
import { RegionPicker } from "../contexts/catalog/ui/RegionPicker";
import { MissedAlertSheet } from "../contexts/lead/ui/MissedAlertSheet";
import { BottomSheet } from "../shared/ui/BottomSheet";
import { usecases } from "./composition-root";
import { getUserPosition } from "../shared/platform/geolocation";
import type { ShopSummary } from "../contexts/catalog/domain/shop";
import type { Coordinate } from "../shared/domain/coordinate";

export default function App() {
  const { shops, allShops, collections, loading, error, filter, setFilter } = useCatalog();
  const [snap, setSnap] = useState<"peek" | "full">("peek");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const [mapCenter, setMapCenter] = useState<Coordinate | undefined>();
  const [myPos, setMyPos] = useState<Coordinate | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim();
  const displayed = q ? allShops.filter((s) => s.name.includes(q)) : shops;

  function selectRegion(gu?: string) {
    setFilter({ ...filter, gu });
    if (gu) {
      const inGu = allShops.filter((s) => s.gu === gu && s.coord?.lat && s.coord?.lng);
      if (inGu.length) {
        const lat = inGu.reduce((a, s) => a + s.coord.lat, 0) / inGu.length;
        const lng = inGu.reduce((a, s) => a + s.coord.lng, 0) / inGu.length;
        setMapCenter({ lat, lng });
      }
    }
  }

  function focus(shop: ShopSummary) {
    setHighlightId(shop.id);
    if (shop.coord?.lat && shop.coord?.lng) setMapCenter({ ...shop.coord });
  }
  function openDetail(shop: ShopSummary) {
    focus(shop);
    setSelectedId(shop.id);
    usecases.analytics.track({ event: "detail_view", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
  }
  function onPinClick(shop: ShopSummary) {
    usecases.analytics.track({ event: "pin_click", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
    openDetail(shop);
  }
  async function handleLocate() {
    const pos = await getUserPosition();
    if (pos) {
      setMyPos(pos);
      setMapCenter({ ...pos });
    }
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
      <header style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 15, padding: "12px 12px 8px", background: "linear-gradient(#fff, #ffffffee 80%, transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="syak" style={{ height: 22, display: "block" }} />
          <span style={{ fontSize: 13, color: "#666" }}>
            {loading ? "불러오는 중…" : `${displayed.length.toLocaleString()}곳`}
          </span>
          <button
            onClick={() => setFilterOpen(true)}
            style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 18, border: "1.5px solid #eee", background: "#fff", fontSize: 13, fontWeight: 600, color: activeFilterCount ? "#ec4899" : "#555" }}
          >
            필터{activeFilterCount ? ` ${activeFilterCount}` : ""}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => setRegionOpen(true)}
            style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 18, border: "1.5px solid #eee", background: "#fff", fontSize: 13, fontWeight: 700, color: filter.gu ? "#ec4899" : "#333" }}
          >
            📍 {filter.gu ?? "전체"} ▾
          </button>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.trim() && snap === "peek") setSnap("full");
              }}
              placeholder="🔍 샵 이름 검색"
              style={{ width: "100%", padding: "9px 30px 9px 12px", borderRadius: 18, border: "1.5px solid #eee", background: "#fff", fontSize: 13, boxSizing: "border-box" }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#bbb", fontSize: 16 }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 지도 */}
      <div style={{ position: "absolute", inset: 0 }}>
        {error ? (
          <div style={{ padding: 24, color: "#c00" }}>데이터 로드 실패: {error}</div>
        ) : (
          <MapView shops={displayed} highlightedId={highlightId} center={mapCenter} myPos={myPos} onPinClick={onPinClick} />
        )}
      </div>

      {/* 바텀시트: peek=컬렉션 / full=리스트 */}
      <BottomSheet snap={snap} onSnapChange={setSnap}>
        {q || snap === "full" ? (
          <ShopListSheet shops={displayed} onShopClick={openDetail} />
        ) : (
          <CollectionRail collections={collections} onShopClick={openDetail} />
        )}
      </BottomSheet>

      {/* 내 위치 버튼 */}
      <button
        onClick={handleLocate}
        aria-label="내 위치"
        style={{ position: "absolute", right: 16, bottom: 296, zIndex: 16, width: 44, height: 44, borderRadius: 22, border: "1px solid #eee", background: "#fff", boxShadow: "0 3px 12px rgba(0,0,0,.15)", fontSize: 18 }}
      >
        📍
      </button>

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
      {regionOpen && (
        <RegionPicker current={filter.gu} onSelect={selectRegion} onClose={() => setRegionOpen(false)} />
      )}
      {leadOpen && <MissedAlertSheet onClose={() => setLeadOpen(false)} />}
    </div>
  );
}
