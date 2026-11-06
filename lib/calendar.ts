// Calendario propio: el <input type="date"> nativo usa el idioma del navegador (formato y primer día de la semana).

const madridFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
export const madridTime = (iso: string) => madridFmt.format(new Date(iso));

export function formatDateEs(date: string): string {
  return date.split('-').reverse().join('/'); // 2026-11-03 → 03/11/2026
}

/** 01:35 → «1 h 35 min» (a la vista) y «1 hora 35 minutos» (lectores de pantalla). Formato desconocido: tal cual. */
export function formatDuration(d: string): { short: string; long: string } {
  const m = d.match(/^(\d+):(\d\d)$/);
  const part = (n: number, abbr: string, word: string) => (n ? { short: `${n} ${abbr}`, long: `${n} ${word}${n === 1 ? '' : 's'}` } : null);
  const parts = m ? [part(Number(m[1]), 'h', 'hora'), part(Number(m[2]), 'min', 'minuto')].filter((p) => p !== null) : [];
  if (!parts.length) return { short: d, long: d };
  return { short: parts.map((p) => p.short).join(' '), long: parts.map((p) => p.long).join(' ') };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Semanas del mes (lunes→domingo) con fechas YYYY-MM-DD; null fuera del mes. month0: 0 = enero. */
export function monthGrid(year: number, month0: number): (string | null)[][] {
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const cells: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
