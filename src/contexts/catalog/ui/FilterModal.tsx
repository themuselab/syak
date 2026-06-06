import { useState } from "react";
import type { FilterCriteria } from "../domain/filters";
import type { PriceTier } from "../domain/shop";
import { CATEGORIES, type Category } from "../../../shared/domain/category";

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

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#fff",
          borderRadius: "18px 18px 0 0",
          padding: 20,
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 16px" }}>필터</h2>

        <Group title="분야">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={!!draft.categories?.includes(c)} onClick={() => toggleCat(c)}>
              {c}
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

        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button
            onClick={() => setDraft({ gu: initial.gu })}
            style={{ flex: 1, padding: 14, borderRadius: 12, border: "1px solid #ddd", background: "#fff", fontWeight: 700 }}
          >
            초기화
          </button>
          <button
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            style={{ flex: 2, padding: 14, borderRadius: 12, border: "none", background: "#ec4899", color: "#fff", fontWeight: 700 }}
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
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#666", marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 14px",
        borderRadius: 20,
        border: active ? "1.5px solid #ec4899" : "1.5px solid #e5e5e5",
        background: active ? "#fdeef6" : "#fff",
        color: active ? "#ec4899" : "#555",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
