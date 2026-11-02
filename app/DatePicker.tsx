'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDateEs, monthGrid } from '../lib/calendar.ts';

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' });
const monthTitle = fmt({ month: 'long', year: 'numeric' });
const dayLabel = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const weekdayShort = fmt({ weekday: 'long' });
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

type Props = { id: string; value: string; min: string; max: string; onChange: (date: string) => void };

export default function DatePicker({ id, value, min, max, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const toggle = () => {
    const d = asDate(value || min);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    setOpen(!open);
  };
  const shift = (delta: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + delta) / 12), m: (m + delta + 12) % 12 }));
  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const current = monthKey(view.y, view.m);

  return (
    <div className="datepicker" ref={box}>
      <button id={id} type="button" className="date-button" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        {value ? <>{formatDateEs(value)} <span className="weekday">{weekdayShort.format(asDate(value))}</span></> : 'Elegir fecha'}
      </button>
      {open && (
        <div className="calendar" role="dialog" aria-label="Elegir día del viaje">
          <div className="calendar-head">
            <button type="button" aria-label="Mes anterior" disabled={current <= min.slice(0, 7)} onClick={() => shift(-1)}>‹</button>
            <span className="calendar-title">{monthTitle.format(asDate(`${current}-01`))}</span>
            <button type="button" aria-label="Mes siguiente" disabled={current >= max.slice(0, 7)} onClick={() => shift(1)}>›</button>
          </div>
          <table>
            <thead><tr>{WEEKDAYS.map((w) => <th key={w} scope="col">{w}</th>)}</tr></thead>
            <tbody>
              {monthGrid(view.y, view.m).map((week, i) => (
                <tr key={i}>
                  {week.map((d, j) => (
                    <td key={j}>
                      {d && (
                        <button
                          type="button"
                          className={d === value ? 'selected' : d === min ? 'today' : undefined}
                          aria-label={dayLabel.format(asDate(d))}
                          aria-pressed={d === value}
                          disabled={d < min || d > max}
                          onClick={() => { onChange(d); setOpen(false); }}
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
