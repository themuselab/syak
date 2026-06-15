import { useState } from "react";

export type CustomFind = {
  date: string; // "2026-06-07"
  hour: string; // "14:00"
  chipLabel: string; // "화요일 2시"
  bannerLabel: string; // "6월 10일 (화) 오후 2시 · 방금 기준"
};

const DAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

type Props = {
  onApply: (f: CustomFind) => void;
  onClose: () => void;
};

/** 빈자리 찾기 — 날짜/시간 선택. (실시간 슬롯은 예약 도메인=AWS 추후, 지금은 예약가능 샵으로 필터) */
export function CustomFindModal({ onApply, onClose }: Props) {
  const today = new Date();
  const dayOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const [dayIdx, setDayIdx] = useState(1); // 기본 '내일' (배치 수집 날짜)
  const [hour, setHour] = useState(14);

  function apply() {
    const d = dayOptions[dayIdx];
    const dow = DAYS_KO[d.getDay()];
    const ampm = hour < 12 ? "오전" : "오후";
    const h12 = hour <= 12 ? hour : hour - 12;
    const chipLabel = `${dow}요일 ${h12}시`;
    const bannerLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow}) ${ampm} ${h12}시 · 방금 기준`;
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    onApply({ date: ymd, hour: `${String(hour).padStart(2, "0")}:00`, chipLabel, bannerLabel });
    onClose();
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,.35)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "18px 18px 0 0", padding: 22, maxHeight: "80vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>빈자리 찾기</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ border: "none", background: "#f2f2f4", color: "#888", width: 30, height: 30, borderRadius: 15, fontSize: 17, lineHeight: 1, cursor: "pointer", flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
        <p style={{ fontSize: 13, color: "#888", margin: "0 0 18px" }}>원하는 날짜·시간에 예약 가능한 샵을 찾아드려요</p>

        <Group title="날짜">
          {dayOptions.map((d, i) => {
            const label = i === 0 ? "오늘" : i === 1 ? "내일" : `${d.getMonth() + 1}/${d.getDate()}(${DAYS_KO[d.getDay()]})`;
            return (
              <Chip key={i} active={dayIdx === i} onClick={() => setDayIdx(i)}>
                {label}
              </Chip>
            );
          })}
        </Group>

        <Group title="시간">
          {HOURS.map((h) => (
            <Chip key={h} active={hour === h} onClick={() => setHour(h)}>
              {h <= 12 ? `오전 ${h}시` : `오후 ${h - 12}시`}
            </Chip>
          ))}
        </Group>

        <button
          onClick={apply}
          style={{ marginTop: 22, padding: 15, width: "100%", borderRadius: 14, border: "none", background: "#ec4899", color: "#fff", fontWeight: 800, fontSize: 15 }}
        >
          이 시간에 가능한 샵 찾기
        </button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#666", marginBottom: 9 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "9px 14px",
        borderRadius: 20,
        border: active ? "1.5px solid #ec4899" : "1.5px solid #e5e5e5",
        background: active ? "#fdeef2" : "#fff",
        color: active ? "#ec4899" : "#555",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
