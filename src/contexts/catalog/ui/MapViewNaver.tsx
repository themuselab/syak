import { useEffect, useRef, useState } from "react";
import type { ShopPin } from "../domain/shop";
import type { Bounds } from "../ports/shop-repository";
import { CATEGORY_COLORS } from "./theme";
import { SEOUL_CENTER, type Coordinate } from "../../../shared/domain/coordinate";
// 네이버 공식 클러스터링 소스 — ESM으로 정적 import 불가(로드시 naver.maps.Util.ClassExtend 호출).
// 문자열로 받아 SDK 로드 후 <script>로 평가한다. (useNaverLoader 참고)
import markerClusteringSource from "../../../shared/vendor/MarkerClustering.js?raw";

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
const ZOOM_CITY = 12; // 기본(서울 시 전체)
const CLUSTER_MAX_ZOOM = 14; // 이 줌 이상이면 클러스터 해제하고 개별 마커 노출

// ── 핀 비주얼 (카카오판과 동일한 SVG 데이터-URL 생성기) ──────────────────────
function pinDataUrl(color: string, highlighted = false): string {
  const size = highlighted ? 26 : 14;
  const stroke = highlighted ? 3 : 1.4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - stroke}" fill="${color}" stroke="white" stroke-width="${stroke}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 할인/이벤트 가게 — 핑크 물방울 핀(일반 동그라미 핀과 확연히 구분, 네이버 광고핀처럼)
function eventPinDataUrl(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="31" viewBox="0 0 24 31">` +
    `<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 19 12 19s12-10.6 12-19C24 5.4 18.6 0 12 0z" fill="#ec4899" stroke="#fff" stroke-width="2"/>` +
    `<text x="12" y="16" font-size="11" font-weight="bold" fill="#fff" text-anchor="middle" font-family="sans-serif">%</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 오늘 예약 가능 — 초록 물방울 핀 (당일 예약 가능 = 당장 갈 수 있음)
function todayPinDataUrl(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="31" viewBox="0 0 24 31">` +
    `<path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 19 12 19s12-10.6 12-19C24 5.4 18.6 0 12 0z" fill="#16a34a" stroke="#fff" stroke-width="2"/>` +
    `<path d="M7 12l3.2 3.2L17 8.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// 샥 파트너(파일럿) — 골드 별 핀(가장 크고 눈에 띔, 클러스터에서 제외돼 항상 보임)
function partnerPinDataUrl(): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40">` +
    `<path d="M15 0C7 0 0 6.6 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.6 23 0 15 0z" fill="#f59e0b" stroke="#fff" stroke-width="2.5"/>` +
    `<path d="M15 6l2.6 5.3 5.9.9-4.2 4.1 1 5.8L15 23.4 9.7 26.1l1-5.8-4.2-4.1 5.9-.9z" fill="#fff"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const MY_DOT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="6" fill="#3b82f6" stroke="white" stroke-width="3"/><circle cx="11" cy="11" r="10" fill="#3b82f6" opacity="0.18"/></svg>`,
  );

