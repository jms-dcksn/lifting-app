"use client";

import { useEffect, useRef, useState } from "react";
import { calendarDays, MIN_WEIGHT_DATE, shiftDate, shiftMonth, weightDateLabel } from "@/lib/weight-calendar";
import { Button } from "./button";
import { Input } from "./input";
import { cx } from "./cx";

export function Calendar({ month, selected, today, markers, unmarkedDayLabel = "no reading", disabled, onMonth, onSelect }: {
  month: string;
  selected: string;
  today: string;
  markers: Record<string, string>;
  unmarkedDayLabel?: string;
  disabled?: boolean;
  onMonth: (month: string) => void;
  onSelect: (date: string) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef(false);
  const [focused, setFocused] = useState(selected);
  const days = calendarDays(month);
  const tabDate = focused.startsWith(month) ? focused : `${month}-01`;
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));

  useEffect(() => {
    if (focusAfterRender.current) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
      focusAfterRender.current = false;
    }
  }, [focused, month]);

  function keyboard(event: React.KeyboardEvent, day: string) {
    let target: string;
    const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 })[event.key];
    if (offset != null) target = shiftDate(day, offset);
    else if (event.key === "Home") target = shiftDate(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    else if (event.key === "End") target = shiftDate(day, 6 - ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const next = shiftMonth(month, event.key === "PageUp" ? -1 : 1);
      target = `${next}-01`;
    } else return;
    event.preventDefault();
    if (target < MIN_WEIGHT_DATE || target > today || target.length !== 10) return;
    focusAfterRender.current = true;
    setFocused(target);
    if (!target.startsWith(month)) onMonth(target.slice(0, 7));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" aria-label="Previous month" disabled={disabled || month === "0001-01"}
          onClick={() => onMonth(shiftMonth(month, -1))}>←</Button>
        <p aria-live="polite" className="text-body font-semibold">{label}</p>
        <Button type="button" variant="ghost" aria-label="Next month" disabled={disabled || month >= today.slice(0, 7)}
          onClick={() => onMonth(shiftMonth(month, 1))}>→</Button>
      </div>
      <div ref={grid} role="grid" aria-label={label} aria-describedby="calendar-grid-help" className="flex flex-col gap-1">
        <div role="row" className="grid grid-cols-7">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
            <span role="columnheader" key={day} className="py-1 text-center text-caption text-muted">{day}</span>
          ))}
        </div>
        {Array.from({ length: days.length / 7 }, (_, row) => (
          <div role="row" key={row} className="grid grid-cols-7 gap-1">
            {days.slice(row * 7, row * 7 + 7).map((day, col) => (
              <div role="gridcell" key={day ?? col} aria-selected={day === selected}>
                {day && <button type="button" data-date={day} disabled={disabled || day > today}
                  tabIndex={day === tabDate ? 0 : -1} aria-pressed={day === selected}
                  aria-current={day === today ? "date" : undefined}
                  aria-label={`${weightDateLabel(day)}${day === today ? ", today" : ""}${markers[day] ? `, ${markers[day]}` : `, ${unmarkedDayLabel}`}`}
                  onFocus={() => setFocused(day)} onKeyDown={event => keyboard(event, day)} onClick={() => onSelect(day)}
                  className={cx("relative flex min-h-11 w-full flex-col items-center justify-center rounded-control border text-body tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground disabled:opacity-30",
                    day === selected ? "border-foreground bg-foreground text-background" : "border-transparent hover:bg-surface",
                    day === today && day !== selected && "border-border-strong")}>
                  {Number(day.slice(-2))}
                  {markers[day] && <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-current" />}
                </button>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p id="calendar-grid-help" className="absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0">
        Use arrow keys to browse days.
      </p>
      <div className="flex min-w-0 items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-caption text-muted">Jump to month
          <Input type="month" aria-label="Jump to month" value={month} min="0001-01" max={today.slice(0, 7)} disabled={disabled}
            className="min-w-0 max-w-full appearance-none"
            onChange={event => {
              const next = event.target.value;
              if (/^\d{4}-\d{2}$/.test(next) && next >= "0001-01" && next <= today.slice(0, 7)) onMonth(next);
            }} />
        </label>
        <Button type="button" variant="secondary" disabled={disabled} onClick={() => { onMonth(today.slice(0, 7)); onSelect(today); }}>Today</Button>
      </div>
    </div>
  );
}
