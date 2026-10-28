import { useState } from "react";
import { color, radius, button, filterChip, sheetTitle, sectionTitle } from "../../../shared/ui/tokens";
import { SEOUL_GU, GYEONGGI_SI, INCHEON_GU, BUSAN_GU, DAEGU_GU, GWANGJU_GU, DAEJEON_GU, ULSAN_GU, SEJONG_SI, GYEONGSANG_SI, JEOLLA_SI, GANGWON_SI, CHUNGCHEONG_SI, JEJU_SI } from "../../../shared/domain/category";

type Props = {
  selected: string[];
  onApply: (gus: string[]) => void;
  onClose: () => void;
};

/** 지역(구/시) 다중 선택 — 여러 곳 동시 선택(합집합). 상단 칩에서 열리는 바텀 모달. */
export function RegionPicker({ selected, onApply, onClose }: Props) {
  const [sel, setSel] = useState<string[]>(selected);

  function toggle(g: string) {
    setSel((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

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
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* 스크롤 영역 */}
        <div style={{ overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", flex: 1 }}>
          <div style={{ padding: "20px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <h2 style={sheetTitle}>지역 선택</h2>
              {sel.length > 0 && (
                <button onClick={() => setSel([])} style={{ border: "none", background: "transparent", color: color.text.hint, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                  전체 해제
                </button>
              )}
            </div>
            <p style={{ fontSize: 13, color: color.primary[500], background: color.primary[50], padding: "8px 12px", borderRadius: radius.sm, margin: "0 0 16px", fontWeight: 500 }}>
              여러 지역 동시 선택 가능 — 예: 강남구 + 강동구 같이 보기
            </p>
          </div>

          <Section label="서울" items={SEOUL_GU} sel={sel} onToggle={toggle} />
          <Section label="경기" items={GYEONGGI_SI} sel={sel} onToggle={toggle} />
          <Section label="인천" items={INCHEON_GU} sel={sel} onToggle={toggle} strip="인천 " />
          <Section label="부산" items={BUSAN_GU} sel={sel} onToggle={toggle} strip="부산 " />
          <Section label="대구" items={DAEGU_GU} sel={sel} onToggle={toggle} strip="대구 " />
          <Section label="대전" items={DAEJEON_GU} sel={sel} onToggle={toggle} strip="대전 " />
          <Section label="울산" items={ULSAN_GU} sel={sel} onToggle={toggle} strip="울산 " />
          <Section label="광주" items={GWANGJU_GU} sel={sel} onToggle={toggle} strip="광주 " />
          <Section label="세종" items={SEJONG_SI} sel={sel} onToggle={toggle} />
          <Section label="강원" items={GANGWON_SI} sel={sel} onToggle={toggle} />
          <Section label="충청" items={CHUNGCHEONG_SI} sel={sel} onToggle={toggle} />
          <Section label="경상" items={GYEONGSANG_SI} sel={sel} onToggle={toggle} />
          <Section label="전라" items={JEOLLA_SI} sel={sel} onToggle={toggle} />
          <Section label="제주" items={JEJU_SI} sel={sel} onToggle={toggle} />
          <div style={{ height: 6 }} />
        </div>

        {/* 적용 버튼 (하단 고정 — 스크롤 영역 밖) */}
        <div style={{ flex: "none", padding: "12px 20px 16px", background: color.white, borderTop: `1px solid ${color.line.divider}` }}>
          <button
            onClick={() => {
              onApply(sel);
              onClose();
            }}
            style={{ ...button("primary"), width: "100%" }}
          >
            {sel.length === 0 ? "전체 지역 보기" : `${sel.length}개 지역 보기`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  items,
  sel,
  onToggle,
  strip,
}: {
  label: string;
  items: readonly string[];
  sel: string[];
  onToggle: (g: string) => void;
  strip?: string;
}) {
  return (
    <div style={{ padding: "0 20px 18px" }}>
      <p style={{ ...sectionTitle, fontSize: 14, color: color.gray[700], margin: "0 0 10px 2px" }}>{label}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.map((g) => (
          <Chip key={g} active={sel.includes(g)} onClick={() => onToggle(g)}>
            {strip ? g.replace(strip, "") : g}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    // 앱 FilterChip(선택 시 연분홍 배경 + 핑크 테두리·글씨)
    <button onClick={onClick} style={{ ...filterChip(active), height: 36, padding: "0 14px" }}>
      {children}
      {active && <span style={{ fontSize: 12 }}>✕</span>}
    </button>
  );
}
