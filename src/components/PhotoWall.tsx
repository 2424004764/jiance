import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLineUp,
  Check,
  Sparkle,
} from '@phosphor-icons/react'
import type { Photo, WallConfig, WallItem } from '../lib/types'
import { autoArrange, clampPos, reconcile } from '../lib/wallLayout'
import { DEFAULT_WALL_BG, WALL_PRESETS, getWallPreset, tapeAngleFor, tapeColorFor } from '../lib/wallPresets'
import { useT } from '../lib/i18n'

/* ============================================================
   照片墙
   - 查看态：白框拍立得卡散布在画板上，点击打开大图查看
   - 编辑态（属主）：拖动改位置，选中后可旋转 / 缩放 / 置顶，
     支持自动排布与切换背景；改动即时写回（防抖推送由同步层负责）
   ============================================================ */

interface Props {
  /** 墙面配置（背景 + 摆放）；缺省按默认背景 + 自动散布处理 */
  wall?: WallConfig
  /** 相册内照片（时间倒序，与瀑布流一致） */
  photos: Photo[]
  /** 是否可进入编辑（登录属主） */
  editable: boolean
  /** 当前是否处于编辑态（由父页面控制，按钮在详情操作区） */
  editing: boolean
  onEditingChange: (editing: boolean) => void
  /** 布局/背景变化时写回（属主端） */
  onWallChange: (wall: WallConfig) => void
  /** 查看态点击照片（打开 Lightbox） */
  onOpenPhoto: (index: number) => void
}

const DRAG_THRESHOLD = 4
const MIN_W = 8
const MAX_W = 55

type TransformPreview = {
  id: string
  x: number
  y: number
  w: number
  rot: number
}

