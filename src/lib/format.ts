import { tr } from './i18n'

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < MIN) return tr('time.justNow')
  if (diff < HOUR) return tr('time.minAgo', { n: Math.floor(diff / MIN) })
  if (diff < DAY) return tr('time.hourAgo', { n: Math.floor(diff / HOUR) })
  if (diff < DAY * 7) return tr('time.dayAgo', { n: Math.floor(diff / DAY) })
  if (diff < DAY * 30) return tr('time.weekAgo', { n: Math.floor(diff / (DAY * 7)) })
  if (diff < DAY * 365) return tr('time.monthAgo', { n: Math.floor(diff / (DAY * 30)) })
  return tr('time.yearAgo', { n: Math.floor(diff / (DAY * 365)) })
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return tr('greet.night')
  if (h < 9) return tr('greet.morning')
  if (h < 12) return tr('greet.forenoon')
  if (h < 14) return tr('greet.noon')
  if (h < 18) return tr('greet.afternoon')
  if (h < 22) return tr('greet.evening')
  return tr('greet.night')
}

/** 字节数转可读容量（storage-quota 返回值展示用） */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

/** 秒数转 m:ss（视频时长展示用） */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
