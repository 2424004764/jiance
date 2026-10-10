import { useEffect, useMemo, useState } from 'react'
import {
  Clock,
  UploadSimple,
  ImagesSquare,
  Checks,
  TrashSimple,
  MagnifyingGlass,
  Star,
  X,
  FolderSimple,
} from '@phosphor-icons/react'
import { useGallery, feedPhotos } from '../lib/store'
import { useGallerySyncStatus } from '../lib/gallerySync'
import { useUpload } from '../lib/useUpload'
import { usePhotoDelete } from '../lib/usePhotoDelete'
import { useAuth } from '../lib/auth'
import { greeting } from '../lib/format'
import { PageTransition } from '../components/PageTransition'
import { MasonryGrid, SkeletonMasonry } from '../components/MasonryGrid'
import { Lightbox } from '../components/Lightbox'
import { EmptyState } from '../components/EmptyState'
import { Landing } from '../components/Landing'
import { ConfirmModal } from '../components/ConfirmModal'
import { SyncFallback } from '../components/SyncFallback'
import { MoveModal } from '../components/MoveModal'
import { useT } from '../lib/i18n'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { Photo } from '../lib/types'

/** 时间轴的一个月份分组；start 为该组首张在整体列表中的下标（灯箱定位用） */
interface MonthGroup {
  key: string
  year: number
  label: string
  start: number
  photos: Photo[]
}

