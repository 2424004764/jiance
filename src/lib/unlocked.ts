/** 已通过密码验证的分享相册（仅当前浏览器会话内有效） */
const KEY = 'sg-unlocked'

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function isUnlocked(shareId: string): boolean {
  return read().includes(shareId)
}

export function markUnlocked(shareId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify([...new Set([...read(), shareId])]))
  } catch {
    /* noop */
  }
}
