import { useState } from "react";
import { color, radius, button, selectChip, sheetTitle, sectionTitle } from "../../../shared/ui/tokens";
import type { FilterCriteria } from "../domain/filters";
import { SORT_OPTIONS } from "../domain/filters";
import type { PriceTier } from "../domain/shop";
import { CATEGORIES, SERVICE_FILTERS, type Category } from "../../../shared/domain/category";

const PRICE_TIERS: PriceTier[] = ["1만원대", "2만원대", "3만원대", "4만원이상"];

type Props = {
  initial: FilterCriteria;
  onApply: (c: FilterCriteria) => void;
  onClose: () => void;
};

/** 가격대 · 혜택 · 예약가능 복합 필터. 초기화 포함. */
export function FilterModal({ initial, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<FilterCriteria>(initial);

  const toggleCat = (c: Category) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories?.includes(c)
        ? d.categories.filter((x) => x !== c)
        : [...(d.categories ?? []), c],
    }));

  const togglePrice = (p: PriceTier) =>
    setDraft((d) => ({
      ...d,
      priceTiers: d.priceTiers?.includes(p)
        ? d.priceTiers.filter((x) => x !== p)
        : [...(d.priceTiers ?? []), p],
    }));

  const toggleService = (s: string) =>
    setDraft((d) => ({
      ...d,
      services: d.services?.includes(s)
        ? d.services.filter((x) => x !== s)
        : [...(d.services ?? []), s],
    }));

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, background: color.overlay.dim }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderRadius: `${radius.lg}px ${radius.lg}px 0 0`,
          padding: 20,
          maxHeight: "80vh",
          overflowY: "auto",
          overscrollBehavior: "contain",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <h2 style={{ ...sheetTitle, textAlign: "center", paddingBottom: 12, margin: "0 -20px 20px", borderBottom: `1px solid ${color.line.divider}` }}>필터</h2>

        <Group title="정렬">
          {SORT_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              active={(draft.sortBy ?? "recommend") === o.key}
              onClick={() => setDraft((d) => ({ ...d, sortBy: o.key }))}
            >
              {o.label}
            </Chip>
          ))}
        </Group>

        <Group title="분야">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={!!draft.categories?.includes(c)} onClick={() => toggleCat(c)}>
              {c}
            </Chip>
          ))}
        </Group>

        <Group title="시술">
          {SERVICE_FILTERS.map((s) => (
            <Chip key={s} active={!!draft.services?.includes(s)} onClick={() => toggleService(s)}>
              {s}
            </Chip>
          ))}
        </Group>

        <Group title="가격대">
          {PRICE_TIERS.map((p) => (
            <Chip key={p} active={!!draft.priceTiers?.includes(p)} onClick={() => togglePrice(p)}>
              {p}
            </Chip>
          ))}
        </Group>

        <Group title="혜택 · 예약">
          <Chip active={!!draft.hasEventOnly} onClick={() => setDraft((d) => ({ ...d, hasEventOnly: !d.hasEventOnly }))}>
            이벤트·할인
          </Chip>
          <Chip active={!!draft.firstVisitOnly} onClick={() => setDraft((d) => ({ ...d, firstVisitOnly: !d.firstVisitOnly }))}>
            첫방문특가
          </Chip>
          <Chip active={!!draft.reservableOnly} onClick={() => setDraft((d) => ({ ...d, reservableOnly: !d.reservableOnly }))}>
            예약가능
          </Chip>
        </Group>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={() => setDraft({ gus: initial.gus, sortBy: initial.sortBy })}
            style={{ ...button("secondary"), flex: 1 }}
          >
            초기화
          </button>
          <button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            style={{ ...button("primary"), flex: 2 }}
          >
            적용하기
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={sectionTitle}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    // 앱 SelectChip: 선택 시 테두리·글씨만 핑크
    <button onClick={onClick} style={selectChip(active)}>
      {children}
    </button>
  );
}
