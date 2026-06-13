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
  const markersById = useRef<Record<string, KakaoAny>>({});
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

  // 네이티브 클러스터러 — 마커 전체를 React 밖에서 관리 + 프레임 단위 점진 추가(블로킹 방지)
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    if (!map || !kakao?.maps?.MarkerClusterer) return;

    // 카테고리별 공유 이미지 (8개만 생성, 마커들이 재사용)
    if (!Object.keys(imagesRef.current).length) {
      for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        imagesRef.current[cat] = new kakao.maps.MarkerImage(
          pinDataUrl(color),
          new kakao.maps.Size(14, 14),
        );
      }
    }
    if (!imagesRef.current["__event__"]) {
      imagesRef.current["__event__"] = new kakao.maps.MarkerImage(
        eventPinDataUrl(),
        new kakao.maps.Size(24, 31),
      );
    }
    const images = imagesRef.current;
    const fallback = images["네일"];
    const eventImage = images["__event__"];

    const clusterStyle = (size: number, bg: string) => ({
      width: `${size}px`,
      height: `${size}px`,
      background: bg,
      borderRadius: `${size / 2}px`,
      color: "#fff",
      textAlign: "center" as const,
      lineHeight: `${size}px`,
      fontSize: "13px",
      fontWeight: "700",
      border: "2px solid #fff",
      boxShadow: "0 2px 8px rgba(157,23,107,.35)",
    });

    const clusterer = new kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 6, // 이상(줌아웃)=클러스터, 미만(줌인)=개별 핀
      gridSize: 80, // 클러스터 묶는 범위 ↑ → 클러스터 수 ↓ → 가벼움
      minClusterSize: 2,
      disableClickZoom: false,
      // 브랜드 핑크 농담 (개수 많을수록 진하게)
      calculator: [10, 100, 500],
      styles: [
        clusterStyle(38, "rgba(244,114,182,0.92)"),
        clusterStyle(46, "rgba(236,72,153,0.93)"),
        clusterStyle(56, "rgba(219,39,119,0.95)"),
        clusterStyle(66, "rgba(157,23,107,0.95)"),
      ],
    });
    clustererRef.current = clusterer;

    const list = shops.filter((s) => s.coord?.lat && s.coord?.lng);
    const byId: Record<string, KakaoAny> = {};
    markersById.current = byId;

    // 한 번에 7,635개 생성 시 메인스레드 정지 → 1,500개씩 프레임에 나눠 추가
    let cancelled = false;
    let i = 0;
    const BATCH = 1500;
    function step() {
      if (cancelled) return;
      const slice = list.slice(i, i + BATCH);
      const markers = slice.map((s) => {
        const marker = new kakao.maps.Marker({
          position: new kakao.maps.LatLng(s.coord.lat, s.coord.lng),
          image: s.hasEvent ? eventImage : images[s.category] || fallback,
          title: s.name,
        });
        if (s.hasEvent) marker.setZIndex(6); // 할인핀을 일반 핀 위로
        kakao.maps.event.addListener(marker, "click", () => onClickRef.current(s));
        byId[s.id] = marker;
        return marker;
      });
      clusterer.addMarkers(markers);
      i += BATCH;
      if (i < list.length) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);

    return () => {
      cancelled = true;
      clusterer.clear();
      clusterer.setMap(null);
      markersById.current = {};
    };
  }, [map, shops]);

  // 선택 핀 강조 (imperatively 이미지 교체)
  const prevHl = useRef<string | undefined>();
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    if (!kakao?.maps) return;
    const byId = markersById.current;
    if (prevHl.current && byId[prevHl.current]) {
      const prev = shops.find((x) => x.id === prevHl.current);
      byId[prevHl.current].setImage(
        (prev?.hasEvent && imagesRef.current["__event__"]) ||
          (prev && imagesRef.current[prev.category]) ||
          imagesRef.current["네일"],
      );
    }
    if (highlightedId && byId[highlightedId]) {
      const s = shops.find((x) => x.id === highlightedId);
      const color = (s && CATEGORY_COLORS[s.category]) || "#ec4899";
      byId[highlightedId].setImage(
        new kakao.maps.MarkerImage(pinDataUrl(color, true), new kakao.maps.Size(26, 26)),
      );
      byId[highlightedId].setZIndex(10);
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
