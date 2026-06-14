import { useEffect, useRef, useState } from "react";
import { Map, MapMarker, useKakaoLoader } from "react-kakao-maps-sdk";
import type { ShopPin } from "../domain/shop";
import type { Bounds } from "../ports/shop-repository";
import { CATEGORY_COLORS } from "./theme";
import { SEOUL_CENTER, type Coordinate } from "../../../shared/domain/coordinate";

// 카카오 SDK는 런타임 글로벌 — 타입 느슨하게.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KakaoAny = any;

const KAKAO_KEY =
  (import.meta.env.VITE_KAKAO_KEY as string | undefined) ||
  "d8b9d4a2c02a527bf1711ecbcdf07b49";

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

type Props = {
  shops: ShopPin[];
  highlightedId?: string;
  center?: Coordinate;
  myPos?: Coordinate | null;
  onPinClick: (shop: ShopPin) => void;
  onBoundsChanged?: (b: Bounds) => void;
};

export function MapView({ shops, highlightedId, center, myPos, onPinClick, onBoundsChanged }: Props) {
  const [loading, error] = useKakaoLoader({
    appkey: KAKAO_KEY,
    libraries: ["clusterer"], // MarkerClusterer 사용 시 필수
  });
  const [map, setMap] = useState<KakaoAny>(null);
  const clustererRef = useRef<KakaoAny>(null);
  const markersById = useRef<Record<string, KakaoAny>>({}); // 일반 마커(클러스터)
  const partnerById = useRef<Record<string, { marker: KakaoAny; overlay: KakaoAny }>>({}); // 파트너(직접)
  const imagesRef = useRef<Record<string, KakaoAny>>({});
  // 최신 콜백을 리스너에서 참조 (재바인딩 없이)
  const onClickRef = useRef(onPinClick);
  onClickRef.current = onPinClick;
  const onBoundsRef = useRef(onBoundsChanged);
  onBoundsRef.current = onBoundsChanged;

  // 지도 이동/줌이 멈추면(idle) 현재 영역(bounds)을 보고 → 그 영역 샵만 로드
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    if (!map || !kakao?.maps) return;
    const emit = () => {
      const bd = map.getBounds();
      const sw = bd.getSouthWest();
      const ne = bd.getNorthEast();
      onBoundsRef.current?.({ swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng() });
    };
    kakao.maps.event.addListener(map, "idle", emit);
    emit(); // 최초 1회
    return () => kakao.maps.event.removeListener(map, "idle", emit);
  }, [map]);

  // 클러스터러 + 공유 이미지: 지도당 1회만 생성, 언마운트 시 정리 (매 pan 재생성 X)
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    if (!map || !kakao?.maps?.MarkerClusterer) return;

    if (!Object.keys(imagesRef.current).length) {
      for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        imagesRef.current[cat] = new kakao.maps.MarkerImage(pinDataUrl(color), new kakao.maps.Size(14, 14));
      }
    }
    if (!imagesRef.current["__event__"]) imagesRef.current["__event__"] = new kakao.maps.MarkerImage(eventPinDataUrl(), new kakao.maps.Size(24, 31));
    if (!imagesRef.current["__partner__"]) imagesRef.current["__partner__"] = new kakao.maps.MarkerImage(partnerPinDataUrl(), new kakao.maps.Size(30, 40));
    if (!imagesRef.current["__today__"]) imagesRef.current["__today__"] = new kakao.maps.MarkerImage(todayPinDataUrl(), new kakao.maps.Size(24, 31));

    const clusterStyle = (size: number, bg: string) => ({
      width: `${size}px`, height: `${size}px`, background: bg, borderRadius: `${size / 2}px`,
      color: "#fff", textAlign: "center" as const, lineHeight: `${size}px`, fontSize: "13px",
      fontWeight: "700", border: "2px solid #fff", boxShadow: "0 2px 8px rgba(157,23,107,.35)",
    });
    const clusterer = new kakao.maps.MarkerClusterer({
      map, averageCenter: true, minLevel: 6, gridSize: 80, minClusterSize: 2, disableClickZoom: false,
      calculator: [10, 100, 500],
      styles: [
        clusterStyle(38, "rgba(244,114,182,0.92)"), clusterStyle(46, "rgba(236,72,153,0.93)"),
        clusterStyle(56, "rgba(219,39,119,0.95)"), clusterStyle(66, "rgba(157,23,107,0.95)"),
      ],
    });
    clustererRef.current = clusterer;

    return () => {
      clusterer.clear();
      clusterer.setMap(null);
      clustererRef.current = null;
      Object.values(partnerById.current).forEach((p) => { p.marker.setMap(null); p.overlay.setMap(null); });
      partnerById.current = {};
      markersById.current = {};
    };
  }, [map]);

  // 마커 diff — shops 바뀌면 사라진 것만 제거 + 새것만 추가 (전체 재생성 X → pan 렉 해결)
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    const clusterer = clustererRef.current;
    if (!map || !clusterer || !kakao?.maps) return;
    const images = imagesRef.current;
    const fallback = images["네일"];
    const eventImage = images["__event__"];
    const partnerImage = images["__partner__"];
    const todayImage = images["__today__"];
    const byId = markersById.current;
    const pById = partnerById.current;

    const all = shops.filter((s) => s.coord?.lat && s.coord?.lng);
    const regIds = new Set<string>();
    const parIds = new Set<string>();
    for (const s of all) (s.isPartner ? parIds : regIds).add(s.id);

    // 사라진 일반 마커 제거
    const removeReg: KakaoAny[] = [];
    for (const id of Object.keys(byId)) {
      if (!regIds.has(id)) { removeReg.push(byId[id]); delete byId[id]; }
    }
    if (removeReg.length) clusterer.removeMarkers(removeReg);

    // 사라진 파트너 제거
    for (const id of Object.keys(pById)) {
      if (!parIds.has(id)) { pById[id].marker.setMap(null); pById[id].overlay.setMap(null); delete pById[id]; }
    }

    // 새 파트너 추가 (직접 표시 + 이름 라벨)
    for (const s of all) {
      if (!s.isPartner || pById[s.id]) continue;
      const pos = new kakao.maps.LatLng(s.coord.lat, s.coord.lng);
      const marker = new kakao.maps.Marker({ position: pos, image: partnerImage, title: s.name, zIndex: 9 });
      kakao.maps.event.addListener(marker, "click", () => onClickRef.current(s));
      marker.setMap(map);
      const el = document.createElement("div");
      el.textContent = s.name;
      el.style.cssText =
        "background:#fff;border:1.5px solid #f59e0b;color:#b45309;font-size:11px;font-weight:800;" +
        "padding:3px 8px;border-radius:11px;box-shadow:0 2px 7px rgba(0,0,0,.22);white-space:nowrap;cursor:pointer;";
      el.onclick = () => onClickRef.current(s);
      const overlay = new kakao.maps.CustomOverlay({ position: pos, content: el, yAnchor: 2.5, zIndex: 11 });
      overlay.setMap(map);
      pById[s.id] = { marker, overlay };
    }

    // 새 일반 마커만 배치 추가 (1,500개씩 프레임 분할)
    const toAdd = all.filter((s) => !s.isPartner && !byId[s.id]);
    let cancelled = false;
    let i = 0;
    const BATCH = 1500;
    function step() {
      if (cancelled) return;
      const slice = toAdd.slice(i, i + BATCH);
      const markers = slice.map((s) => {
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(s.coord.lat, s.coord.lng),
          image: s.todayOpen ? todayImage : s.hasEvent ? eventImage : images[s.category] || fallback,
          title: s.name,
        });
        if (s.todayOpen) marker.setZIndex(7); // 오늘 가능(초록) 최상위
        else if (s.hasEvent) marker.setZIndex(6); // 할인핀
        kakao.maps.event.addListener(marker, "click", () => onClickRef.current(s));
        byId[s.id] = marker;
        return marker;
      });
      if (markers.length) clusterer.addMarkers(markers);
      i += BATCH;
      if (i < toAdd.length) requestAnimationFrame(step);
    }
    if (toAdd.length) requestAnimationFrame(step);

    return () => { cancelled = true; };
  }, [map, shops]);

  // 선택 핀 강조 (imperatively 이미지 교체)
  const prevHl = useRef<string | undefined>();
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    if (!kakao?.maps) return;
    const mk = (id: string) => markersById.current[id] || partnerById.current[id]?.marker;
    if (prevHl.current && mk(prevHl.current)) {
      const prev = shops.find((x) => x.id === prevHl.current);
      mk(prevHl.current).setImage(
        (prev?.isPartner && imagesRef.current["__partner__"]) ||
          (prev?.hasEvent && imagesRef.current["__event__"]) ||
          (prev && imagesRef.current[prev.category]) ||
          imagesRef.current["네일"],
      );
    }
    if (highlightedId && mk(highlightedId)) {
      const s = shops.find((x) => x.id === highlightedId);
      const color = (s && CATEGORY_COLORS[s.category]) || "#ec4899";
      mk(highlightedId).setImage(
        new kakao.maps.MarkerImage(pinDataUrl(color, true), new kakao.maps.Size(26, 26)),
      );
      mk(highlightedId).setZIndex(10);
    }
    prevHl.current = highlightedId;
  }, [highlightedId, shops]);

  if (error) return <Centered>지도를 불러오지 못했어요</Centered>;
  if (loading) return <Centered>지도 불러오는 중…</Centered>;

  return (
    <Map
      center={center ?? SEOUL_CENTER}
      isPanto={!!center}
      level={center ? 5 : 8}
      onCreate={setMap}
      style={{ width: "100%", height: "100%" }}
    >
      {myPos && (
        <MapMarker
          position={myPos}
          image={{ src: MY_DOT, size: { width: 22, height: 22 } }}
          zIndex={20}
        />
      )}
    </Map>
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
