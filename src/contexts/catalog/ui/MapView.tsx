import { useMemo } from "react";
import { Map, MapMarker, MarkerClusterer, useKakaoLoader } from "react-kakao-maps-sdk";
import type { ShopSummary } from "../domain/shop";
import { CATEGORY_COLORS } from "./theme";
import { SEOUL_CENTER } from "../../../shared/domain/coordinate";

// 카카오 JS 키 — 콘솔 도메인 화이트리스트로 보호. env 우선.
const KAKAO_KEY =
  (import.meta.env.VITE_KAKAO_KEY as string | undefined) ||
  "d8b9d4a2c02a527bf1711ecbcdf07b49";

function pinDataUrl(color: string, highlighted = false): string {
  const size = highlighted ? 24 : 14;
  const stroke = highlighted ? 3 : 1.4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - stroke}" fill="${color}" stroke="white" stroke-width="${stroke}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type Props = {
  shops: ShopSummary[];
  highlightedId?: string;
  center?: { lat: number; lng: number };
  onPinClick: (shop: ShopSummary) => void;
};

export function MapView({ shops, highlightedId, center, onPinClick }: Props) {
  const [loading, error] = useKakaoLoader({ appkey: KAKAO_KEY });

  // 좌표 유효한 것만 (성능 위해 최대 표시 제한)
  const pins = useMemo(
    () => shops.filter((s) => s.coord?.lat && s.coord?.lng),
    [shops],
  );

  if (error) return <Centered>지도를 불러오지 못했어요</Centered>;
  if (loading) return <Centered>지도 불러오는 중…</Centered>;

  return (
    <Map
      center={center ?? SEOUL_CENTER}
      level={7}
      style={{ width: "100%", height: "100%" }}
    >
      <MarkerClusterer averageCenter minLevel={6} disableClickZoom={false}>
        {pins.map((s) => {
          const hl = s.id === highlightedId;
          const color = CATEGORY_COLORS[s.category] ?? "#888";
          const size = hl ? 24 : 14;
          return (
            <MapMarker
              key={s.id}
              position={{ lat: s.coord.lat, lng: s.coord.lng }}
              image={{ src: pinDataUrl(color, hl), size: { width: size, height: size } }}
              onClick={() => onPinClick(s)}
              title={s.name}
            />
          );
        })}
      </MarkerClusterer>
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
