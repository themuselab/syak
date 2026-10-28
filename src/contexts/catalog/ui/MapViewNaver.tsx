import { useEffect, useRef, useState } from "react";
import type { ShopPin } from "../domain/shop";
import type { Bounds } from "../ports/shop-repository";
import { color, shadow, FONT_FAMILY } from "../../../shared/ui/tokens";
import { SEOUL_CENTER, type Coordinate } from "../../../shared/domain/coordinate";
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
const ZOOM_CITY = 12; // 기본(서울 시 전체)
const CLUSTER_MAX_ZOOM = 14; // 이 줌 이상이면 클러스터 해제하고 개별 마커 노출

// ── 핀 비주얼 — 소비자 앱과 같은 PNG 핀 (app/assets/icons/*, app/src/screens/home/components/HomeMap.web.tsx) ──
// 앱 규칙: default(분홍 상점) = 일반 샵 / discount(노랑 %) = 이벤트 / reservable(파랑 시계) = 당일 예약 모드
//          선택 = pin-focused(진한 테두리 큰 핀). 크기도 앱과 동일(핀 24×30, 포커스 48×48, 내 위치 32×32).
const ASSET = `${import.meta.env.BASE_URL}map/`;
const PIN = {
  default: `${ASSET}pin-default.png`,
  discount: `${ASSET}pin-discount.png`,
  reservable: `${ASSET}pin-reservable.png`,
  focused: `${ASSET}pin-focused.png`,
  myLocation: `${ASSET}marker-my-location.png`,
};
const PIN_W = 24;
const PIN_H = 30;
const PARTNER_W = 30; // 파트너는 클러스터에서 빠지고 항상 보이므로 한 단계 크게(앱 핀과 같은 모양)
const PARTNER_H = 37.5;
const FOCUSED = 48;
const FOCUSED_TIP_Y = 45; // pin-focused.png(168px)의 핀 끝 = y 158 → 48px 기준 45 (네이티브 마커 기본 앵커 = 하단 끝)

// 파트너 이름 라벨 HTML — 앱 "샥 파트너" 브랜드 칩 모양(연분홍 배경 + primary-300 테두리 + primary-500 글씨).
// 0x0 래퍼 안에 절대배치로 핀 위에 띄운다(가변 폭이라 anchor는 0,0 고정).
function partnerLabelHtml(name: string): string {
  const style =
    `position:absolute;left:0;bottom:${PARTNER_H + 5}px;transform:translateX(-50%);white-space:nowrap;` +
    `background:${color.brand.tint};border:1px solid ${color.primary[300]};color:${color.primary[500]};` +
    `font-size:12px;font-weight:600;line-height:16px;padding:3px 9px;border-radius:999px;` +
    `box-shadow:${shadow.sm};cursor:pointer;font-family:${FONT_FAMILY.replace(/"/g, "'")};`;
  const esc = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="position:relative;width:0;height:0;"><div style="${style}">${esc}</div></div>`;
}

// 이미지 아이콘 옵션 — anchor는 이미지 하단 중앙(카카오 MarkerImage 기본과 동일).
function imgIcon(naver: NaverAny, url: string, w: number, h: number, anchorY: number = h): NaverAny {
  return {
    url,
    size: new naver.maps.Size(w, h),
    scaledSize: new naver.maps.Size(w, h),
    anchor: new naver.maps.Point(w / 2, anchorY),
  };
}

// ── SDK + 클러스터링 로더 (모듈 레벨 프로미스 캐시 → 다중 마운트 중복 로드 방지) ──
let naverLoadPromise: Promise<void> | null = null;

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
    icons["__default__"] = imgIcon(naver, PIN.default, PIN_W, PIN_H);
    icons["__event__"] = imgIcon(naver, PIN.discount, PIN_W, PIN_H);
    icons["__partner__"] = imgIcon(naver, PIN.default, PARTNER_W, PARTNER_H);
    icons["__today__"] = imgIcon(naver, PIN.reservable, PIN_W, PIN_H);
    icons["__focused__"] = imgIcon(naver, PIN.focused, FOCUSED, FOCUSED, FOCUSED_TIP_Y);
    icons["__mydot__"] = imgIcon(naver, PIN.myLocation, 32, 32, 16); // 점형 = 중앙 앵커(앱과 동일)

    const startCenter = center ?? SEOUL_CENTER;
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
      return green ? icons["__today__"] : s.hasEvent ? icons["__event__"] : icons["__default__"];
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
      mk.setIcon(green ? icons["__today__"] : s.hasEvent ? icons["__event__"] : icons["__default__"]);
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
        icons["__default__"];
      mk(prevHl.current).setIcon(restore);
      // 강조 해제 시 zIndex도 원복 (카카오판의 잠재 버그 개선)
      mk(prevHl.current).setZIndex(prev?.isPartner ? 9 : showToday && prev?.todayOpen ? 7 : prev?.hasEvent ? 6 : 3);
    }
    if (highlightedId && mk(highlightedId)) {
      mk(highlightedId).setIcon(icons["__focused__"]); // 앱과 동일: 선택 핀 = pin-focused
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
          style={{ position: "absolute", left: 16, bottom: "calc(30vh + 14px)", zIndex: 18, width: 40, height: 40, borderRadius: 20, border: `1px solid ${color.gray[300]}`, background: color.white, boxShadow: shadow.xs, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
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