export function HomePage() {
  const photos = useGallery((s) => s.photos)
  const albums = useGallery((s) => s.albums)
  const user = useAuth((s) => s.user)
  const syncStatus = useGallerySyncStatus((s) => s.status)
  const upload = useUpload()
  const removePhotos = usePhotoDelete()
  const { t, lang } = useT()
  const reduce = useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [lbIndex, setLbIndex] = useState<number | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmOne, setConfirmOne] = useState(false)
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [deleting, setDeleting] = useState(false)
  /** 搜索关键词（匹配标题 / 所属相册名，跨全部照片） */
  const [query, setQuery] = useState('')
  const [starredOnly, setStarredOnly] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const feed = useMemo(() => feedPhotos(photos), [photos])
  const albumsById = useMemo(() => new Map(albums.map((a) => [a.id, a])), [albums])
  const hasStarred = useMemo(() => photos.some((p) => p.starred), [photos])

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const matches = useMemo(() => {
    if (!searching) return null
    return [...photos]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((p) => {
        if (p.title.toLowerCase().includes(q)) return true
        const alb = p.albumId ? albumsById.get(p.albumId) : undefined
        return !!alb && alb.name.toLowerCase().includes(q)
      })
  }, [photos, albumsById, q, searching])

  const base = matches ?? feed
  const list = useMemo(() => (starredOnly ? base.filter((p) => p.starred) : base), [base, starredOnly])
  /** 时间轴分组只在「浏览全部」时展示；搜索/收藏筛选走平铺结果 */
  const timeline = !searching && !starredOnly

  const groups = useMemo<MonthGroup[]>(() => {
    const fmt = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' })
    const out: MonthGroup[] = []
    feed.forEach((p, i) => {
      const d = new Date(p.createdAt)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`
      const last = out[out.length - 1]
      if (last && last.key === key) last.photos.push(p)
      else out.push({ key, year: d.getFullYear(), label: fmt.format(d), start: i, photos: [p] })
    })
    return out
  }, [feed, lang])
  const years = useMemo(() => [...new Set(groups.map((g) => g.year))], [groups])

  /* 年份快捷条：随滚动高亮当前年份 */
  const [activeYear, setActiveYear] = useState<number | null>(null)
  useEffect(() => {
    if (!timeline || years.length <= 1) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const marker = window.scrollY + 160
        let cur: number | null = groups[0]?.year ?? null
        for (const g of groups) {
          const el = document.getElementById(`tl-${g.key}`)
          if (el && el.getBoundingClientRect().top + window.scrollY <= marker) cur = g.year
        }
        setActiveYear(cur)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [timeline, groups, years.length])

  const jumpToYear = (year: number) => {
    const g = groups.find((x) => x.year === year)
    if (!g) return
    document
      .getElementById(`tl-${g.key}`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 550)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    document.title = t('brand')
  }, [t, lang])

  /* 照片数据为账号私有：未登录展示产品官网 */
  if (!user) {
    return (
      <PageTransition>
        <Landing />
      </PageTransition>
    )
  }

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const allSelected = list.length > 0 && list.every((p) => selected.has(p.id))
  const selectedPhotos = list.filter((p) => selected.has(p.id))

  /** 确认后的实际删除：先删云端 R2 对象，成功才移除本地记录并收尾 UI；返回值供确认弹窗决定是否关闭 */
  const performDelete = async (targets: Photo[]): Promise<boolean> => {
    if (deleting || targets.length === 0) return false
    setDeleting(true)
    const ok = await removePhotos(targets)
    setDeleting(false)
    if (ok) {
      setLbIndex(null)
      exitSelect()
    }
    return ok
  }

  const heroMeta = searching
    ? t('home.searchResults', { n: list.length })
    : starredOnly
      ? t('home.starredMeta', { n: list.length })
      : feed.length > 0
        ? t('home.feedMeta', { n: feed.length })
        : t('home.emptyTitle')

  const renderGrid = (items: Photo[], onOpen: (i: number) => void) => (
    <MasonryGrid
      photos={items}
      onOpen={selectMode ? (i) => toggleSelect(items[i].id) : onOpen}
      selectMode={selectMode}
      selectedIds={selected}
      showStar
    />
  )

  return (
    <PageTransition>
      <header className="page-hero">
        <div className="page-hero-row">
          <h1>
            {greeting()}
            <span className="accent-text">{t('home.heroTail')}</span>
          </h1>
          {feed.length > 0 && !selectMode && (
            <button className="btn btn-ghost" onClick={() => setSelectMode(true)}>
              <Checks size={16} weight="bold" />
              {t('home.select')}
            </button>
          )}
        </div>
        {feed.length > 0 && (
          <div className="home-tools">
            <div className="search-box">
              <MagnifyingGlass size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('home.search')}
                aria-label={t('home.search')}
              />
              {query && (
                <button className="search-clear" onClick={() => setQuery('')} aria-label={t('form.cancel')}>
                  <X size={13} weight="bold" />
                </button>
              )}
            </div>
            {hasStarred && (
              <button
                className={`filter-chip${starredOnly ? ' on' : ''}`}
                onClick={() => setStarredOnly((v) => !v)}
                aria-pressed={starredOnly}
              >
                <Star size={14} weight={starredOnly ? 'fill' : 'regular'} />
                {t('home.starredOnly')}
              </button>
            )}
          </div>
        )}
        <p className="hero-meta">
          <Clock size={15} />
          {heroMeta}
        </p>
      </header>

      {/* 骨架屏延续到云端首次同步结束，避免同步中闪「还没有照片」 */}
      {loading || syncStatus === 'loading' ? (
        <SkeletonMasonry n={10} />
      ) : photos.length === 0 ? (
        syncStatus === 'error' ? (
          <SyncFallback />
        ) : (
          <EmptyState
            icon={<ImagesSquare size={30} weight="thin" />}
            title={t('home.emptyTitle')}
            desc={t('home.emptyDesc')}
            action={
              <button className="btn btn-primary" onClick={() => upload(null)}>
                <UploadSimple size={16} weight="bold" />
                {t('home.emptyCta')}
              </button>
            }
          />
        )
      ) : list.length === 0 ? (
        <EmptyState
          icon={searching ? <MagnifyingGlass size={30} weight="thin" /> : <Star size={30} weight="thin" />}
          title={searching ? t('home.searchEmpty') : t('home.starredEmpty')}
          desc={searching ? t('home.searchEmptyDesc') : t('home.starredEmptyDesc')}
        />
      ) : timeline ? (
        <>
          {groups.map((g) => (
            <section key={g.key} id={`tl-${g.key}`} className="tl-group">
              <h2 className="tl-head">{g.label}</h2>
              {renderGrid(g.photos, (i) => setLbIndex(g.start + i))}
            </section>
          ))}
          {years.length > 1 && (
            <nav className="year-rail" aria-label={t('home.yearNav')}>
              {years.map((y) => (
                <button
                  key={y}
                  className={activeYear === y ? 'year-dot on' : 'year-dot'}
                  onClick={() => jumpToYear(y)}
                  aria-label={String(y)}
                >
                  {y}
                </button>
              ))}
            </nav>
          )}
        </>
      ) : (
        renderGrid(list, setLbIndex)
      )}

      <AnimatePresence>
        {lbIndex !== null && (
          <Lightbox
            photos={list}
            index={lbIndex}
            owner
            onClose={() => setLbIndex(null)}
            onNavigate={setLbIndex}
            onRemove={() => setConfirmOne(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectMode && (
          <motion.div
            className="select-bar glass"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 26 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              className="select-bar-text"
              onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)))}
            >
              {allSelected ? t('home.deselectAll') : t('home.selectAll')}
            </button>
            <span className="select-bar-count">{t('home.selected', { n: selected.size })}</span>
            <button className="select-bar-text" onClick={exitSelect}>
              {t('form.cancel')}
            </button>
            <button
              className="btn btn-ghost select-bar-move"
              disabled={selected.size === 0}
              onClick={() => setMoveOpen(true)}
            >
              <FolderSimple size={15} weight="bold" />
              {t('home.moveSelected')}
            </button>
            <button
              className="btn btn-danger"
              disabled={selected.size === 0 || deleting}
              onClick={() => setConfirmBatch(true)}
            >
              <TrashSimple size={15} weight="bold" />
              {t('home.deleteSelected')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <MoveModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        photos={selectedPhotos}
        onMoved={exitSelect}
      />

      <ConfirmModal
        open={confirmOne}
        onClose={() => setConfirmOne(false)}
        onConfirm={() => {
          const photo = lbIndex !== null ? list[lbIndex] : undefined
          return photo ? performDelete([photo]) : undefined
        }}
        busyText={t('confirm.deleting')}
        title={t('photo.confirmOneTitle')}
        desc={t('photo.confirmDesc')}
      />
      <ConfirmModal
        open={confirmBatch}
        onClose={() => setConfirmBatch(false)}
        onConfirm={() => performDelete(selectedPhotos)}
        busyText={t('confirm.deleting')}
        title={t('photo.confirmBatchTitle', { n: selectedPhotos.length })}
        desc={t('photo.confirmDesc')}
      />
    </PageTransition>
  )
}
