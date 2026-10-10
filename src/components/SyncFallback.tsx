import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react'
import { pullGallery, useGallerySyncStatus } from '../lib/gallerySync'
import { useT } from '../lib/i18n'
import { EmptyState } from './EmptyState'

/**
 * 云端首次同步未完成时的占位视图：
 * loading 显示转圈，失败给重试入口；同步完成（ready）返回 null。
 * 用于避免把「本地缓存暂时没有」误判成「相册不存在 / 相册为空」
 */
export function SyncFallback() {
  const status = useGallerySyncStatus((s) => s.status)
  const { t } = useT()

  if (status === 'loading') {
    return (
      <EmptyState
        icon={<div className="auth-spinner" role="status" />}
        title={t('sync.loadingTitle')}
        desc={t('sync.loadingSub')}
      />
    )
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={<WarningCircle size={30} weight="thin" />}
        title={t('sync.errorTitle')}
        desc={t('sync.errorDesc')}
        action={
          <button className="btn btn-primary" onClick={() => void pullGallery()}>
            <ArrowClockwise size={16} weight="bold" />
            {t('sync.retry')}
          </button>
        }
      />
    )
  }

  return null
}
