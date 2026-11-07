// CALENDARIO PARA ELEGIR EL DÍA DEL VIAJE.
// Es un botón que muestra la fecha elegida; al pulsarlo se despliega un calendario mensual.
// Se hace a mano (en vez del <input type="date"> del navegador) para que siempre esté en español,
// con la semana empezando en lunes, y para que solo se puedan elegir los días permitidos (min a max).
// Se puede usar entero con teclado: flechas para moverse por los días, Escape para cerrar.
'use client';

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { formatDateEs, monthGrid } from '../lib/calendar.ts';
import { addDays } from '../lib/rules.ts';

// Cabecera de la tabla: letra visible y nombre completo para lectores de pantalla.
const WEEKDAYS = [['L', 'lunes'], ['M', 'martes'], ['X', 'miércoles'], ['J', 'jueves'], ['V', 'viernes'], ['S', 'sábado'], ['D', 'domingo']];
// Formateadores de fechas en español. Se usa UTC porque las fechas se crean a medianoche UTC (asDate),
// y así no se "corre" el día por la zona horaria.
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' });
const monthTitle = fmt({ month: 'long', year: 'numeric' }); // "noviembre de 2026"
const dayLabel = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); // "martes, 3 de noviembre de 2026"
const weekdayShort = fmt({ weekday: 'long' }); // "martes"
const asDate = (d: string) => new Date(`${d}T00:00:00Z`); // "2026-11-03" → objeto Date
// Cuántos días se mueve el foco con cada flecha: izquierda/derecha un día, arriba/abajo una semana.
const GRID_STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

// Props: id del botón (lo usa la etiqueta «Día del viaje»), fecha elegida, fechas mínima y máxima
// permitidas (todas "AAAA-MM-DD") y la función a la que se avisa cuando el usuario elige otro día.
type Props = { id: string; value: string; min: string; max: string; onChange: (date: string) => void };

export default function DatePicker({ id, value, min, max, onChange }: Props) {
  const [open, setOpen] = useState(false); // ¿el calendario está abierto?
  const [shown, setShown] = useState(false); // sigue en el DOM tras cerrar hasta que acaba la animación de salida
  const [view, setView] = useState({ y: 0, m: 0 }); // mes que se está viendo (año y mes, 0 = enero)
  // Referencias a elementos HTML reales de la página, para enfocarlos o comprobar dónde se hizo clic.
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus(); // devuelve el foco al botón, para quien usa teclado
  };

  // Mientras el calendario está abierto: cerrarlo si se hace clic fuera o se pulsa Escape.
  // Se vuelve a ejecutar cada vez que cambia `open` o `id` (la lista del final).
  useEffect(() => {
    if (!open) return;
    // la etiqueta «Día del viaje» reenvía su clic al botón: que lo resuelva toggle (cerrar aquí y reabrir allí repetía la animación)
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!box.current?.contains(t) && !t.closest?.(`label[for="${id}"]`)) setOpen(false);
    };
    // no usa close(): cambia en cada render y repetiría el foco de abajo
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    // el foco entra en el calendario: el día elegido, o el primero disponible
    box.current?.querySelector<HTMLElement>('td button[tabindex="0"]')?.focus();
    // Al cerrar, se quitan los "escuchadores" para no dejarlos funcionando sin calendario.
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, id]);

  // Abre o cierra el calendario. Al abrir, muestra el mes de la fecha elegida (o el de hoy, `min`).
  const toggle = () => {
    if (open) return setOpen(false);
    const d = asDate(value || min);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
    setShown(true);
    setOpen(true);
  };
  // Avanza o retrocede meses (delta = +1 / -1), pasando de año si hace falta (diciembre → enero).
  const shift = (delta: number) => setView(({ y, m }) => ({ y: y + Math.floor((m + delta) / 12), m: (m + delta + 12) % 12 }));
  const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`; // → "2026-11"
  const current = monthKey(view.y, view.m);

  // flechas dentro del mes visible; un solo día tabulable (el resto se alcanza con flechas)
  const onGridKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const date = (e.target as HTMLElement).dataset.date; // el data-date del día que tiene el foco
    if (!date || !(e.key in GRID_STEP)) return;
    e.preventDefault(); // que las flechas no desplacen la página
    box.current?.querySelector<HTMLElement>(`[data-date="${addDays(date, GRID_STEP[e.key])}"]:not(:disabled)`)?.focus();
  };
  // Si el foco sale del calendario (p. ej. con Tab), se cierra.
  const onBlur = (e: FocusEvent) => {
    if (e.relatedTarget && !box.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  const grid = monthGrid(view.y, view.m); // semanas del mes visible (ver lib/calendar.ts)
  const enabled = (d: string) => d >= min && d <= max; // ¿se puede elegir ese día?
  // El único día al que se llega con Tab: el elegido si está en este mes, o el primero disponible.
  const tabStop = value.startsWith(current) && enabled(value) ? value : grid.flat().find((d) => d && enabled(d));

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: solo detecta que el foco sale del calendario; no es un control
    <div className="datepicker" ref={box} onBlur={onBlur}>
      {/* El botón que muestra la fecha: "03/11/2026 martes". Desactivado hasta saber qué día es hoy (min) */}
      <button ref={trigger} id={id} type="button" className="date-button" aria-haspopup="dialog" aria-expanded={open} disabled={!min} onClick={toggle}>
        {value ? <>{formatDateEs(value)} <span className="weekday">{weekdayShort.format(asDate(value))}</span></> : 'Elegir fecha'}
        <svg className="chev" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 6 8 10.5 12.5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* El calendario desplegable. data-closing activa la animación de cierre en el CSS; al acabar, se quita del todo (setShown(false)) */}
      {shown && (
        <div
          className="calendar glass blur"
          role="dialog"
          aria-label="Elegir día del viaje"
          data-closing={!open || undefined}
          inert={!open}
          onAnimationEnd={(e) => { if (!open && e.target === e.currentTarget) setShown(false); }}
        >
          {/* Cabecera: ‹ noviembre de 2026 ›. No deja ir a meses fuera del rango permitido */}
          <div className="calendar-head">
            <button type="button" className="press" aria-label="Mes anterior" disabled={current <= min.slice(0, 7)} onClick={() => shift(-1)}>‹</button>
            <span className="calendar-title" aria-live="polite">{monthTitle.format(asDate(`${current}-01`))}</span>
            <button type="button" className="press" aria-label="Mes siguiente" disabled={current >= max.slice(0, 7)} onClick={() => shift(1)}>›</button>
          </div>
          {/* La cuadrícula: una fila por semana, una celda por día (vacía si es un hueco) */}
          <table onKeyDown={onGridKey}>
            <thead><tr>{WEEKDAYS.map(([letter, name]) => <th key={letter} scope="col"><span aria-hidden="true">{letter}</span><span className="sr">{name}</span></th>)}</tr></thead>
            <tbody>
              {grid.map((week, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: semanas y celdas se definen por su posición en el mes; no se reordenan
                <tr key={i}>
                  {week.map((d, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: ídem
                    <td key={j}>
                      {d && (
                        // Un botón por día. Se marca el elegido (selected) y el de hoy (today); fuera de rango, desactivado.
                        <button
                          type="button"
                          data-date={d}
                          tabIndex={d === tabStop ? 0 : -1}
                          className={d === value ? 'selected' : d === min ? 'today' : undefined}
                          aria-label={dayLabel.format(asDate(d))}
                          aria-pressed={d === value}
                          aria-current={d === min ? 'date' : undefined}
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
