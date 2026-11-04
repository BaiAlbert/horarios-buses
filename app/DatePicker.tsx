'use client';

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { formatDateEs, monthGrid } from '../lib/calendar.ts';
import { addDays } from '../lib/rules.ts';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' });
const monthTitle = fmt({ month: 'long', year: 'numeric' });
const dayLabel = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const weekdayShort = fmt({ weekday: 'long' });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const GRID_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

type Props = { id: string; value: string; min: string; max: string; onChange: (date: string) => void };

export default function DatePicker({ id, value, min, max, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') close(true); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // el foco entra en el calendario: el día elegido, o el primero disponible
    box.current?.querySelector<HTMLElement>('td button[tabindex="0"]')?.focus();
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => {
    const d = asDate(value || min);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    setOpen(!open);
  };
  const shift = (delta: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + delta) / 12), m: (m + delta + 12) % 12 }));
  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const current = monthKey(view.y, view.m);

  // flechas dentro del mes visible; un solo día tabulable (el resto se alcanza con flechas)
  const onGridKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const date = (e.target as HTMLElement).dataset.date;
    if (!date || !(e.key in GRID_STEP)) return;
    e.preventDefault();
    box.current?.querySelector<HTMLElement>(`[data-date="${addDays(date, GRID_STEP[e.key])}"]:not(:disabled)`)?.focus();
  };
  const onBlur = (e: FocusEvent) => {
    if (e.relatedTarget && !box.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const grid = monthGrid(view.y, view.m);
  const enabled = (d: string) => d >= min && d <= max;
  const tabStop = value.startsWith(current) && enabled(value) ? value : grid.flat().find((d) => d && enabled(d));

  return (
    <div className="datepicker" ref={box} onBlur={onBlur}>
      <button ref={trigger} id={id} type="button" className="date-button" aria-haspopup="dialog" aria-expanded={open} disabled={!min} onClick={toggle}>
        {value ? <>{formatDateEs(value)} <span className="weekday">{weekdayShort.format(asDate(value))}</span></> : 'Elegir fecha'}
        <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="calendar glass blur" role="dialog" aria-label="Elegir día del viaje">
          <div className="calendar-head">
            <button type="button" className="press" aria-label="Mes anterior" disabled={current <= min.slice(0, 7)} onClick={() => shift(-1)}>‹</button>
            <span className="calendar-title" aria-live="polite">{monthTitle.format(asDate(`${current}-01`))}</span>
            <button type="button" className="press" aria-label="Mes siguiente" disabled={current >= max.slice(0, 7)} onClick={() => shift(1)}>›</button>
          </div>
          <table onKeyDown={onGridKey}>
            <thead><tr>{WEEKDAYS.map((w) => <th key={w} scope="col">{w}</th>)}</tr></thead>
            <tbody>
              {grid.map((week, i) => (
                <tr key={i}>
                  {week.map((d, j) => (
                    <td key={j}>
                      {d && (
                        <button
                          type="button"
                          data-date={d}
                          tabIndex={d === tabStop ? 0 : -1}
                          className={d === value ? 'selected' : d === min ? 'today' : undefined}
                          aria-label={dayLabel.format(asDate(d))}
                          aria-pressed={d === value}
                          disabled={!enabled(d)}
                          onClick={() => { onChange(d); close(true); }}
                        >
                          {Number(d.slice(8))}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
