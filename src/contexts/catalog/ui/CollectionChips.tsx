export type ChipKey = "event" | "price1" | "price2" | "firstVisit" | "reviews";

export const CHIPS: { key: ChipKey; label: string }[] = [
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

/** 컬렉션 필터 칩 (가로 스크롤). 한 번 더 누르면 해제. */
export function CollectionChips({ active, onSelect }: Props) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        overflowX: "auto",
        padding: "12px 16px",
        scrollbarWidth: "none",
      }}
    >
      {CHIPS.map((c) => {
        const on = active === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onSelect(on ? null : c.key)}
            style={{
              flexShrink: 0,
              padding: "9px 15px",
              borderRadius: 20,
              border: "none",
              background: on ? "#ec4899" : "#f1f1f4",
              color: on ? "#fff" : "#444",
              fontSize: 14,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
