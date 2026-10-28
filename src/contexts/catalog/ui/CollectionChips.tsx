import { color, filterChip } from "../../../shared/ui/tokens";

export type ChipKey = "today" | "event" | "price1" | "price2" | "firstVisit" | "reviews";

// 앱 바텀시트 칩(FilterChipBar)과 같은 아이콘: 당일 예약 = 파란 시계, 할인·이벤트 = 노란 % (앱 핀 색과 짝)
const ICON: Partial<Record<ChipKey, string>> = {
  today: `${import.meta.env.BASE_URL}map/chip-sameday.png`,
  event: `${import.meta.env.BASE_URL}map/chip-discount.png`,
};

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "today", label: "오늘 예약 가능" },
  { key: "event", label: "할인·이벤트" },
  { key: "price2", label: "2만원대" },
  { key: "price1", label: "1만원대" },
  { key: "firstVisit", label: "첫방문 특가" },
  { key: "reviews", label: "리뷰 많은" },
];

type Props = {
  active: ChipKey | null;
  onSelect: (key: ChipKey | null) => void;
};

/** 컬렉션 필터 칩 (가로 스크롤). 한 번 더 누르면 해제. 모양 = 앱 FilterChip. */
export function CollectionChips({ active, onSelect }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        overflowX: "auto",
        padding: "10px 20px 12px",
        scrollbarWidth: "none",
        background: color.white,
      }}
    >
      {CHIPS.map((c) => {
        const on = active === c.key;
        const icon = ICON[c.key];
        return (
          <button key={c.key} onClick={() => onSelect(on ? null : c.key)} style={filterChip(on)}>
            {icon && <img src={icon} alt="" width={16} height={16} style={{ display: "block" }} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
