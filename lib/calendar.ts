// Calendario propio: el <input type="date"> nativo usa el idioma del navegador (formato y primer día de la semana).

export function formatDateEs(date: string): string {
  return date.split('-').reverse().join('/'); // 2026-11-03 → 03/11/2026
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
