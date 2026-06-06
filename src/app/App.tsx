import { useRef, useState } from "react";
import type { SheetRef } from "react-modal-sheet";
import { useCatalog } from "../contexts/catalog/ui/hooks/useCatalog";
import { MapView } from "../contexts/catalog/ui/MapView";
import { CollectionChips, type ChipKey } from "../contexts/catalog/ui/CollectionChips";
import { ShopListSheet } from "../contexts/catalog/ui/ShopListSheet";
import { ShopDetailSheet } from "../contexts/catalog/ui/ShopDetailSheet";
import { FilterModal } from "../contexts/catalog/ui/FilterModal";
import { RegionPicker } from "../contexts/catalog/ui/RegionPicker";
import { CustomFindModal, type CustomFind } from "../contexts/catalog/ui/CustomFindModal";
import { MissedAlertSheet } from "../contexts/lead/ui/MissedAlertSheet";
import { SnapSheet } from "../shared/ui/SnapSheet";
import { ShopListSkeleton } from "../shared/ui/Skeleton";
import { usecases } from "./composition-root";
import type { ShopSummary } from "../contexts/catalog/domain/shop";
import type { Coordinate } from "../shared/domain/coordinate";

function applyChip(list: ShopSummary[], chip: ChipKey | null): ShopSummary[] {
  if (!chip) return list;
  if (chip === "reviews") return [...list].sort((a, b) => b.reviewCount - a.reviewCount);
  return list.filter((s) =>
    chip === "event" ? s.hasEvent
      : chip === "price1" ? s.priceTier === "1만원대"
      : chip === "price2" ? s.priceTier === "2만원대"
      : chip === "firstVisit" ? s.firstVisitDeal
      : true,
  );
}

export default function App() {
  const { shops, allShops, loading, error, filter, setFilter } = useCatalog();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const sheetRef = useRef<SheetRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const [mapCenter, setMapCenter] = useState<Coordinate | undefined>();
  const [filterOpen, setFilterOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [customFind, setCustomFind] = useState<CustomFind | null>(null);
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [query, setQuery] = useState("");

  const q = query.trim();
  const base = q ? allShops.filter((s) => s.name.includes(q)) : shops;
  let displayed = applyChip(base, chip);
  if (customFind) displayed = displayed.filter((s) => s.reservable); // 슬롯 데이터는 추후(AWS) — 지금은 예약가능으로 대체

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

  function openDetail(shop: ShopSummary) {
    setHighlightId(shop.id);
    if (shop.coord?.lat && shop.coord?.lng) setMapCenter({ ...shop.coord });
    setSelectedId(shop.id);
    usecases.analytics.track({ event: "detail_view", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
  }
  function onPinClick(shop: ShopSummary) {
    usecases.analytics.track({ event: "pin_click", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
    openDetail(shop);
  }

  const activeFilterCount =
    (filter.categories?.length ?? 0) +
    (filter.priceTiers?.length ?? 0) +
    (filter.hasEventOnly ? 1 : 0) +
    (filter.firstVisitOnly ? 1 : 0) +
    (filter.reservableOnly ? 1 : 0);

  const regionLabel = filter.gu ? filter.gu.replace(/구$/, "") : "지역";

  return (
    <div ref={setRoot} style={{ position: "fixed", inset: 0, fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif", background: "#fff" }}>
      {/* 헤더 */}
      <header style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 25, padding: "14px 16px 10px", background: "#fff" }}>
        <div style={{ position: "relative" }}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) sheetRef.current?.snapTo(0);
            }}
            placeholder="샵 이름으로 찾기"
            style={{ width: "100%", padding: "14px 36px 14px 16px", borderRadius: 16, border: "none", background: "#f2f2f4", fontSize: 16, boxSizing: "border-box", fontWeight: 500 }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#aaa", fontSize: 18 }}>×</button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11 }}>
          {/* 지역 */}
          <button onClick={() => setRegionOpen(true)} style={pill("dark")}>
            {regionLabel} ▾
          </button>
          {/* 필터 */}
          <button onClick={() => setFilterOpen(true)} style={pill("outline")}>
            필터
            {activeFilterCount > 0 && (
              <span style={{ marginLeft: 6, background: "#ec4899", color: "#fff", borderRadius: 10, fontSize: 11, fontWeight: 700, padding: "1px 6px" }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* 맞춤 샵 찾기 */}
          <div style={{ marginLeft: "auto" }}>
            {customFind ? (
              <button onClick={() => setCustomFind(null)} style={pill("active")}>
                {customFind.chipLabel} ✕
              </button>
            ) : (
              <button onClick={() => setFindOpen(true)} style={pill("dark")}>
                맞춤 샵 찾기
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 지도 */}
      <div style={{ position: "absolute", inset: 0 }}>
        {error ? (
          <div style={{ padding: 24, paddingTop: 140, color: "#c00" }}>데이터 로드 실패: {error}</div>
        ) : (
          <MapView shops={displayed} highlightedId={highlightId} center={mapCenter} onPinClick={onPinClick} />
        )}
      </div>

      {/* 취소석 알림 (지도 우하단) */}
      <button
        onClick={() => setLeadOpen(true)}
        style={{ position: "absolute", right: 16, top: "42%", zIndex: 18, padding: "11px 16px", borderRadius: 24, border: "none", background: "#ec4899", color: "#fff", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 16px rgba(236,72,153,.35)" }}
      >
        취소석 알림
      </button>

      {/* 바텀시트 */}
      {root && (
        <SnapSheet ref={sheetRef} mountPoint={root}>
          {loading ? (
            <ShopListSkeleton />
          ) : (
            <>
              {customFind ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px 10px", fontSize: 14, fontWeight: 600, color: "#333" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: "#22c55e" }} />
                  {customFind.bannerLabel}
                </div>
              ) : (
                <CollectionChips active={chip} onSelect={setChip} />
              )}
              <div style={{ borderTop: "1px solid #f2f2f4" }} />
              <ShopListSheet shops={displayed} onShopClick={openDetail} />
            </>
          )}
        </SnapSheet>
      )}

      {/* 오버레이 */}
      {selectedId && (
        <ShopDetailSheet
          shopId={selectedId}
          onClose={() => setSelectedId(null)}
          onReserveClick={(shopId, route) => usecases.analytics.track({ event: "reserve_click", shopId, route: route.type })}
        />
      )}
      {filterOpen && (
        <FilterModal
          initial={filter}
          onApply={(c) => { setFilter(c); usecases.analytics.track({ event: "filter_apply" }); }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {regionOpen && <RegionPicker current={filter.gu} onSelect={selectRegion} onClose={() => setRegionOpen(false)} />}
      {findOpen && <CustomFindModal onApply={setCustomFind} onClose={() => setFindOpen(false)} />}
      {leadOpen && <MissedAlertSheet onClose={() => setLeadOpen(false)} />}
    </div>
  );
}

function pill(kind: "dark" | "outline" | "active"): React.CSSProperties {
  const base: React.CSSProperties = { padding: "9px 15px", borderRadius: 20, fontSize: 14, fontWeight: 700, border: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center" };
  if (kind === "dark") return { ...base, background: "#ec4899", color: "#fff" };
  if (kind === "active") return { ...base, background: "#be185d", color: "#fff" };
  return { ...base, background: "#fff", color: "#333", border: "1.5px solid #e5e5e5" };
}
