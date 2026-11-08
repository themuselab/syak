import { useState } from "react";
import { CATEGORIES, type Category } from "../../../shared/domain/category";
import { Icon } from "../../../shared/ui/Icon";
import { color, filterChip, mapChip } from "../../../shared/ui/tokens";

const base = import.meta.env.BASE_URL;

export function HomeHeader({
  query,
  onQueryChange,
  category,
  partner,
  onPick,
  onClear,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  category?: Category;
  partner: boolean;
  onPick: (value: Category | "partner") => void;
  onClear: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const picked = partner ? "샥 파트너샵" : category;
  return (
    <>
      <div className="home-search">
        {focused || picked ? (
          <button
            className="icon-button"
            aria-label="검색으로 돌아가기"
            onClick={() => {
              if (picked) onClear();
              else (document.activeElement as HTMLElement)?.blur();
            }}
          >
            <Icon name="back" size={22} />
          </button>
        ) : (
          <img
            src={`${base}brand/syak-symbol-pink.png`}
            alt="샥"
            width={40}
            height={40}
          />
        )}
        {picked ? (
          <span className="search-selection">{picked}</span>
        ) : (
          <input
            aria-label="샵 검색"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="샵, 시술, 동네 검색"
          />
        )}
        {picked || query ? (
          <button
            className="icon-button"
            aria-label={picked ? "분야 선택 해제" : "검색어 지우기"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (picked) onClear();
              else onQueryChange("");
            }}
          >
            <Icon name="close" size={18} />
          </button>
        ) : (
          !focused && (
            <a
              href="https://app.themuselab.kr/my"
              className="icon-button"
              aria-label="마이페이지"
            >
              <img
                src={`${base}brand/profile.png`}
                width={30}
                height={30}
                alt=""
              />
            </a>
          )
        )}
      </div>
      {!focused && !picked && (
        <nav className="home-categories" aria-label="시술 분야">
          <button
            onClick={() => onPick("partner")}
            style={{
              ...mapChip(),
              background: color.brand.tint,
              borderColor: color.primary[300],
              color: color.primary[500],
            }}
          >
            <img
              src={`${base}brand/syak-symbol-pink.png`}
              width={24}
              height={24}
              alt=""
              style={{ marginLeft: -5, marginRight: -2 }}
            />
            샥 파트너샵
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} style={mapChip()} onClick={() => onPick(c)}>
              {c}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

export function HomeFilters({
  active,
  onToggle,
  sortLabel,
  priceLabel,
  timeLabel,
  regionLabel,
  onSort,
  onPrice,
  onTime,
  onRegion,
}: {
  active: string | null;
  onToggle: (value: "today" | "event" | null) => void;
  sortLabel: string;
  priceLabel?: string;
  timeLabel?: string;
  regionLabel?: string;
  onSort: () => void;
  onPrice: () => void;
  onTime: () => void;
  onRegion: () => void;
}) {
  return (
    <div className="home-filters">
      <div className="home-filter-scroll" aria-label="샵 필터">
        {(
          [
            ["today", "당일 예약", "chip-sameday.png"],
            ["event", "할인·이벤트", "chip-discount.png"],
          ] as const
        ).map(([key, label, image]) => (
          <button
            key={key}
            aria-pressed={active === key}
            style={filterChip(active === key)}
            onClick={() => onToggle(active === key ? null : key)}
          >
            <img src={`${base}map/${image}`} width={15} height={15} alt="" />
            {label}
          </button>
        ))}
        <span className="filter-divider" />
        <button style={filterChip(sortLabel !== "관련도순")} onClick={onSort}>
          {sortLabel}
          <Icon name="down" size={14} />
        </button>
        <button style={filterChip(!!priceLabel)} onClick={onPrice}>
          {priceLabel || "가격"}
          <Icon name="down" size={14} />
        </button>
        <button style={filterChip(!!timeLabel)} onClick={onTime}>
          {timeLabel || "예약시간"}
          <Icon name="down" size={14} />
        </button>
        <button style={filterChip(!!regionLabel)} onClick={onRegion}>
          {regionLabel || "지역"}
          <Icon name="down" size={14} />
        </button>
      </div>
      <button
        className="filter-settings"
        aria-label="전체 필터"
        onClick={onSort}
      >
        <Icon name="sliders" size={16} />
      </button>
    </div>
  );
}