// 파트너 이름 라벨 HTML — 0x0 래퍼 안에 절대배치로 핀 위에 띄운다(가변 폭이라 anchor는 0,0 고정).
function partnerLabelHtml(name: string): string {
  const style =
    "position:absolute;left:0;bottom:46px;transform:translateX(-50%);white-space:nowrap;" +
    "background:#fff;border:1.5px solid #f59e0b;color:#b45309;font-size:11px;font-weight:800;" +
    "padding:3px 8px;border-radius:11px;box-shadow:0 2px 7px rgba(0,0,0,.22);cursor:pointer;";
  const esc = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="position:relative;width:0;height:0;"><div style="${style}">${esc}</div></div>`;
}

// 이미지 아이콘 옵션 — anchor는 이미지 하단 중앙(카카오 MarkerImage 기본과 동일).
function imgIcon(naver: NaverAny, url: string, w: number, h: number): NaverAny {
  return {
    url,
    size: new naver.maps.Size(w, h),
    scaledSize: new naver.maps.Size(w, h),
    anchor: new naver.maps.Point(w / 2, h),
  };
}

// ── SDK + 클러스터링 로더 (모듈 레벨 프로미스 캐시 → 다중 마운트 중복 로드 방지) ──
let naverLoadPromise: Promise<void> | null = null;

function loadNaverMaps(clientId: string): Promise<void> {
  if (naverLoadPromise) return naverLoadPromise;
  naverLoadPromise = new Promise<void>((resolve, reject) => {
    const w = window as NaverAny;
    // 2) SDK 준비 후 클러스터링 소스를 <script>로 평가 (naver.maps 글로벌이 있어야 함)
    const evalCluster = () => {
      if (!w.MarkerClustering) {
        const s = document.createElement("script");
        s.type = "text/javascript";
        s.textContent = markerClusteringSource;
        document.head.appendChild(s);
      }
      if (w.MarkerClustering) resolve();
      else reject(new Error("MarkerClustering eval failed"));
    };
    // 이미 로드돼 있으면 바로 진행
    if (w.naver?.maps) {
      evalCluster();
      return;
    }
    // 1) SDK 스크립트 주입
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
    loadNaverMaps(clientId)
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((e: Error) => {
        if (alive) setError(e);
      });
    return () => {
      alive = false;
    };
  }, [clientId]);
  return { ready, error };
}

type Props = {
  shops: ShopPin[];
  highlightedId?: string;
  center?: Coordinate;
  myPos?: Coordinate | null;
  showToday?: boolean; // '오늘 예약' 토글 ON일 때만 초록핀, 평소엔 기본(핑크) 핀
  onPinClick: (shop: ShopPin) => void;
  onBoundsChanged?: (b: Bounds) => void;
};

export function MapViewNaver({ shops, highlightedId, center, myPos, showToday = false, onPinClick, onBoundsChanged }: Props) {
  const { ready, error } = useNaverLoader(NAVER_MAP_CLIENT_ID);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapState, setMapState] = useState<NaverAny>(null);
  const mapRef = useRef<NaverAny>(null);
  const clusteringRef = useRef<NaverAny>(null);
  const iconsRef = useRef<Record<string, NaverAny>>({}); // 공유 아이콘 옵션
  const markersById = useRef<Record<string, NaverAny>>({}); // 일반 마커(클러스터 대상, map:null)
  const partnerById = useRef<Record<string, { marker: NaverAny; label: NaverAny }>>({}); // 파트너(직접 표시)
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
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
      icons[cat] = imgIcon(naver, pinDataUrl(color), 14, 14);
    }
    icons["__event__"] = imgIcon(naver, eventPinDataUrl(), 24, 31);
    icons["__partner__"] = imgIcon(naver, partnerPinDataUrl(), 30, 40);
    icons["__today__"] = imgIcon(naver, todayPinDataUrl(), 24, 31);
    icons["__mydot__"] = imgIcon(naver, MY_DOT, 22, 22);

    const startCenter = center ?? SEOUL_CENTER;
    const map = new naver.maps.Map(el, {
      center: new naver.maps.LatLng(startCenter.lat, startCenter.lng),
      zoom: center ? ZOOM_CLOSE : ZOOM_CITY,
    });
    mapRef.current = map;

    // 클러스터 아이콘 — 카카오판과 동일한 핑크 그라데이션 4단계
    const clusterHtml = (size: number, bg: string) =>
      `<div style="width:${size}px;height:${size}px;background:${bg};border-radius:${size / 2}px;` +
      `color:#fff;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 2px 8px rgba(157,23,107,.35);` +
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
        clusterIcon(38, "rgba(244,114,182,0.92)"),
        clusterIcon(46, "rgba(236,72,153,0.93)"),
        clusterIcon(56, "rgba(219,39,119,0.95)"),
        clusterIcon(66, "rgba(157,23,107,0.95)"),
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
      clustering.setMap(null);
      clusteringRef.current = null;
      Object.values(markersById.current).forEach((m) => m.setMap(null));
      markersById.current = {};
      Object.values(partnerById.current).forEach((p) => {
        p.marker.setMap(null);
        p.label.setMap(null);
      });
      partnerById.current = {};
      myDotRef.current?.setMap(null);
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
      const b = map.getBounds();
      const sw = b.getSW();
      const ne = b.getNE();
      onBoundsRef.current?.({ swLat: sw.lat(), swLng: sw.lng(), neLat: ne.lat(), neLng: ne.lng() });
    };
    const listener = naver.maps.Event.addListener(map, "idle", emit);
    emit(); // 최초 1회
    return () => naver.maps.Event.removeListener(listener);
  }, [mapState]);

  // 마커 diff — shops 바뀌면 사라진 것만 제거 + 새것만 추가 (전체 재생성 X → pan 렉 해결)
  useEffect(() => {
    const naver = (window as NaverAny).naver;
    const map = mapState;
    const clustering = clusteringRef.current;
    if (!map || !clustering || !naver?.maps) return;
    const icons = iconsRef.current;
    const byId = markersById.current;
    const pById = partnerById.current;

    const regIcon = (s: ShopPin) => {
      const green = showToday && s.todayOpen; // 토글 ON일 때만 초록
      return green ? icons["__today__"] : s.hasEvent ? icons["__event__"] : icons[s.category] || icons["네일"];
    };
    const regZ = (s: ShopPin) => (showToday && s.todayOpen ? 7 : s.hasEvent ? 6 : 3);

    // 클러스터에 현재 마커 집합 반영 후 재생성. (vendored lib의 KVO는 'markers' 변경 시
    // 자동 redraw를 트리거하지 않으므로 직접 _redraw 호출; 실패해도 다음 idle에서 갱신됨)
    const syncCluster = () => {
      clustering.setMarkers(Object.values(byId));
      try {
        if (typeof clustering._redraw === "function") clustering._redraw();
      } catch {
        /* projection 미준비 등 — 다음 idle 이벤트에서 자동 재생성 */
      }
    };

    const all = shops.filter((s) => s.coord?.lat && s.coord?.lng);
    const regIds = new Set<string>();
    const parIds = new Set<string>();
    for (const s of all) (s.isPartner ? parIds : regIds).add(s.id);

    // 사라진 일반 마커 제거
    let regChanged = false;
    for (const id of Object.keys(byId)) {
      if (!regIds.has(id)) {
        byId[id].setMap(null);
        delete byId[id];
        regChanged = true;
      }
    }

    // 사라진 파트너 제거
    for (const id of Object.keys(pById)) {
      if (!parIds.has(id)) {
        pById[id].marker.setMap(null);
        pById[id].label.setMap(null);
        delete pById[id];
      }
    }

    // 새 파트너 추가 (직접 표시 + 이름 라벨) — 클러스터 제외, 항상 보임
    for (const s of all) {
      if (!s.isPartner || pById[s.id]) continue;
      const pos = new naver.maps.LatLng(s.coord.lat, s.coord.lng);
      const marker = new naver.maps.Marker({ position: pos, map, icon: icons["__partner__"], zIndex: 9, title: s.name });
      naver.maps.Event.addListener(marker, "click", () => onClickRef.current(s));
      const label = new naver.maps.Marker({
        position: pos,
        map,
        zIndex: 11,
        icon: { content: partnerLabelHtml(s.name), anchor: new naver.maps.Point(0, 0) },
      });
      naver.maps.Event.addListener(label, "click", () => onClickRef.current(s));
      pById[s.id] = { marker, label };
    }

    // 새 일반 마커만 배치 추가 (1,500개씩 프레임 분할)
    const toAdd = all.filter((s) => !s.isPartner && !byId[s.id]);
    if (regChanged && toAdd.length === 0) syncCluster();

    let cancelled = false;
    let i = 0;
    const BATCH = 1500;
    const step = () => {
      if (cancelled) return;
      const slice = toAdd.slice(i, i + BATCH);
      for (const s of slice) {
        const marker = new naver.maps.Marker({
          position: new naver.maps.LatLng(s.coord.lat, s.coord.lng),
          icon: regIcon(s), // map 미지정 → 클러스터러가 표시/숨김 관리
          title: s.name,
          zIndex: regZ(s),
        });
        naver.maps.Event.addListener(marker, "click", () => onClickRef.current(s));
        byId[s.id] = marker;
      }
      if (slice.length) syncCluster();
      i += BATCH;
      if (i < toAdd.length) requestAnimationFrame(step);
    };
    if (toAdd.length) requestAnimationFrame(step);

    return () => {
      cancelled = true;
    };
  }, [mapState, shops, showToday]);

  // '오늘 예약' 토글 변화 시 기존(공유) 마커 색 즉시 갱신 — diff는 새 마커만 추가하므로 별도 동기화
  useEffect(() => {
    const icons = iconsRef.current;
    if (!Object.keys(icons).length) return;
    const byId = markersById.current;
    for (const s of shops) {
      const mk = byId[s.id];
      if (!mk) continue;
      const green = showToday && s.todayOpen;
      mk.setIcon(green ? icons["__today__"] : s.hasEvent ? icons["__event__"] : icons[s.category] || icons["네일"]);
      mk.setZIndex(green ? 7 : s.hasEvent ? 6 : 3);
    }
  }, [showToday, shops]);

  // 선택 핀 강조 (imperatively 아이콘 교체)
  const prevHl = useRef<string | undefined>(undefined);
  useEffect(() => {
    const naver = (window as NaverAny).naver;
    if (!naver?.maps) return;
    const icons = iconsRef.current;
    const mk = (id: string) => markersById.current[id] || partnerById.current[id]?.marker;
    if (prevHl.current && mk(prevHl.current)) {
      const prev = shops.find((x) => x.id === prevHl.current);
      const restore =
        (prev?.isPartner && icons["__partner__"]) ||
        (showToday && prev?.todayOpen && icons["__today__"]) ||
        (prev?.hasEvent && icons["__event__"]) ||
        (prev && icons[prev.category]) ||
        icons["네일"];
      mk(prevHl.current).setIcon(restore);
      // 강조 해제 시 zIndex도 원복 (카카오판의 잠재 버그 개선)
      mk(prevHl.current).setZIndex(prev?.isPartner ? 9 : showToday && prev?.todayOpen ? 7 : prev?.hasEvent ? 6 : 3);
    }
    if (highlightedId && mk(highlightedId)) {
      const s = shops.find((x) => x.id === highlightedId);
      const color = (s && CATEGORY_COLORS[s.category]) || "#ec4899";
      mk(highlightedId).setIcon(imgIcon(naver, pinDataUrl(color, true), 26, 26));
      mk(highlightedId).setZIndex(10);
    }
    prevHl.current = highlightedId;
  }, [highlightedId, shops, showToday]);

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
          style={{ position: "absolute", left: 16, bottom: "calc(30vh + 14px)", zIndex: 18, width: 44, height: 44, borderRadius: 22, border: "none", background: "#fff", boxShadow: "0 2px 10px rgba(0,0,0,.18)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth={2} strokeLinecap="round">
            <circle cx="12" cy="12" r="3.5" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="2" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="22" y2="12" />
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
        color: "#888",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}
