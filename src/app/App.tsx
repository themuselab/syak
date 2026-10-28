import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SheetRef } from "react-modal-sheet";
import { useCatalog } from "../contexts/catalog/ui/hooks/useCatalog";
import { MapView as MapViewKakao } from "../contexts/catalog/ui/MapView";
import { MapViewNaver } from "../contexts/catalog/ui/MapViewNaver";
// 지도 제공자 전환: 기본 네이버, VITE_MAP_PROVIDER=kakao 로 카카오 폴백.
const MapView = import.meta.env.VITE_MAP_PROVIDER === "kakao" ? MapViewKakao : MapViewNaver;
import { CollectionChips, type ChipKey } from "../contexts/catalog/ui/CollectionChips";
import { ShopListSheet } from "../contexts/catalog/ui/ShopListSheet";
import { ActiveFilters } from "../contexts/catalog/ui/ActiveFilters";
import type { CustomFind } from "../contexts/catalog/ui/CustomFindModal";
import { SnapSheet } from "../shared/ui/SnapSheet";
import { ShopListSkeleton } from "../shared/ui/Skeleton";
import { usecases } from "./composition-root";
import { getUserPosition } from "../shared/platform/geolocation";
import { resolveAttribution } from "../shared/platform/attribution";
import { isReturningVisitor } from "../shared/platform/visitor";
import { distanceMeters, type Coordinate } from "../shared/domain/coordinate";
import type { ShopSummary, ShopPin } from "../contexts/catalog/domain/shop";
import type { FilterCriteria } from "../contexts/catalog/domain/filters";
import { CATEGORIES } from "../shared/domain/category";
import { appLink } from "../shared/platform/app-link";
import { color, shadow, radius, mapChip, FONT_FAMILY } from "../shared/ui/tokens";

// 오버레이(상세·필터·지역·맞춤찾기)는 첫 화면에 안 보임 → 별도 청크로 분리해 초기 JS 축소.
// 첫 탭 지연이 없도록 마운트 후 idle 때 미리 받아둔다(preloadOverlays).
const loadShopDetail = () => import("../contexts/catalog/ui/ShopDetailSheet");
const loadFilter = () => import("../contexts/catalog/ui/FilterModal");
const loadRegion = () => import("../contexts/catalog/ui/RegionPicker");
const loadCustomFind = () => import("../contexts/catalog/ui/CustomFindModal");
const ShopDetailSheet = lazy(() => loadShopDetail().then((m) => ({ default: m.ShopDetailSheet })));
const FilterModal = lazy(() => loadFilter().then((m) => ({ default: m.FilterModal })));
const RegionPicker = lazy(() => loadRegion().then((m) => ({ default: m.RegionPicker })));
const CustomFindModal = lazy(() => loadCustomFind().then((m) => ({ default: m.CustomFindModal })));
function preloadOverlays() {
  void Promise.all([loadShopDetail(), loadFilter(), loadRegion(), loadCustomFind()]).catch(() => {
    /* 무시 — 열 때 lazy가 다시 요청 */
  });
}

function applyChip(list: ShopSummary[], chip: ChipKey | null): ShopSummary[] {
  if (!chip) return list;
  if (chip === "reviews") return [...list].sort((a, b) => b.reviewCount - a.reviewCount);
  return list.filter((s) =>
    chip === "today" ? s.todayOpen
      : chip === "event" ? s.hasEvent
      : chip === "price1" ? s.priceTier === "1만원대"
      : chip === "price2" ? s.priceTier === "2만원대"
      : chip === "firstVisit" ? s.firstVisitDeal
      : true,
  );
}

