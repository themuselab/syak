import { useEffect, useRef, useState } from "react";
import type { ShopPin } from "../domain/shop";
import type { Bounds } from "../ports/shop-repository";
import { color, shadow, FONT_FAMILY } from "../../../shared/ui/tokens";
import { type Coordinate } from "../../../shared/domain/coordinate";
// 네이버 공식 클러스터링 소스 — ESM으로 정적 import 불가(로드시 naver.maps.Util.ClassExtend 호출).
// 문자열로 받아 SDK 로드 후 <script>로 평가한다. (loadNaverMaps 참고)
// 메인 번들에서 빼려고 동적 import(?raw) — SDK 다운로드와 병렬로 받으니 추가 대기 없음.
const loadClusterSource = () => import("../../../shared/vendor/MarkerClustering.js?raw").then((m) => m.default);

// 네이버 SDK/클러스터링은 런타임 글로벌 — 타입 느슨하게 (카카오판의 KakaoAny와 동일 전략).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NaverAny = any;

const NAVER_MAP_CLIENT_ID =
  (import.meta.env.VITE_NAVER_MAP_CLIENT_ID as string | undefined) ||
  "uiofwf1jlv"; // 공개 클라이언트 ID(하드코딩 안전, 카카오판이 키를 하드코딩하는 것과 동일)

// NCP 웹 지도 인증 파라미터명. 신규 콘솔은 ncpKeyId, 구(클래식) 콘솔은 ncpClientId.
// ⚠️ themuselab.kr 에서 지도 인증 에러가 뜨면 이 값을 "ncpClientId" 로 바꾸세요.
const NAVER_AUTH_PARAM = "ncpKeyId";

// 카카오판(레벨)의 역스케일. 카카오 level 5 ≈ 네이버 zoom 15, level 8 ≈ zoom 12.
const ZOOM_CLOSE = 15; // center 지정 시(가까이)
const ZOOM_CITY = 14; // 기본(서울 시 전체)
const CLUSTER_MAX_ZOOM = 14; // 이 줌 이상이면 클러스터 해제하고 개별 마커 노출

// Assets and dimensions mirror app HomeMap.tsx / HomeMap.web.tsx.
const ASSET = `${import.meta.env.BASE_URL}map/`;
const DOT_ZOOM_THRESHOLD = 13.8;
function markerIcon(naver: NaverAny, kind: string, focused: boolean, dot: boolean): NaverAny {
  const partner = kind === "partner";
  const file = partner ? focused ? "pin-partner-focused" : "pin-partner"
    : focused ? `pin-${kind}` : dot ? `dot-${kind}`
    : kind === "default" ? "marker-shop" : `marker-shop-${kind}`;
  const [w, h] = partner && focused ? [30, 37] : partner || focused ? [27, 34] : dot ? [12, 12] : [20, 20];
  return imgIcon(naver, `${ASSET}${file}.png`, w, h, w === h ? h / 2 : h);
}
function imgIcon(naver: NaverAny, url: string, w: number, h: number, anchorY: number = h): NaverAny {
  return { url, size: new naver.maps.Size(w, h), scaledSize: new naver.maps.Size(w, h), anchor: new naver.maps.Point(w / 2, anchorY) };
}

// ── SDK + 클러스터링 로더 (모듈 레벨 프로미스 캐시 → 다중 마운트 중복 로드 방지) ──
let naverLoadPromise: Promise<void> | null = null;
const authFailureListeners = new Set<(error: Error) => void>();

