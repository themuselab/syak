import { useState } from "react";
import { usecases } from "../../../app/composition-root";

type Props = { onClose: () => void };

/** 취소석/빈자리 매칭 서비스 출시 알림 사전등록 (전화번호). */
export function MissedAlertSheet({ onClose }: Props) {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "done" | "invalid">("idle");

  async function submit() {
    const res = await usecases.lead.registerAlert({ phoneRaw: phone });
    if (res.ok) setState("done");
    else setState("invalid");
  }

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
          padding: 24,
        }}
      >
        {state === "done" ? (
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: "#ec4899", color: "#fff", fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>✓</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "14px 0 6px" }}>신청 완료!</h2>
            <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
              빈자리 자동 매칭 서비스가 나오면 가장 먼저 알려드릴게요.
            </p>
            <button onClick={onClose} style={{ marginTop: 20, padding: 14, width: "100%", borderRadius: 12, border: "none", background: "#ec4899", color: "#fff", fontWeight: 700 }}>
              닫기
            </button>
          </div>
        ) : (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 6px" }}>
              빈자리 자동 매칭, 먼저 받아보기
            </h2>
            <p style={{ fontSize: 14, color: "#666", margin: "0 0 16px", lineHeight: 1.5 }}>
              원하는 시간에 취소석이 나면 바로 알려드리는 서비스, 출시되면 가장 먼저 알려드릴게요.
            </p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setState("idle");
              }}
              style={{
                width: "100%",
                padding: 14,
                fontSize: 16,
                borderRadius: 12,
                border: state === "invalid" ? "1.5px solid #e74c3c" : "1.5px solid #e5e5e5",
                boxSizing: "border-box",
              }}
            />
            {state === "invalid" && (
              <div style={{ color: "#e74c3c", fontSize: 12, marginTop: 6 }}>휴대폰 번호를 확인해주세요</div>
            )}
            <button
              onClick={submit}
              style={{ marginTop: 16, padding: 14, width: "100%", borderRadius: 12, border: "none", background: "#ec4899", color: "#fff", fontWeight: 700, fontSize: 15 }}
            >
              신청하기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
