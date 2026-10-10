import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Photo } from '../lib/types'
import { PhotoCard } from './PhotoCard'

interface Props {
  photos: Photo[]
  onOpen: (index: number) => void
  /** 多选模式：卡片显示勾选圈并隐藏点赞按钮（点击行为仍由 onOpen 决定） */
  selectMode?: boolean
  /** 选中集合（photo.id），配合 selectMode 显示勾选态 */
  selectedIds?: ReadonlySet<string>
  /** 提供时改走外部点赞（分享页访客），见 PhotoCard.onToggleLike */
  onToggleLike?: (photoId: string) => void
  /** false = 不渲染点赞按钮（分享页未登录访客），见 PhotoCard.showLike */
  showLike?: boolean
  /** true = 属主视角：渲染收藏星标，见 PhotoCard.showStar */
  showStar?: boolean
}

/** 列数随容器宽度变化，断点与旧 CSS columns 行为一致（≤880px 两列，桌面最多 5 列） */
function columnCount(width: number): number {
  if (width <= 880) return 2
  return Math.max(2, Math.min(5, Math.floor((width + 10) / 250)))
}

/** 依次放入当前最矮的列（并列取最左）：最新的几张正好横向铺满首屏顶行 */
function placeByShortestColumn<T>(items: T[], cols: number, heightOf: (item: T) => number): T[][] {
  const columns: T[][] = Array.from({ length: cols }, () => [])
  const heights = new Array<number>(cols).fill(0)
  for (const item of items) {
    let best = 0
    for (let c = 1; c < cols; c++) {
      if (heights[c] < heights[best]) best = c
    }
    columns[best].push(item)
    heights[best] += heightOf(item)
  }
  return columns.filter((col) => col.length > 0)
}

/** 照片少于列数时列会被拉宽（单张会占满整屏），此时限制每列最大宽度（仍靠左排列） */
const FEW_COL_MAX_W = 400

/** 测量容器宽度，供列数计算（ResizeObserver 跟随窗口/布局变化） */
function useContainerWidth() {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

export function MasonryGrid({ photos, onOpen, selectMode, selectedIds, onToggleLike, showLike = true, showStar = false }: Props) {
  const [ref, width] = useContainerWidth()
  const cols = columnCount(width || 1200)
  const columns = useMemo(
    () => placeByShortestColumn(photos, cols, (p) => Math.max(1, p.height) / Math.max(1, p.width)),
    [photos, cols],
  )
  // 容器保持全宽（列数计算稳定），只收窄列本身，避免 ResizeObserver 往复抖动
  const fewCols = columns.length < cols
  // 瀑布流按列拆分后仍需还原原始序号（Lightbox / 多选按下标访问 feed）
  const indexById = useMemo(() => new Map(photos.map((p, i) => [p.id, i])), [photos])

  return (
    <div className="masonry" ref={ref}>
      {columns.map((col, ci) => (
        <div className="masonry-col" key={ci} style={fewCols ? { maxWidth: FEW_COL_MAX_W } : undefined}>
          {col.map((p) => (
            <PhotoCard
              key={p.id}
              photo={p}
              delay={((indexById.get(p.id) ?? 0) % 8) * 0.045}
              onOpen={() => onOpen(indexById.get(p.id) ?? 0)}
              selectMode={selectMode}
              selected={selectedIds?.has(p.id) ?? false}
              onToggleLike={onToggleLike}
              showLike={showLike}
              showStar={showStar}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 与瀑布流形状一致的加载占位 */
export function SkeletonMasonry({ n = 8 }: { n?: number }) {
  const [ref, width] = useContainerWidth()
  const cols = columnCount(width || 1200)
  const columns = useMemo(() => {
    const heights = [320, 430, 260, 500, 360, 300, 450, 380, 280, 470, 330, 410]
    return placeByShortestColumn(
      Array.from({ length: n }, (_, i) => ({ id: i, h: heights[i % heights.length] })),
      cols,
      (it) => it.h,
    )
  }, [n, cols])

  return (
    <div className="masonry" ref={ref} aria-hidden="true">
      {columns.map((col, ci) => (
        <div className="masonry-col" key={ci}>
          {col.map((it) => (
            <div key={it.id} className="skeleton skeleton-photo" style={{ height: it.h }} />
          ))}
        </div>
      ))}
    </div>
  )
}
