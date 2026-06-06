import { useEffect, useRef, useState } from "react";
import { Map, MapMarker, useKakaoLoader } from "react-kakao-maps-sdk";
import type { ShopSummary } from "../domain/shop";
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

const MY_DOT =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="6" fill="#3b82f6" stroke="white" stroke-width="3"/><circle cx="11" cy="11" r="10" fill="#3b82f6" opacity="0.18"/></svg>`,
  );

type Props = {
  shops: ShopSummary[];
  highlightedId?: string;
  center?: Coordinate;
  myPos?: Coordinate | null;
  onPinClick: (shop: ShopSummary) => void;
};

export function MapView({ shops, highlightedId, center, myPos, onPinClick }: Props) {
  const [loading, error] = useKakaoLoader({
    appkey: KAKAO_KEY,
    libraries: ["clusterer"], // MarkerClusterer 사용 시 필수
  });
  const [map, setMap] = useState<KakaoAny>(null);
  const clustererRef = useRef<KakaoAny>(null);
  const markersById = useRef<Record<string, KakaoAny>>({});
  const imagesRef = useRef<Record<string, KakaoAny>>({});
  // 최신 onPinClick을 리스너에서 참조 (재바인딩 없이)
  const onClickRef = useRef(onPinClick);
  onClickRef.current = onPinClick;

  // 네이티브 클러스터러 — 마커 전체를 React 밖에서 관리 (성능 핵심)
  useEffect(() => {
    const kakao = (window as KakaoAny).kakao;
    if (!map || !kakao?.maps?.MarkerClusterer) return;

    // 카테고리별 공유 이미지 (8개만 생성, 7,635개 마커가 재사용)
    if (!Object.keys(imagesRef.current).length) {
      for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
        imagesRef.current[cat] = new kakao.maps.MarkerImage(
          pinDataUrl(color),
          new kakao.maps.Size(14, 14),
        );
      }
    }
    const images = imagesRef.current;
    const fallback = images["네일"];

    const byId: Record<string, KakaoAny> = {};
    const markers: KakaoAny[] = [];
    for (const s of shops) {
      if (!s.coord?.lat || !s.coord?.lng) continue;
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(s.coord.lat, s.coord.lng),
        image: images[s.category] || fallback,
        title: s.name,
      });
      const shop = s;
      kakao.maps.event.addListener(marker, "click", () => onClickRef.current(shop));
      byId[s.id] = marker;
      markers.push(marker);
    }
    markersById.current = byId;

    const clusterer = new kakao.maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 6, // 이 레벨 이상(줌아웃)에서 클러스터, 미만(줌인)에서 개별 핀
      gridSize: 60,
      disableClickZoom: false,
      markers,
    });
    clustererRef.current = clusterer;

    return () => {
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
        (prev && imagesRef.current[prev.category]) || imagesRef.current["네일"],
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