export function PhotoWall({
  wall,
  photos,
  editable,
  editing,
  onEditingChange,
  onWallChange,
  onOpenPhoto,
}: Props) {
  const { t, lang } = useT()
  const boardRef = useRef<HTMLDivElement | null>(null)
  const [boardW, setBoardW] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const [transformPreview, setTransformPreview] = useState<TransformPreview | null>(null)
  const transformPreviewRef = useRef<TransformPreview | null>(null)

  const config: WallConfig = {
    background: wall?.background ?? DEFAULT_WALL_BG,
    items: wall?.items ?? [],
  }

  const byId = useMemo(() => new Map(photos.map((p, i) => [p.id, { photo: p, index: i }])), [photos])
  const photoKey = useMemo(() => photos.map((p) => p.id).join(','), [photos])

  /** 展示用 items：剔除已删除照片的悬空布局（访客端只裁剪不写回） */
  const items = useMemo(
    () => config.items.filter((it) => byId.has(it.photoId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.items, photoKey],
  )

  const commit = (next: WallItem[]) => onWallChange({ background: config.background, items: next })

  /* 照片集合变化（上传新照片 / 删除）时增量补位 / 清理，属主端写回一次 */
  useEffect(() => {
    if (!editable || photos.length === 0) return
    const { items: aligned, changed } = reconcile(wall?.items ?? [], photos)
    if (changed) {
      onWallChange({ background: wall?.background ?? DEFAULT_WALL_BG, items: aligned })
    }
    // 依赖照片集合快照；onWallChange 由父组件稳定提供
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, photoKey])

  /* 画板像素宽度：卡片内边距、胶带尺寸都按此换算，保证与导出一致 */
  useLayoutEffect(() => {
    const el = boardRef.current
    if (!el) return
    setBoardW(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setBoardW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!editing) setSelectedId(null)
  }, [editing])

  /* ---------- 编辑交互 ---------- */

  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    baseX: number
    baseY: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  const transformRef = useRef<{
    mode: 'scale' | 'rotate'
    id: string
    centerX: number
    centerY: number
    startDistance: number
    startAngle: number
    baseW: number
    baseRot: number
  } | null>(null)

  const setTransform = (next: TransformPreview | null) => {
    transformPreviewRef.current = next
    setTransformPreview(next)
  }

  const beginTransform = (e: React.PointerEvent, it: WallItem, mode: 'scale' | 'rotate') => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    const card = e.currentTarget.parentElement
    const rect = card?.getBoundingClientRect()
    if (!rect) return
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = e.clientX - centerX
    const dy = e.clientY - centerY
    transformRef.current = {
      mode,
      id: it.photoId,
      centerX,
      centerY,
      startDistance: Math.max(1, Math.hypot(dx, dy)),
      startAngle: Math.atan2(dy, dx),
      baseW: it.w,
      baseRot: it.rot,
    }
    setSelectedId(it.photoId)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const updateTransform = (e: React.PointerEvent) => {
    const tr = transformRef.current
    if (!tr) return
    e.preventDefault()
    e.stopPropagation()
    const dx = e.clientX - tr.centerX
    const dy = e.clientY - tr.centerY
    if (tr.mode === 'scale') {
      const w = Math.min(MAX_W, Math.max(MIN_W, tr.baseW * (Math.hypot(dx, dy) / tr.startDistance)))
      const item = items.find((m) => m.photoId === tr.id)
      if (item) setTransform({ id: tr.id, x: item.x, y: item.y, w, rot: item.rot })
    } else {
      let delta = ((Math.atan2(dy, dx) - tr.startAngle) * 180) / Math.PI
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360
      const rot = Math.min(45, Math.max(-45, tr.baseRot + delta))
      const item = items.find((m) => m.photoId === tr.id)
      if (item) setTransform({ id: tr.id, x: item.x, y: item.y, w: item.w, rot })
    }
  }

  const finishTransform = () => {
    const tr = transformRef.current
    transformRef.current = null
    if (!tr) return
    const preview = transformPreviewRef.current
    setTransform(null)
    if (!preview || preview.id !== tr.id) return
    commit(items.map((m) => (m.photoId === tr.id ? { ...m, x: preview.x, y: preview.y, w: preview.w, rot: preview.rot } : m)))
  }

  const onTransformPointerCancel = () => {
    transformRef.current = null
    setTransform(null)
  }

  const onCardPointerDown = (e: React.PointerEvent, it: WallItem) => {
    if (!editing) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      id: it.photoId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: it.x,
      baseY: it.y,
      lastX: it.x,
      lastY: it.y,
      moved: false,
    }
  }

  const onCardPointerMove = (e: React.PointerEvent) => {
    if (transformRef.current) {
      updateTransform(e)
      return
    }
    const d = dragRef.current
    const rect = boardRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    const pos = clampPos(d.baseX + (dx / rect.width) * 100, d.baseY + (dy / rect.height) * 100)
    d.lastX = pos.x
    d.lastY = pos.y
    setDragPos({ id: d.id, ...pos })
    setSelectedId(d.id)
  }

  const onCardPointerUp = (_e: React.PointerEvent, it: WallItem) => {
    if (transformRef.current) {
      finishTransform()
      return
    }
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (d.moved) {
      setDragPos(null)
      commit(items.map((m) => (m.photoId === d.id ? { ...m, x: d.lastX, y: d.lastY } : m)))
    } else {
      // 点击（未拖动）：选中 / 再点取消
      setSelectedId((cur) => (cur === it.photoId ? null : it.photoId))
    }
  }

  const onBoardPointerDown = (e: React.PointerEvent) => {
    // 点到画板空白处取消选中（卡片上会 stopPropagation）
    if (e.target === e.currentTarget) setSelectedId(null)
  }

  const patchSelected = (patch: (it: WallItem) => WallItem) => {
    if (!selectedId) return
    commit(items.map((m) => (m.photoId === selectedId ? patch(m) : m)))
  }

  const doAutoArrange = () => {
    setSelectedId(null)
    commit(autoArrange(photos))
  }

  const bringToFront = () => {
    if (!selectedId) return
    const target = items.find((it) => it.photoId === selectedId)
    if (!target) return
    commit([...items.filter((it) => it.photoId !== selectedId), target])
  }

  const preset = getWallPreset(config.background)
  const selected = selectedId ? items.find((it) => it.photoId === selectedId) : undefined

  return (
    <div className="wall-wrap">
      <div className="wall-frame">
        <div
          ref={boardRef}
          className={editing ? 'wall-board editing' : 'wall-board'}
          style={{ background: preset.css }}
          onPointerDown={onBoardPointerDown}
        >
          {items.map((it, idx) => {
            const entry = byId.get(it.photoId)
            if (!entry) return null
            const p = entry.photo
            const preview = transformPreview?.id === it.photoId ? transformPreview : null
            const itemW = preview?.w ?? it.w
            const itemRot = preview?.rot ?? it.rot
            const dragging = dragPos?.id === it.photoId
            const x = dragging ? dragPos!.x : preview?.x ?? it.x
            const y = dragging ? dragPos!.y : preview?.y ?? it.y
            const cardW = (boardW * itemW) / 100
            const pad = boardW ? cardW * 0.058 : 0
            const tapeW = cardW * 0.24
            const tapeH = cardW * 0.07
            const cls = [
              'wall-card',
              editing ? 'editable' : 'view',
              dragging ? 'dragging' : '',
              selectedId === it.photoId ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <figure
                key={it.photoId}
                className={cls}
                style={
                  {
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${itemW}%`,
                    zIndex: dragging || transformPreview?.id === it.photoId || selectedId === it.photoId ? 500 : idx + 1,
                    paddingTop: pad,
                    paddingLeft: pad,
                    paddingRight: pad,
                    paddingBottom: pad * 2.4,
                    '--rot': `${itemRot}deg`,
                  } as React.CSSProperties
                }
                onPointerDown={(e) => {
                  if (editing) e.stopPropagation()
                  onCardPointerDown(e, it)
                }}
                onPointerMove={onCardPointerMove}
                onPointerUp={(e) => onCardPointerUp(e, it)}
                onClick={() => {
                  if (!editing) onOpenPhoto(entry.index)
                }}
              >
                {p.kind === 'video' ? (
                  /* #t=0.1 让 Safari 稳定渲染首帧；pointer-events 由 CSS 关闭，不干扰拖拽 */
                  <video
                    src={`${p.url}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                    draggable={false}
                    style={{ aspectRatio: `${p.width || 16} / ${p.height || 9}` }}
                  />
                ) : (
                  <img
                    src={p.url}
                    alt={p.title}
                    draggable={false}
                    loading="lazy"
                    style={{ aspectRatio: `${p.width || 1} / ${p.height || 1}` }}
                  />
                )}
                <i
                  className="wall-tape"
                  style={{
                    width: tapeW,
                    height: tapeH,
                    background: tapeColorFor(it.photoId),
                    transform: `translateX(-50%) rotate(${tapeAngleFor(it.photoId)}deg)`,
                  }}
                />
                {editing && selectedId === it.photoId && (
                  <>
                    <span className="wall-rotate-stem" aria-hidden="true" />
                    <button
                      type="button"
                      className="wall-transform-handle wall-rotate-handle"
                      aria-label={t('wall.rotateHandle')}
                      title={t('wall.rotateHandle')}
                      onPointerDown={(e) => beginTransform(e, it, 'rotate')}
                      onPointerMove={updateTransform}
                      onPointerUp={finishTransform}
                      onPointerCancel={onTransformPointerCancel}
                    />
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        className={`wall-transform-handle wall-scale-handle ${corner}`}
                        aria-label={t('wall.scaleHandle')}
                        title={t('wall.scaleHandle')}
                        onPointerDown={(e) => beginTransform(e, it, 'scale')}
                        onPointerMove={updateTransform}
                        onPointerUp={finishTransform}
                        onPointerCancel={onTransformPointerCancel}
                      />
                    ))}
                  </>
                )}
              </figure>
            )
          })}
        </div>
      </div>

      {editing && (
        <>
          <div className="wall-editbar">
            <button type="button" className="btn btn-ghost" onClick={doAutoArrange}>
              <Sparkle size={15} weight="bold" />
              {t('wall.autoArrange')}
            </button>
            <button
              type="button"
              className="btn-icon"
              disabled={!selected}
              onClick={bringToFront}
              aria-label={t('wall.front')}
              title={t('wall.front')}
            >
              <ArrowLineUp size={16} />
            </button>
            <span className="wall-editbar-sep" aria-hidden="true" />
            <div className="bg-row" role="group" aria-label={t('wall.bgTitle')}>
              {WALL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={config.background === p.id ? 'bg-dot on' : 'bg-dot'}
                  style={{ background: p.css }}
                  onClick={() => onWallChange({ ...config, background: p.id })}
                  aria-label={p.name[lang]}
                  title={p.name[lang]}
                />
              ))}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onEditingChange(false)}>
              <Check size={15} weight="bold" />
              {t('wall.editDone')}
            </button>
          </div>
          <p className="wall-hint">{selected ? t('wall.editHintSelected') : t('wall.editHint')}</p>
        </>
      )}
    </div>
  )
}
