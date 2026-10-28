import type { FilterCriteria } from "../domain/filters";
import { color, filterChip } from "../../../shared/ui/tokens";

type Props = {
  filter: FilterCriteria;
  onChange: (f: FilterCriteria) => void;
};

/** 현재 적용된 필터를 칩으로 표시 (✕로 개별 해제 + 초기화). 칩 모양 = 앱 FilterChip 선택 상태. */
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
    <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 0 2px", scrollbarWidth: "none" }}>
      {chips.map((c, i) => (
        <button key={i} onClick={c.remove} style={{ ...filterChip(true), height: 30, fontSize: 13 }}>
          {c.label}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color.primary[500]} strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      ))}
      <button
        // 초기화 = 칩으로 보이는 필터만 해제. 지역(gus)은 칩이 아니라 상단 지역 버튼으로 관리하므로 유지.
        onClick={() => onChange({ gus: filter.gus })}
        style={{ flexShrink: 0, height: 30, padding: "0 10px", borderRadius: 999, border: "none", background: color.white, color: color.text.hint, fontSize: 13, fontWeight: 500, textDecoration: "underline", cursor: "pointer" }}
      >
        초기화
      </button>
    </div>
  );
}