// filter_apply 추적용 — 어떤 필터를 켰는지 요약 문자열
function filterSummary(c: FilterCriteria): string {
  const parts: string[] = [];
  if (c.categories?.length) parts.push(...c.categories);
  if (c.priceTiers?.length) parts.push(...c.priceTiers);
  if (c.services?.length) parts.push(...c.services);
  if (c.hasEventOnly) parts.push("이벤트");
  if (c.firstVisitOnly) parts.push("첫방문");
  if (c.reservableOnly) parts.push("예약가능");
  if (c.sortBy && c.sortBy !== "recommend") parts.push(`정렬:${c.sortBy}`);
  return parts.join(",") || "none";
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

  // 오버레이 청크 선로딩 — 첫 렌더·지도 로드와 경쟁하지 않게 브라우저 idle 때
  useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(preloadOverlays, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(preloadOverlays, 1500); // Safari: rIC 없음
    return () => clearTimeout(t);
  }, []);

  // 맞춤찾기(시간) → 그 시간 빈 샵 id 조회
  useEffect(() => {
    if (!customFind) {
      setOpenShopIds(null);
      return;
    }
    let alive = true;
    // 선택한 여러 시간 중 하나라도 비는 샵 = 합집합
    Promise.all(customFind.hours.map((h) => usecases.reservation.findOpenShops(customFind.date, h))).then((lists) => {
      if (alive) setOpenShopIds(new Set(lists.flat()));
    });
    return () => {
      alive = false;
    };
  }, [customFind]);

  // 세션 진입 이벤트 (몇 명·어떤 키워드로 들어왔는지)
  useEffect(() => {
    const attr = resolveAttribution();
    usecases.analytics.track({
      event: "session_start",
      entry: attr.entry,
      source: attr.source,
      route: isReturningVisitor ? "returning" : "new", // 신규/재방문(리텐션)
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
    // SEO 진입(?gu=)은 그 지역이 지도 중심을 가져야 함 → 위치로 센터 덮지 않음(myPos만 갱신)
    const hasGu = !!new URLSearchParams(window.location.search).get("gu");
    // 1) 마지막 위치 즉시 복원 → 재방문 일관성 + 서울시청 깜빡임 방지
    try {
      const saved = localStorage.getItem("syak_last_pos");
      if (saved) {
        const p = JSON.parse(saved) as Coordinate;
        setMyPos(p);
        if (!hasGu) setMapCenter(p);
      }
    } catch {
      /* ignore */
    }
    // 2) 실제 위치로 갱신 + 저장
    getUserPosition().then((pos) => {
      if (pos) {
        setMyPos(pos);
        if (!hasGu) setMapCenter(pos);
        try {
          localStorage.setItem("syak_last_pos", JSON.stringify(pos));
        } catch {
          /* ignore */
        }
      }
    });
  }, []);

  // SEO 랜딩(/{cat}/{지역})에서 ?gu=&cat= 달고 들어오면 지역+카테고리로 바로 진입
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const gu = p.get("gu");
    const cat = p.get("cat"); // 한글 카테고리(네일/헤어/왁싱/속눈썹)
    // 쿼리스트링은 임의 문자열 → 알려진 카테고리일 때만 Category로 좁혀서 적용
    const category = CATEGORIES.find((c) => c === cat);
    if (gu || cat) {
      setFilter({
        ...filter,
        ...(gu ? { gus: [gu] } : {}),
        ...(category ? { categories: [category] } : {}),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const gusRef = useRef(filter.gus);
  gusRef.current = filter.gus;
  // 지역(gus)·검색·파트너 모드면 뷰포트 재로드 금지(그 결과를 권위있게 유지).
  // 예약된 로드도 발동 시점에 다시 확인 → 지역 선택이 뒤늦게 들어와도 덮어쓰기 방지.
  const skipBounds = () => !!qRef.current || sortByRef.current === "partner" || !!gusRef.current?.length;
  const onBoundsChanged = useCallback(
    (b: Parameters<typeof loadBounds>[0]) => {
      lastBounds.current = b;
      if (skipBounds()) return;
      if (boundsTimer.current) clearTimeout(boundsTimer.current);
      boundsTimer.current = setTimeout(() => {
        if (skipBounds()) return;
        loadBounds(b);
      }, 350);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      usecases.analytics.track({ event: "region_select", source: gus.join(",") });
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

  // 결과 없을 때 전체 초기화 (필터·정렬·칩·맞춤찾기·검색어)
  function resetAll() {
    setFilter({});
    setChip(null);
    setCustomFind(null);
    setQuery("");
    if (lastBounds.current) loadBounds(lastBounds.current);
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

  // 정렬 선택 시 필터 버튼에 그 라벨 노출(기본순은 "필터" 유지)
  const sortLabel =
    filter.sortBy === "priceLow" ? "가격 낮은순"
      : filter.sortBy === "priceHigh" ? "가격 높은순"
      : filter.sortBy === "partner" ? "샥 파트너"
      : null;

  // 지도: 필터/검색/맞춤 없으면 경량 핀 대량 표시(밀집도), 있으면 필터된 요약 표시
  const filtering = !!q || !!chip || !!openShopIds || activeFilterCount > 0 || filter.sortBy === "partner";
  const mapShops: ShopPin[] = filtering ? displayed : pins;

  const regionLabel = filter.gus?.length
    ? filter.gus.length === 1
      ? filter.gus[0].replace(/구$/, "")
      : `${filter.gus[0].replace(/구$/, "")} 외 ${filter.gus.length - 1}`
    : "지역";

  const regionOn = !!filter.gus?.length;
  const filterOn = !!sortLabel || activeFilterCount > 0;

  return (
    <div ref={setRoot} style={{ position: "fixed", inset: 0, fontFamily: FONT_FAMILY, background: color.surface.map, color: color.text.strong }}>
      {/* 헤더 — 앱 홈처럼 지도 위에 떠 있는 검색바 + 칩(배경 없음, 빈 곳은 지도 조작이 통과) */}
      <header ref={headerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 25, padding: "12px 16px 6px", pointerEvents: "none" }}>
        {/* 검색바 — 앱 SearchBar: 높이 44 pill, 흰 배경, primary-300 테두리, 그림자 sm, 왼쪽 심볼 */}
        <div
          style={{ pointerEvents: "auto", display: "flex", alignItems: "center", height: 44, boxSizing: "border-box", borderRadius: radius.full, border: `1px solid ${color.primary[300]}`, background: color.white, boxShadow: shadow.sm, paddingLeft: 4, paddingRight: 8 }}
        >
          <img src={`${import.meta.env.BASE_URL}brand/syak-symbol-pink.png`} alt="" width={40} height={40} style={{ flexShrink: 0, marginRight: 2 }} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim()) sheetRef.current?.snapTo(0);
            }}
            placeholder="샵 이름으로 찾기"
            style={{ flex: 1, minWidth: 0, height: "100%", padding: 0, border: "none", outline: "none", background: "transparent", fontSize: 16, color: color.gray[900] }}
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label="검색어 지우기" style={{ border: "none", background: "transparent", padding: 6, display: "flex", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.text.placeholder} strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>

        {/* 칩 줄 — 앱 CategoryChip(흰 pill + 그림자), 선택 시 앱 FilterChip 선택 상태 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
          {/* 지역 */}
          <button onClick={() => setRegionOpen(true)} style={{ ...mapChip(regionOn), pointerEvents: "auto" }}>
            {regionLabel}
            <Chevron color={regionOn ? color.primary[500] : color.gray[800]} />
          </button>
          {/* 필터 (정렬 선택 시 그 라벨 표시 — 기본순은 "필터" 유지) */}
          <button onClick={() => setFilterOpen(true)} style={{ ...mapChip(filterOn), pointerEvents: "auto" }}>
            {sortLabel ?? "필터"}
            {activeFilterCount > 0 && (
              <span style={{ marginLeft: 2, minWidth: 18, height: 18, boxSizing: "border-box", background: color.primary[500], color: color.white, borderRadius: radius.full, fontSize: 11, lineHeight: "18px", fontWeight: 600, padding: "0 5px", textAlign: "center" }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          {/* 맞춤 샵 찾기 — 앱 브랜드 칩(연분홍 + primary-300 테두리), 적용 중이면 brand.deep 채움 */}
          <div style={{ marginLeft: "auto" }}>
            {customFind ? (
              <button onClick={() => setCustomFind(null)} style={{ ...mapChip(), background: color.brand.deep, color: color.white, pointerEvents: "auto" }}>
                {customFind.chipLabel} ✕
              </button>
            ) : (
              <button onClick={() => setFindOpen(true)} style={{ ...mapChip(), background: color.brand.tint, border: `1px solid ${color.primary[300]}`, color: color.primary[500], pointerEvents: "auto" }}>
                빈자리 찾기
              </button>
            )}
          </div>
        </div>
        <div style={{ pointerEvents: "auto" }}>
          <ActiveFilters filter={filter} onChange={setFilter} />
        </div>
      </header>

      {/* 지도 — isolation으로 별도 쌓임 맥락: 네이버 로고·축척(SDK가 큰 z-index를 줌)이 상세·모달 위로 비치지 않게 */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, isolation: "isolate" }}>
        {error ? (
          <div style={{ padding: 24, paddingTop: 140, color: color.status.error, fontSize: 14 }}>데이터 로드 실패: {error}</div>
        ) : (
          <MapView shops={mapShops} highlightedId={highlightId} center={mapCenter} myPos={myPos} showToday={chip === "today"} onPinClick={onPinClick} onBoundsChanged={onBoundsChanged} />
        )}
      </div>

      {/* 앱으로 보기 (지도 우하단) — 설치 링크: iPhone·iPad·PC는 App Store, 안드로이드는 Play(공개 전엔 앱 웹 버전) */}
      <a
        href={appLink.url}
        target={appLink.sameTab ? undefined : "_blank"}
        rel="noopener"
        onClick={() => usecases.analytics.track({ event: "app_open_click", placement: "map_fab", store: appLink.store })}
        style={{ position: "absolute", right: 16, bottom: "calc(30vh + 14px)", zIndex: 18, display: "inline-flex", alignItems: "center", gap: 6, height: 40, boxSizing: "border-box", padding: "0 16px 0 13px", borderRadius: radius.full, background: color.primary[500], color: color.white, fontWeight: 600, fontSize: 14, textDecoration: "none", boxShadow: shadow.md }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
          <path d="M12 18h.01" />
        </svg>
        앱으로 보기
      </a>

      {/* 바텀시트 */}
      {root && (
        <SnapSheet ref={sheetRef} mountPoint={root} onSnap={(i) => setAtFull(i >= 3)}>
          <div style={{ paddingTop: atFull ? headerH : 0, transition: "padding-top .18s ease" }}>
          {/* full로 펼쳐졌을 때 — 시트 상단 그랩바 유지(드래그/탭으로 접기, 헤더에 가려도 보이게 sticky) */}
          {atFull && (
            <div
              onClick={() => sheetRef.current?.snapTo(2)}
              style={{ position: "sticky", top: headerH, zIndex: 6, background: color.white, padding: "8px 0 7px", cursor: "pointer", borderBottom: `1px solid ${color.line.divider}` }}
            >
              <div style={{ width: 40, height: 4, borderRadius: 2, background: color.line.handle, margin: "0 auto" }} />
            </div>
          )}
          {loading ? (
            <ShopListSkeleton />
          ) : (
            <>
              {customFind ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px 10px", fontSize: 14, fontWeight: 600, color: color.text.strong }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: color.status.open }} />
                  {customFind.bannerLabel}
                </div>
              ) : (
                <CollectionChips active={chip} onSelect={(k) => { setChip(k); if (k) usecases.analytics.track({ event: "collection_click", source: k }); }} />
              )}
              <div style={{ borderTop: `1px solid ${color.line.divider}` }} />
              <ShopListSheet shops={displayed} onShopClick={openDetail} onReset={resetAll} />
            </>
          )}
          </div>
        </SnapSheet>
      )}

      {/* 오버레이 (lazy — 청크 도착 전 잠깐은 아무것도 안 그림). 경계를 각자 둬서 하나가 로딩 중이어도 다른 오버레이는 안 가려짐 */}
      {selectedId && (
        <Suspense fallback={null}>
          <ShopDetailSheet
            shopId={selectedId}
            onClose={() => setSelectedId(null)}
            onReserveClick={(shopId, route, meta) => usecases.analytics.track({ event: "reserve_click", shopId, route: route.type, slotDate: meta?.slot?.date, slotTime: meta?.slot?.time, shopDistrict: meta?.district, shopCategory: meta?.category })}
          />
        </Suspense>
      )}
      {filterOpen && (
        <Suspense fallback={null}>
          <FilterModal
            initial={filter}
            onApply={(c) => { setFilter(c); usecases.analytics.track({ event: "filter_apply", source: filterSummary(c) }); }}
            onClose={() => setFilterOpen(false)}
          />
        </Suspense>
      )}
      {regionOpen && <Suspense fallback={null}><RegionPicker selected={filter.gus ?? []} onApply={selectRegions} onClose={() => setRegionOpen(false)} /></Suspense>}
      {findOpen && <Suspense fallback={null}><CustomFindModal onApply={setCustomFind} onClose={() => setFindOpen(false)} /></Suspense>}
    </div>
  );
}

// 앱 FilterChip의 ChevronDown(lucide) — 지역 칩 오른쪽
function Chevron({ color: c }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
