import { SEOUL_GU, GYEONGGI_SI, INCHEON_GU } from "../../../shared/domain/category";

type Props = {
  current?: string;
  onSelect: (gu?: string) => void;
  onClose: () => void;
};

/** 지역(자치구) 선택 — 상단 칩에서 열리는 바텀 모달. */
export function RegionPicker({ current, onSelect, onClose }: Props) {
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
          maxHeight: "70vh",
          overflowY: "auto",
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 16px" }}>지역 선택</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          <Chip active={!current} onClick={() => sel(undefined)}>
            전체
          </Chip>
        </div>
        <p style={sectionLabel}>서울</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {SEOUL_GU.map((g) => (
            <Chip key={g} active={current === g} onClick={() => sel(g)}>
              {g}
            </Chip>
          ))}
        </div>
        <p style={sectionLabel}>경기</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
          {GYEONGGI_SI.map((g) => (
            <Chip key={g} active={current === g} onClick={() => sel(g)}>
              {g}
            </Chip>
          ))}
        </div>
        <p style={sectionLabel}>인천</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {INCHEON_GU.map((g) => (
            <Chip key={g} active={current === g} onClick={() => sel(g)}>
              {g.replace("인천 ", "")}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );

  function sel(g?: string) {
    onSelect(g);
    onClose();
  }
}

const sectionLabel: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#999", margin: "0 0 10px 2px" };

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
