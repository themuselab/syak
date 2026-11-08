import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { color, selectChip } from "../../../shared/ui/tokens";
import { Icon } from "../../../shared/ui/Icon";
import type { FilterCriteria } from "../domain/filters";
import { SORT_OPTIONS } from "../domain/filters";
import {
  CATEGORIES,
  SERVICE_FILTERS,
  type Category,
} from "../../../shared/domain/category";
import type { CustomFind } from "./CustomFindModal";

type Props = {
  initial: FilterCriteria;
  initialTime?: CustomFind | null;
  initialSection?: "sort" | "price" | "time";
  onTimeChange?: (value: CustomFind | null) => void;
  onApply: (value: FilterCriteria) => void;
  onClose: () => void;
};
const hours = Array.from(
  { length: 15 },
  (_, i) => String(i + 9).padStart(2, "0") + ":00",
);
const dateKey = (d: Date) =>
  d.getFullYear() +
  "-" +
  String(d.getMonth() + 1).padStart(2, "0") +
  "-" +
  String(d.getDate()).padStart(2, "0");
export function FilterModal({
  initial,
  initialTime,
  initialSection = "sort",
  onTimeChange,
  onApply,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(initial);
  const [min, setMin] = useState((initial.priceMin ?? 0) / 10000);
  const [max, setMax] = useState((initial.priceMax ?? 100000) / 10000);
  const [day, setDay] = useState<string | null>(initialTime?.date ?? null);
  const [times, setTimes] = useState<string[]>(initialTime?.hours ?? []);
  const content = useRef<HTMLDivElement>(null);
  const [days] = useState(() =>
    Array.from({ length: 3 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return {
        date: dateKey(d),
        label: ["오늘", "내일", "모레"][i],
        weekday: ["일", "월", "화", "수", "목", "금", "토"][d.getDay()],
      };
    }),
  );
  useEffect(() => {
    const e = content.current?.querySelector<HTMLElement>(
      '[data-filter-section="' + initialSection + '"]',
    );
    if (e && initialSection !== "sort")
      content.current?.scrollTo({ top: e.offsetTop - 16 });
  }, [initialSection]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const toggleCat = (c: Category) =>
    setDraft((d) => ({
      ...d,
      categories: d.categories?.includes(c)
        ? d.categories.filter((x) => x !== c)
        : [...(d.categories ?? []), c],
    }));
  const toggleService = (s: string) =>
    setDraft((d) => ({
      ...d,
      services: d.services?.includes(s)
        ? d.services.filter((x) => x !== s)
        : [...(d.services ?? []), s],
    }));
  function apply() {
    onApply({
      ...draft,
      priceMin: min > 0 ? min * 10000 : undefined,
      priceMax: max < 10 ? max * 10000 : undefined,
      priceTiers: min > 0 || max < 10 ? undefined : draft.priceTiers,
    });
    if (day) {
      const option = days.find((d) => d.date === day);
      const label = option?.label ?? day;
      onTimeChange?.({
        date: day,
        hours: times.length ? [...times].sort() : hours,
        chipLabel:
          label +
          (times.length
            ? " " +
              times[0] +
              (times.length > 1 ? " 외 " + (times.length - 1) : "")
            : ""),
        bannerLabel: label + " 예약 가능한 샵",
      });
    } else onTimeChange?.(null);
    onClose();
  }
  return (
    <div className="filter-backdrop" onClick={onClose}>
      <section
        className="filter-panel"
        role="dialog"
        aria-modal="true"
        aria-label="필터"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="filter-panel-heading">
          <h2>필터</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="필터 닫기"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="filter-panel-scroll" ref={content}>
          <Group title="정렬" id="sort">
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
          <section className="filter-group" data-filter-section="price">
            <h3>가격</h3>
            <div className="price-range-caption">
              <span>{min}만원</span>
              <span>
                {max}만원{max === 10 ? " 이상" : ""}
              </span>
            </div>
            <div
              className="price-range"
              style={
                {
                  "--range-min": `${min * 10}%`,
                  "--range-max": `${max * 10}%`,
                } as CSSProperties
              }
            >
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={min}
                aria-label="최소 가격"
                onChange={(e) => setMin(Math.min(Number(e.target.value), max))}
              />
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={max}
                aria-label="최대 가격"
                onChange={(e) => setMax(Math.max(Number(e.target.value), min))}
              />
            </div>
            <div className="price-inputs">
              <label>
                <input
                  aria-label="최소 가격 만원"
                  type="number"
                  min="0"
                  max={max}
                  value={min}
                  onChange={(e) =>
                    setMin(
                      Math.min(
                        max,
                        Math.max(0, Math.round(Number(e.target.value))),
                      ),
                    )
                  }
                />
                만원
              </label>
              <span>–</span>
              <label>
                <input
                  aria-label="최대 가격 만원"
                  type="number"
                  min={min}
                  max="10"
                  value={max}
                  onChange={(e) =>
                    setMax(
                      Math.max(
                        min,
                        Math.min(10, Math.round(Number(e.target.value))),
                      ),
                    )
                  }
                />
                {max === 10 ? "만원 이상" : "만원"}
              </label>
            </div>
          </section>
          <Group title="예약시간" id="time">
            <div className="filter-date-row">
              {days.map((d) => (
                <Chip
                  key={d.date}
                  active={day === d.date}
                  onClick={() => {
                    setDay(day === d.date ? null : d.date);
                    setTimes([]);
                  }}
                >
                  {d.label} ({d.weekday})
                </Chip>
              ))}
            </div>
            <div className="filter-time-grid">
              {hours.map((t) => (
                <Chip
                  key={t}
                  active={times.includes(t)}
                  onClick={() => {
                    if (!day) setDay(days[0].date);
                    setTimes((prev) =>
                      prev.includes(t)
                        ? prev.filter((x) => x !== t)
                        : [...prev, t],
                    );
                  }}
                >
                  {t.replace(/^0/, "")}
                </Chip>
              ))}
            </div>
          </Group>
          <details className="filter-advanced">
            <summary>분야 · 시술 · 혜택</summary>
            <Group title="분야">
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  active={!!draft.categories?.includes(c)}
                  onClick={() => toggleCat(c)}
                >
                  {c}
                </Chip>
              ))}
            </Group>
            <Group title="시술">
              {SERVICE_FILTERS.map((s) => (
                <Chip
                  key={s}
                  active={!!draft.services?.includes(s)}
                  onClick={() => toggleService(s)}
                >
                  {s}
                </Chip>
              ))}
            </Group>
            <Group title="혜택 · 예약">
              <Chip
                active={!!draft.hasEventOnly}
                onClick={() =>
                  setDraft((d) => ({ ...d, hasEventOnly: !d.hasEventOnly }))
                }
              >
                할인·이벤트
              </Chip>
              <Chip
                active={!!draft.firstVisitOnly}
                onClick={() =>
                  setDraft((d) => ({ ...d, firstVisitOnly: !d.firstVisitOnly }))
                }
              >
                첫방문 특가
              </Chip>
              <Chip
                active={!!draft.reservableOnly}
                onClick={() =>
                  setDraft((d) => ({ ...d, reservableOnly: !d.reservableOnly }))
                }
              >
                예약 가능
              </Chip>
            </Group>
          </details>
        </div>
        <footer className="filter-panel-footer">
          <button
            onClick={() => {
              setDraft({ gus: initial.gus });
              setMin(0);
              setMax(10);
              setDay(null);
              setTimes([]);
            }}
          >
            초기화
          </button>
          <button onClick={apply}>적용하기</button>
        </footer>
      </section>
    </div>
  );
}
function Group({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section className="filter-group" data-filter-section={id}>
      <h3>{title}</h3>
      <div className="filter-choices">{children}</div>
    </section>
  );
}
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={selectChip(active, color.brand.deep)}
    >
      {children}
    </button>
  );
}
