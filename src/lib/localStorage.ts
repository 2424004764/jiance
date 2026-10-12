/* ============================================================
   localStorage 安全封装（独立模块，避免 store ↔ auth 循环依赖）
   - 语言偏好、上传压缩开关、会话等小状态使用；超配额不崩溃
   ============================================================ */

export const safeLocalStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value)
    } catch {
      /* 容量不足时放弃持久化，仅本次会话生效 */
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name)
    } catch {
      /* noop */
    }
  },
}
