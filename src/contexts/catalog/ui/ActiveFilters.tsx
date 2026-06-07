import type { FilterCriteria } from "../domain/filters";

type Props = {
  filter: FilterCriteria;
  onChange: (f: FilterCriteria) => void;
};

/** 현재 적용된 필터를 칩으로 표시 (✕로 개별 해제 + 초기화). */
export function ActiveFilters({ filter, onChange }: Props) {
  const chips: { label: string; remove: () => void }[] = [];

  (filter.categories ?? []).forEach((c) =>
    chips.push({ label: c, remove: () => onChange({ ...filter, categories: filter.categories!.filter((x) => x !== c) }) }),
  );
  (filter.priceTiers ?? []).forEach((p) =>
    chips.push({ label: p, remove: () => onChange({ ...filter, priceTiers: filter.priceTiers!.filter((x) => x !== p) }) }),
  );
  (filter.services ?? []).forEach((s) =>
    chips.push({ label: s, remove: () => onChange({ ...filter, services: filter.services!.filter((x) => x !== s) }) }),
  );
  if (filter.hasEventOnly) chips.push({ label: "이벤트", remove: () => onChange({ ...filter, hasEventOnly: false }) });
  if (filter.firstVisitOnly) chips.push({ label: "첫방문특가", remove: () => onChange({ ...filter, firstVisitOnly: false }) });
  if (filter.reservableOnly) chips.push({ label: "예약가능", remove: () => onChange({ ...filter, reservableOnly: false }) });

  if (!chips.length) return null;

  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "9px 16px 2px", scrollbarWidth: "none" }}>
      {chips.map((c, i) => (
        <button
          key={i}
          onClick={c.remove}
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 16, border: "1px solid #f6c6dc", background: "#fdeef2", color: "#ec4899", fontSize: 13, fontWeight: 600 }}
        >
          {c.label} <span style={{ fontSize: 12, opacity: 0.8 }}>✕</span>
        </button>
      ))}
      <button
        onClick={() => onChange({ gu: filter.gu })}
        style={{ flexShrink: 0, padding: "6px 11px", borderRadius: 16, border: "none", background: "transparent", color: "#999", fontSize: 13, fontWeight: 600, textDecoration: "underline" }}
      >
        초기화
      </button>
    </div>
  );
}
