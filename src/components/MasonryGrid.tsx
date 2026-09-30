import type { Photo } from '../lib/types'
import { PhotoCard } from './PhotoCard'

interface Props {
  photos: Photo[]
  onOpen: (index: number) => void
}

export function MasonryGrid({ photos, onOpen }: Props) {
  return (
    <div className="masonry">
      {photos.map((p, i) => (
        <PhotoCard key={p.id} photo={p} delay={(i % 8) * 0.045} onOpen={() => onOpen(i)} />
      ))}
    </div>
  )
}

/** 与瀑布流形状一致的加载占位 */
export function SkeletonMasonry({ n = 8 }: { n?: number }) {
  const heights = [320, 430, 260, 500, 360, 300, 450, 380, 280, 470, 330, 410]
  return (
    <div className="masonry" aria-hidden="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="skeleton skeleton-photo" style={{ height: heights[i % heights.length] }} />
      ))}
    </div>
  )
}
