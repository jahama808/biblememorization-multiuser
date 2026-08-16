import { DEFAULT_TIMEZONE } from './types';

export function todayInTimeZone(timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Next Monday on or after `today`. If today is Monday, returns today. */
export function nextMonday(today: string): string {
  const dow = dayOfWeek(today);
  if (dow === 1) return today;
  const add = dow === 0 ? 1 : 8 - dow;
  return addDays(today, add);
}

export function nextSundayOnOrAfter(date: string): string {
  const dow = dayOfWeek(date);
  if (dow === 0) return date;
  return addDays(date, 7 - dow);
}

export function formatDisplayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
