import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SheetRef } from "react-modal-sheet";
import { useCatalog } from "../contexts/catalog/ui/hooks/useCatalog";
import { MapView } from "../contexts/catalog/ui/MapView";
import { CollectionChips, type ChipKey } from "../contexts/catalog/ui/CollectionChips";
import { ShopListSheet } from "../contexts/catalog/ui/ShopListSheet";
import { ShopDetailSheet } from "../contexts/catalog/ui/ShopDetailSheet";
import { FilterModal } from "../contexts/catalog/ui/FilterModal";
import { RegionPicker } from "../contexts/catalog/ui/RegionPicker";
import { ActiveFilters } from "../contexts/catalog/ui/ActiveFilters";
import { CustomFindModal, type CustomFind } from "../contexts/catalog/ui/CustomFindModal";
import { MissedAlertSheet } from "../contexts/lead/ui/MissedAlertSheet";
import { SnapSheet } from "../shared/ui/SnapSheet";
import { ShopListSkeleton } from "../shared/ui/Skeleton";
import { usecases } from "./composition-root";
import { getUserPosition } from "../shared/platform/geolocation";
import { distanceMeters, type Coordinate } from "../shared/domain/coordinate";
import type { ShopSummary, ShopPin } from "../contexts/catalog/domain/shop";

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
  const { shops, pins, loading, error, filter, setFilter, loadBounds, showShops, searchByName } = useCatalog();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [nameResults, setNameResults] = useState<ShopSummary[]>([]);
  const sheetRef = useRef<SheetRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | undefined>();
  const [mapCenter, setMapCenter] = useState<Coordinate | undefined>();
  const [myPos, setMyPos] = useState<Coordinate | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [customFind, setCustomFind] = useState<CustomFind | null>(null);
  const [openShopIds, setOpenShopIds] = useState<Set<string> | null>(null); // 맞춤찾기 시간에 빈 샵
  const [chip, setChip] = useState<ChipKey | null>(null);
  const [query, setQuery] = useState("");
  const headerRef = useRef<HTMLElement>(null);
  const [headerH, setHeaderH] = useState(132); // 헤더 실측 높이 (시트 full 시 첫 카드 가림 방지)
  const [atFull, setAtFull] = useState(false); // 시트가 최상단까지 펼쳐졌나

  // 헤더 높이 실측 (ActiveFilters 유무로 높이 변함 → ResizeObserver)
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 맞춤찾기(시간) → 그 시간 빈 샵 id 조회
  useEffect(() => {
    if (!customFind) {
      setOpenShopIds(null);
      return;
    }
    let alive = true;
    usecases.reservation.findOpenShops(customFind.date, customFind.hour).then((ids) => {
      if (alive) setOpenShopIds(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, [customFind]);

  // 세션 진입 이벤트 (몇 명·어떤 키워드로 들어왔는지)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const src = p.get("utm_source") || p.get("src");
    const ref = document.referrer ? new URL(document.referrer).hostname : "";
    usecases.analytics.track({
      event: "session_start",
      entry: src ? "campaign" : ref ? "deeplink" : "organic",
      source: src || ref || "direct",
    });
    // 잔류시간: 이탈(탭 숨김) 시 session_end with 경과 ms
    const start = Date.now();
    let ended = false;
    const onHide = () => {
      if (document.visibilityState === "hidden" && !ended) {
        ended = true;
        usecases.analytics.track({ event: "session_end", ms: Date.now() - start });
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // 첫 진입: 내 위치로 지도 이동 (그 영역 샵은 지도 idle 시 자동 로드)
  useEffect(() => {
    // 1) 마지막 위치 즉시 복원 → 재방문 일관성 + 서울시청 깜빡임 방지
    try {
      const saved = localStorage.getItem("syak_last_pos");
      if (saved) {
        const p = JSON.parse(saved) as Coordinate;
        setMyPos(p);
        setMapCenter(p);
      }
    } catch {
      /* ignore */
    }
    // 2) 실제 위치로 갱신 + 저장
    getUserPosition().then((pos) => {
      if (pos) {
        setMyPos(pos);
        setMapCenter(pos);
        try {
          localStorage.setItem("syak_last_pos", JSON.stringify(pos));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  const q = query.trim();

  // 이름 검색 (서버측, 디바운스). 비우면 다시 지도 영역 모드로.
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => {
    if (!q) {
      setNameResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchByName(q).then((r) => {
        if (qRef.current === q) setNameResults(r);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [q, searchByName]);

  // 지도 영역(bounds) 변하면 그 영역 샵 로드 — 검색/파트너모드일 땐 스킵
  // 디바운스 350ms: 빠른 pan/zoom에 매번 로드하지 않고 멈춘 뒤 1회만
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastBounds = useRef<Parameters<typeof loadBounds>[0] | null>(null);
  const sortByRef = useRef(filter.sortBy);
  sortByRef.current = filter.sortBy;
  const onBoundsChanged = useCallback(
    (b: Parameters<typeof loadBounds>[0]) => {
      lastBounds.current = b;
      if (qRef.current || sortByRef.current === "partner") return;
      if (boundsTimer.current) clearTimeout(boundsTimer.current);
      boundsTimer.current = setTimeout(() => loadBounds(b), 350);
    },
    [loadBounds],
  );

  // "샥 파트너" 정렬 → 전국 파트너 직접 로드(지역 무관). 해제 시 뷰포트 복귀.
  const prevSortBy = useRef(filter.sortBy);
  useEffect(() => {
    if (filter.sortBy === "partner") {
      usecases.catalog.partners().then((ps) => showShops(ps));
    } else if (prevSortBy.current === "partner" && lastBounds.current) {
      loadBounds(lastBounds.current);
    }
    prevSortBy.current = filter.sortBy;
  }, [filter.sortBy, showShops, loadBounds]);

  const displayed = useMemo(() => {
    const base = q ? nameResults : shops;
    let list = applyChip(base, chip);
    if (openShopIds) list = list.filter((s) => openShopIds.has(s.id)); // 맞춤찾기: 그 시간 빈 샵만
    const sortBy = filter.sortBy ?? "recommend";
    if (sortBy === "priceLow") {
      list = [...list].sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
    } else if (sortBy === "priceHigh") {
      list = [...list].sort((a, b) => (b.minPrice ?? -1) - (a.minPrice ?? -1));
    } else if (myPos && chip !== "reviews") {
      // 추천순·거리순 — 위치 있으면 가까운 순
      list = [...list].sort((a, b) => distanceMeters(myPos, a.coord) - distanceMeters(myPos, b.coord));
    }
    // 파트너(파일럿)는 현재 보이는 목록(=그 지역) 맨 위로 — 정렬 무관하게 상단 고정
    if (list.some((s) => s.isPartner)) {
      list = [...list].sort((a, b) => (b.isPartner ? 1 : 0) - (a.isPartner ? 1 : 0));
    }
    return list;
  }, [q, nameResults, shops, chip, openShopIds, myPos, filter.sortBy]);

  async function selectRegions(gus: string[]) {
    setFilter({ ...filter, gus: gus.length ? gus : undefined });
    if (gus.length) {
      const list = await usecases.catalog.byGus(gus);
      const pts = list.filter((s) => s.coord?.lat && s.coord?.lng);
      if (pts.length) {
        const lat = pts.reduce((a, s) => a + s.coord.lat, 0) / pts.length;
        const lng = pts.reduce((a, s) => a + s.coord.lng, 0) / pts.length;
        setMapCenter({ lat, lng });
        showShops(list); // 즉시 표시(지도 idle이 영역으로 다듬음)
      }
    }
  }

  function openDetail(shop: ShopPin) {
    setHighlightId(shop.id);
    if (shop.coord?.lat && shop.coord?.lng) setMapCenter({ ...shop.coord });
    setSelectedId(shop.id);
    usecases.analytics.track({ event: "detail_view", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
  }
  function onPinClick(shop: ShopPin) {
    usecases.analytics.track({ event: "pin_click", shopId: shop.id, shopCategory: shop.category, shopDistrict: shop.gu });
    openDetail(shop);
  }

  const activeFilterCount =
    (filter.categories?.length ?? 0) +
    (filter.priceTiers?.length ?? 0) +
    (filter.services?.length ?? 0) +
    (filter.hasEventOnly ? 1 : 0) +
    (filter.firstVisitOnly ? 1 : 0) +
    (filter.reservableOnly ? 1 : 0);

  // 지도: 필터/검색/맞춤 없으면 경량 핀 대량 표시(밀집도), 있으면 필터된 요약 표시
  const filtering = !!q || !!chip || !!openShopIds || activeFilterCount > 0 || filter.sortBy === "partner";
  const mapShops: ShopPin[] = filtering ? displayed : pins;

  const regionLabel = filter.gus?.length
    ? filter.gus.length === 1
      ? filter.gus[0].replace(/구$/, "")
      : `${filter.gus[0].replace(/구$/, "")} 외 ${filter.gus.length - 1}`
    : "지역";

  return (
    <div ref={setRoot} style={{ position: "fixed", inset: 0, fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif", background: "#fff" }}>
      {/* 헤더 */}
      <header ref={headerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 25, padding: "14px 16px 10px", background: "#fff" }}>
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
        <ActiveFilters filter={filter} onChange={setFilter} />
      </header>

      {/* 지도 */}
      <div style={{ position: "absolute", inset: 0 }}>
        {error ? (
          <div style={{ padding: 24, paddingTop: 140, color: "#c00" }}>데이터 로드 실패: {error}</div>
        ) : (
          <MapView shops={mapShops} highlightedId={highlightId} center={mapCenter} myPos={myPos} onPinClick={onPinClick} onBoundsChanged={onBoundsChanged} />
        )}
      </div>

      {/* 취소석 알림 (지도 우하단) */}
      <button
        onClick={() => setLeadOpen(true)}
        style={{ position: "absolute", right: 16, bottom: "calc(30vh + 14px)", zIndex: 18, padding: "11px 16px", borderRadius: 24, border: "none", background: "#ec4899", color: "#fff", fontWeight: 700, fontSize: 14, boxShadow: "0 4px 16px rgba(236,72,153,.35)" }}
      >
        취소석 알림
      </button>

      {/* 바텀시트 */}
      {root && (
        <SnapSheet ref={sheetRef} mountPoint={root} onSnap={(i) => setAtFull(i >= 3)}>
          <div style={{ paddingTop: atFull ? headerH : 0, transition: "padding-top .18s ease" }}>
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
          </div>
        </SnapSheet>
      )}

      {/* 오버레이 */}
      {selectedId && (
        <ShopDetailSheet
          shopId={selectedId}
          onClose={() => setSelectedId(null)}
          onReserveClick={(shopId, route, meta) => usecases.analytics.track({ event: "reserve_click", shopId, route: route.type, slotDate: meta?.slot?.date, slotTime: meta?.slot?.time, shopDistrict: meta?.district, shopCategory: meta?.category })}
        />
      )}
      {filterOpen && (
        <FilterModal
          initial={filter}
          onApply={(c) => { setFilter(c); usecases.analytics.track({ event: "filter_apply" }); }}
          onClose={() => setFilterOpen(false)}
        />
      )}
      {regionOpen && <RegionPicker selected={filter.gus ?? []} onApply={selectRegions} onClose={() => setRegionOpen(false)} />}
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
