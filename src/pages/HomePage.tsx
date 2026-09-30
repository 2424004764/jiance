import { useEffect, useMemo, useState } from 'react'
import { Clock, UploadSimple, ImagesSquare } from '@phosphor-icons/react'
import { useGallery, feedPhotos } from '../lib/store'
import { useUpload } from '../lib/useUpload'
import { greeting } from '../lib/format'
import { PageTransition } from '../components/PageTransition'
import { MasonryGrid, SkeletonMasonry } from '../components/MasonryGrid'
import { Lightbox } from '../components/Lightbox'
import { EmptyState } from '../components/EmptyState'
import { AnimatePresence } from 'motion/react'

export function HomePage() {
  const photos = useGallery((s) => s.photos)
  const upload = useUpload()
  const [loading, setLoading] = useState(true)
  const [lbIndex, setLbIndex] = useState<number | null>(null)

  const feed = useMemo(() => feedPhotos(photos), [photos])

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    document.title = '拾光集'
  }, [])

  return (
    <PageTransition>
      <header className="page-hero">
        <h1>
          {greeting()}，<span className="grad-text">今天也记得拾光</span>
        </h1>
        <p className="hero-meta">
          <Clock size={15} />
          {feed.length > 0 ? `${feed.length} 张照片，按上传时间排序` : '时间流还是空的'}
        </p>
      </header>

      {loading ? (
        <SkeletonMasonry n={10} />
      ) : feed.length === 0 ? (
        <EmptyState
          icon={<ImagesSquare size={30} weight="thin" />}
          title="还没有未归类的照片"
          desc="上传的照片如果不加入相册，就会按时间排列在这里"
          action={
            <button className="btn btn-primary" onClick={() => upload(null)}>
              <UploadSimple size={16} weight="bold" />
              上传第一张照片
            </button>
          }
        />
      ) : (
        <MasonryGrid photos={feed} onOpen={setLbIndex} />
      )}

      <AnimatePresence>
        {lbIndex !== null && (
          <Lightbox
            photos={feed}
            index={lbIndex}
            onClose={() => setLbIndex(null)}
            onNavigate={setLbIndex}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
