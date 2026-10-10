/* ============================================================
   照片墙布局
   - autoArrange：把照片散布到画板上（随机微旋 + 抖动位置 + 尺寸差异），
     作为照片墙的初始布局与「自动排布」的实现
   - reconcile：相册后续增删照片时增量维护 items
     （悬空 photoId 剔除，新增照片自动补位）
   ============================================================ */

import type { Photo, WallItem } from './types'

const ROT_MAX = 13

/**
 * 生成散布布局。画板为正方形（百分比坐标系），照片按
 * 「近似网格 + 抖动」摆放：整体均匀不挤在一角，局部错落允许轻微叠边，
 * 旋转与尺寸都带随机扰动，得到类似软木板钉照片的观感。
 */
export function autoArrange(photos: Photo[]): WallItem[] {
  const n = photos.length
  if (n === 0) return []
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  const rows = Math.ceil(n / cols)
  const cellW = 100 / cols
  const cellH = 100 / rows
  // 照片越多卡片越小；给格线留出缝隙
  const baseW = Math.min(26, (cellW * 100) / 116)

  return photos.map((p, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const jx = (Math.random() * 2 - 1) * cellW * 0.2
    const jy = (Math.random() * 2 - 1) * cellH * 0.2
    const cx = (col + 0.5) * cellW + jx
    const cy = (row + 0.5) * cellH + jy
    const w = baseW * (0.88 + Math.random() * 0.36)
    return {
      photoId: p.id,
      x: Math.min(91, Math.max(9, cx)),
      y: Math.min(91, Math.max(9, cy)),
      rot: (Math.random() * 2 - 1) * ROT_MAX,
      w: Math.round(Math.min(34, Math.max(9, w)) * 10) / 10,
    }
  })
}

/** 照片 id 集合（用于剔除悬空 item 与发现缺位照片） */
function idSet(photos: Photo[]): Set<string> {
  return new Set(photos.map((p) => p.id))
}

/**
 * 让 items 与当前照片集合对齐：返回对齐后的数组以及是否有变化。
 * 只在 editable（属主）场景调用并把结果写回，访客端仅做展示裁剪。
 */
export function reconcile(items: WallItem[], photos: Photo[]): { items: WallItem[]; changed: boolean } {
  const ids = idSet(photos)
  const kept = items.filter((it) => ids.has(it.photoId))
  const placed = new Set(kept.map((it) => it.photoId))
  const missing = photos.filter((p) => !placed.has(p.id))
  if (missing.length === 0 && kept.length === items.length) {
    return { items, changed: false }
  }
  return { items: [...kept, ...autoArrange(missing)], changed: true }
}

/** 拖动等的落点夹取：中心点留在画板内，允许边缘轻微出界 */
export function clampPos(x: number, y: number): { x: number; y: number } {
  return { x: Math.min(95, Math.max(5, x)), y: Math.min(95, Math.max(5, y)) }
}