function loadNaverMaps(clientId: string): Promise<void> {
  if (naverLoadPromise) return naverLoadPromise;
  naverLoadPromise = new Promise<void>((resolve, reject) => {
    const w = window as NaverAny;
    // 클러스터링 소스 청크는 SDK와 동시에 요청 시작(직렬 대기 방지)
    const clusterSource = w.MarkerClustering ? null : loadClusterSource();
    clusterSource?.catch(() => {}); // 실패는 evalCluster에서 reject로 처리 — 미처리 rejection 경고 방지
    // 2) SDK 준비 후 클러스터링 소스를 <script>로 평가 (naver.maps 글로벌이 있어야 함)
    const evalCluster = () => {
      if (!clusterSource) {
        resolve();
        return;
      }
      clusterSource
        .then((src) => {
          if (!w.MarkerClustering) {
            const s = document.createElement("script");
            s.type = "text/javascript";
            s.textContent = src;
            document.head.appendChild(s);
          }
          if (w.MarkerClustering) resolve();
          else reject(new Error("MarkerClustering eval failed"));
        })
        .catch(reject);
    };
    // 이미 로드돼 있으면 바로 진행
    if (w.naver?.maps) {
      evalCluster();
      return;
    }
    // 1) SDK 스크립트 주입
    const previousAuthFailure = w.navermap_authFailure;
    w.navermap_authFailure = () => {
      const error = new Error('Map authentication unavailable');
      authFailureListeners.forEach(listener => listener(error));
      reject(error);
      if (typeof previousAuthFailure === 'function') previousAuthFailure();
    };
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?${NAVER_AUTH_PARAM}=${clientId}`;
    script.async = true;
    const timer = window.setTimeout(() => reject(new Error("naver maps load timeout")), 10000);
    script.onload = () => {
      window.clearTimeout(timer);
      if (w.naver?.maps) evalCluster();
      else reject(new Error("naver.maps missing after load"));
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("naver maps script error"));
    };
    document.head.appendChild(script);
  });
  return naverLoadPromise;
}

function useNaverLoader(clientId: string): { ready: boolean; error: Error | null } {
  const w = window as NaverAny;
  const [ready, setReady] = useState<boolean>(!!w.naver?.maps && !!w.MarkerClustering);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true;
    const authFailed = (error: Error) => { if (alive) { setReady(false); setError(error); } };
    authFailureListeners.add(authFailed);
    loadNaverMaps(clientId)
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e: Error) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
      authFailureListeners.delete(authFailed);
    };
  }, [clientId]);
  return { ready, error };
}

type Props = {
  shops: ShopPin[];
  highlightedId?: string;
  center?: Coordinate;
  myPos?: Coordinate | null;
  showDiscount?: boolean;
  showToday?: boolean;
  onPinClick: (shop: ShopPin) => void;
  onBoundsChanged?: (b: Bounds) => void;
};

export function MapViewNaver({ shops, highlightedId, center, myPos, showToday = false, showDiscount = false, onPinClick, onBoundsChanged }: Props) {
  const { ready, error } = useNaverLoader(NAVER_MAP_CLIENT_ID);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapState, setMapState] = useState<NaverAny>(null);
  const [isDotZoom, setIsDotZoom] = useState(false);
  const mapRef = useRef<NaverAny>(null);
  const clusteringRef = useRef<NaverAny>(null);
  const iconsRef = useRef<Record<string, NaverAny>>({}); // 공유 아이콘 옵션
  const markersById = useRef<Record<string, NaverAny>>({}); // 일반 마커(클러스터 대상, map:null)
  const partnerById = useRef<Record<string, { marker: NaverAny }>>({}); // 파트너(직접 표시)
  const myDotRef = useRef<NaverAny>(null);

  // 최신 콜백을 리스너에서 참조 (재바인딩 없이)
  const onClickRef = useRef(onPinClick);
  onClickRef.current = onPinClick;
  const onBoundsRef = useRef(onBoundsChanged);
  onBoundsRef.current = onBoundsChanged;

  // 지도 + 클러스터러 + 공유 아이콘: 준비되면 1회 생성, 언마운트 시 정리
  useEffect(() => {
    if (!ready) return;
    const naver = (window as NaverAny).naver;
    const MarkerClustering = (window as NaverAny).MarkerClustering;
    const el = containerRef.current;
    if (!naver?.maps || !MarkerClustering || !el || mapRef.current) return;

    // 공유 아이콘 옵션 미리 생성
    const icons = iconsRef.current;
    icons["__mydot__"] = imgIcon(naver, `${ASSET}marker-my-location.png`, 32, 32, 16);

    const startCenter = center ?? { lat: 37.4979, lng: 127.0276 };
    const map = new naver.maps.Map(el, {
      center: new naver.maps.LatLng(startCenter.lat, startCenter.lng),
      zoom: center ? ZOOM_CLOSE : ZOOM_CITY,
    });
    mapRef.current = map;

    // 클러스터 아이콘 — 앱 primary 스케일 4단계(개수 많을수록 진하고 크게). 흰 테두리 + 흰 숫자(Pretendard SemiBold).
    const clusterHtml = (size: number, bg: string) =>
      `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:${size / 2}px;box-sizing:border-box;` +
      `color:#fff;font-size:${size >= 56 ? 15 : 13}px;font-weight:600;letter-spacing:-0.2px;border:2px solid #fff;` +
      `box-shadow:${shadow.md};font-family:${FONT_FAMILY.replace(/"/g, "'")};` +
      `display:flex;align-items:center;justify-content:center;"></div>`;
    const clusterIcon = (size: number, bg: string) => ({
      content: clusterHtml(size, bg),
      size: new naver.maps.Size(size, size),
      anchor: new naver.maps.Point(size / 2, size / 2),
    });
    const clustering = new MarkerClustering({
      minClusterSize: 2,
      maxZoom: CLUSTER_MAX_ZOOM,
      map,
      markers: [],
      disableClickZoom: false,
      gridSize: 80,
      icons: [
        clusterIcon(36, color.primary[400]),
        clusterIcon(44, color.primary[500]),
        clusterIcon(54, color.primary[600]),
        clusterIcon(64, color.primary[700]),
      ],
      indexGenerator: [10, 100, 500], // 카카오판 calculator와 동일 구간
      stylingFunction: (clusterMarker: NaverAny, count: number) => {
        const wrap = clusterMarker.getElement();
        const inner = wrap?.querySelector("div");
        if (inner) inner.textContent = String(count);
      },
    });
    clusteringRef.current = clustering;
    setMapState(map);

    return () => {
      // The SDK may have invalidated its internals after a domain/auth error.
      const detach = (item: NaverAny) => { try { item?.setMap(null); } catch { /* already invalid */ } };
      detach(clustering);
      clusteringRef.current = null;
      Object.values(markersById.current).forEach(detach);
      markersById.current = {};
      Object.values(partnerById.current).forEach((p) => {
        detach(p.marker);

      });
      partnerById.current = {};
      detach(myDotRef.current);
      myDotRef.current = null;
      mapRef.current = null;
      setMapState(null);
    };
    // center/myPos는 초기 1회만 반영(이후는 별도 effect) → deps는 ready만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 지도 이동/줌이 멈추면(idle) 현재 영역(bounds)을 보고 → 그 영역 샵만 로드
  useEffect(() => {
    const naver = (window as NaverAny).naver;
    const map = mapState;
    if (!map || !naver?.maps) return;
    const emit = () => {
      setIsDotZoom(map.getZoom() < DOT_ZOOM_THRESHOLD);
      const b = map.getBounds();
      const sw = b.getSW();
      const ne = b.getNE();
      onBoundsRef.current?.({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() });
    };
    const listener = naver.maps.Event.addListener(map, "idle", emit);
    emit(); // 최초 1회
    return () => { try { naver.maps.Event.removeListener(listener); } catch { /* SDK invalidated */ } };
  }, [mapState]);

  // One synchronization path keeps selection stable while data and zoom change.
  useEffect(() => {
    const naver = (window as NaverAny).naver;
    const map = mapState;
    const clustering = clusteringRef.current;
    if (!map || !clustering || !naver?.maps) return;
    const regular = markersById.current;
    const partners = partnerById.current;
    const valid = shops.filter(s => s.coord && Number.isFinite(s.coord.lat) && Number.isFinite(s.coord.lng));
    const regularIds = new Set(valid.filter(s => !s.isPartner).map(s => s.id));
    const partnerIds = new Set(valid.filter(s => s.isPartner).map(s => s.id));
    for (const id of Object.keys(regular)) {
      if (!regularIds.has(id)) { regular[id].setMap(null); delete regular[id]; }
    }
    for (const id of Object.keys(partners)) {
      if (!partnerIds.has(id)) { partners[id].marker.setMap(null); delete partners[id]; }
    }
    let cancelled = false;
    let index = 0;
    const step = () => {
      if (cancelled) return;
      for (const shop of valid.slice(index, index + 1500)) {
        const focused = shop.id === highlightedId;
        // App markerKindOf: partner wins, then active discount / same-day mode.
        const kind = shop.isPartner ? "partner" : showDiscount ? "discount" : showToday ? "reservable" : "default";
        let marker = shop.isPartner ? partners[shop.id]?.marker : regular[shop.id];
        const position = new naver.maps.LatLng(shop.coord.lat, shop.coord.lng);
        if (!marker) {
          marker = new naver.maps.Marker({ position, title: shop.name });
          naver.maps.Event.addListener(marker, "click", () => onClickRef.current(shop));
          if (shop.isPartner) partners[shop.id] = { marker };
          else regular[shop.id] = marker;
        }
        marker.setPosition(position);
        marker.setIcon(markerIcon(naver, kind, focused, isDotZoom));
        marker.setZIndex(focused ? 10 : shop.isPartner ? 5 : 1);
        // Selected pins stay outside clusters, like the native app overlay.
        marker.setMap(shop.isPartner || focused ? map : null);
      }
      index += 1500;
      if (index < valid.length) requestAnimationFrame(step);
      else {
        clustering.setMarkers(Object.entries(regular).filter(([id]) => id !== highlightedId).map(([, marker]) => marker));
        try { clustering._redraw?.(); } catch { /* projection becomes ready on idle */ }
        // Cluster teardown can hide its former member; restore selected overlay last.
        if (highlightedId && regular[highlightedId]) regular[highlightedId].setMap(map);
      }
    };
    step();
    return () => { cancelled = true; };
  }, [mapState, shops, highlightedId, showToday, showDiscount, isDotZoom]);

  // 내 위치 점 마커 — myPos 변화에 맞춰 생성/이동/제거
  useEffect(() => {
    const naver = (window as NaverAny).naver;
    const map = mapState;
    if (!map || !naver?.maps) return;
    if (!myPos) {
      myDotRef.current?.setMap(null);
      myDotRef.current = null;
      return;
    }
    const pos = new naver.maps.LatLng(myPos.lat, myPos.lng);
    if (myDotRef.current) myDotRef.current.setPosition(pos);
    else myDotRef.current = new naver.maps.Marker({ position: pos, map, icon: iconsRef.current["__mydot__"], zIndex: 20 });
  }, [mapState, myPos]);

  // center prop 변화 시 그 지점으로 이동 + 가까운 줌
  useEffect(() => {
    const naver = (window as NaverAny).naver;
    const map = mapState;
    if (!map || !center || !naver?.maps) return;
    map.panTo(new naver.maps.LatLng(center.lat, center.lng));
    map.setZoom(ZOOM_CLOSE, true);
  }, [mapState, center]);

  function recenter() {
    const naver = (window as NaverAny).naver;
    const map = mapState;
    if (!map || !myPos || !naver?.maps) return;
    map.panTo(new naver.maps.LatLng(myPos.lat, myPos.lng));
  }

  if (error) return <Centered>지도를 불러오지 못했어요</Centered>;
  if (!ready) return <Centered>지도 불러오는 중…</Centered>;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {/* 현재 위치로 돌아가기 (지도 좌하단, 시트 peek 위) */}
      {myPos && mapState && (
        <button
          onClick={recenter}
          aria-label="현재 위치로"
          style={{ position: "absolute", right: 16, bottom: "calc(40dvh + 14px)", zIndex: 18, width: 40, height: 40, borderRadius: 20, border: `1px solid ${color.gray[300]}`, background: color.white, boxShadow: shadow.xs, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
        >
          {/* 앱 CurrentLocationButton과 동일: 40×40 흰 원 + gray-300 테두리 + LocateFixed(gray-700) */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.gray[700]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" x2="5" y1="12" y2="12" />
            <line x1="19" x2="22" y1="12" y2="12" />
            <line x1="12" x2="12" y1="2" y2="5" />
            <line x1="12" x2="12" y1="19" y2="22" />
            <circle cx="12" cy="12" r="7" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: color.text.hint,
        background: color.surface.map,
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}
