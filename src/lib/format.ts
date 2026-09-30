const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < DAY * 7) return `${Math.floor(diff / DAY)} 天前`
  if (diff < DAY * 30) return `${Math.floor(diff / (DAY * 7))} 周前`
  if (diff < DAY * 365) return `${Math.floor(diff / (DAY * 30))} 个月前`
  return `${Math.floor(diff / (DAY * 365))} 年前`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  if (h < 22) return '晚上好'
  return '夜深了'
}
