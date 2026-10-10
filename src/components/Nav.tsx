import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Aperture,
  ArrowSquareOut,
  CaretDown,
  Database,
  Globe,
  House,
  Images,
  Plus,
  SignIn,
  SignOut,
  UploadSimple,
  Camera,
  FolderPlus,
  X,
} from '@phosphor-icons/react'
import { useUpload } from '../lib/useUpload'
import { beginLogin, oauthConfigured, oauthCreditsUrl, type OAuthUser } from '../lib/oauth'
import { logout, useAuth } from '../lib/auth'
import { useToasts } from '../lib/store'
import { fetchStorageQuota, ScopeMissingError, type StorageQuota } from '../lib/storage'
import { formatBytes } from '../lib/format'
import { switchLang, useT, type Lang } from '../lib/i18n'

function UserAvatar({ user, size = 26 }: { user: OAuthUser; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (user.avatar && !broken) {
    return (
      <img
        className="user-avatar"
        src={user.avatar}
        alt={user.username}
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      className="user-avatar user-avatar-fallback"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {(user.username || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function Nav() {
  const upload = useUpload()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const user = useAuth((s) => s.user)
  const toast = useToasts((s) => s.toast)
  const { t, lang } = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [quota, setQuota] = useState<StorageQuota | null>(null)
  const [quotaState, setQuotaState] = useState<'idle' | 'loading' | 'ok' | 'scope' | 'error'>('idle')

  // 每次打开菜单时刷新一次存储额度
  useEffect(() => {
    if (!menuOpen || !user) return
    let alive = true
    setQuotaState('loading')
    fetchStorageQuota()
      .then((q) => {
        if (!alive) return
        setQuota(q)
        setQuotaState('ok')
      })
      .catch((e) => {
        if (!alive) return
        setQuotaState(e instanceof ScopeMissingError ? 'scope' : 'error')
      })
    return () => {
      alive = false
    }
  }, [menuOpen, user])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    // 顶栏的 backdrop-filter 会成为 fixed 遮罩的包含块，遮罩实际盖不住整页，
    // 改为全局监听：点头像和菜单本体以外的任意位置关闭
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null
      if (el?.closest('.user-menu, .user-zone')) return
      setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

  const startLogin = () => {
    if (!oauthConfigured) {
      toast(t('toast.needConfig'), 'error')
      return
    }
    void beginLogin()
  }

  const doLogout = () => {
    setMenuOpen(false)
    void logout()
    toast(t('toast.loggedOut'), 'info')
    // 画廊随登录态切回空白，回首页避免停留在已不存在的相册页
    navigate('/')
  }

  /** 旧会话缺 storage 授权时，一键重新走授权（无需先退出登录） */
  const reauthorize = () => {
    if (!oauthConfigured) {
      toast(t('toast.needConfig'), 'error')
      return
    }
    setMenuOpen(false)
    void beginLogin()
  }

  const createAlbum = () => {
    setSheetOpen(false)
    if (!user) {
      toast(t('toast.loginToCreate'), 'error')
      return
    }
    navigate('/albums?new=1')
  }

  const toggleLang = () => switchLang(lang === 'zh' ? ('en' as Lang) : ('zh' as Lang))

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label={t('brand')}>
            <span className="brand-mark">
              <Aperture size={21} weight="bold" />
            </span>
            <span className="brand-name">{t('brand')}</span>
          </Link>

          {/* 首页/相册属于登录后的工作区，未登录（官网页）不显示 */}
          {user && (
            <nav className="topbar-nav" aria-label={t('nav.home')}>
              <NavLink to="/" end className="topbar-link">
                {t('nav.home')}
              </NavLink>
              <NavLink to="/albums" className="topbar-link">
                {t('nav.albums')}
              </NavLink>
            </nav>
          )}

          <div className="topbar-actions">
            {user && (
              <>
                <button className="btn btn-ghost btn-desktop" onClick={() => upload(null)}>
                  <UploadSimple size={17} weight="bold" />
                  {t('nav.upload')}
                </button>
                <button className="btn btn-primary btn-desktop" onClick={createAlbum}>
                  <Plus size={16} weight="bold" />
                  {t('nav.newAlbum')}
                </button>
              </>
            )}

            <button
              className="lang-btn"
              onClick={toggleLang}
              aria-label={t('nav.langSwitch')}
              title={t('nav.langSwitch')}
            >
              <Globe size={16} weight="bold" />
              {lang === 'zh' ? 'EN' : '中文'}
            </button>

            {user ? (
              <div className="user-zone">
                <button
                  className="user-chip"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <UserAvatar user={user} />
                  <span className="user-chip-name">{user.username}</span>
                  <CaretDown size={12} className="user-caret" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <motion.div
                      className="user-menu glass"
                      role="menu"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.18 }}
                    >
                      <div className="user-menu-head">
                        <UserAvatar user={user} size={40} />
                        <div className="user-menu-info">
                          <strong>{user.username}</strong>
                          <span>{user.email || `ID ${user.sub}`}</span>
                        </div>
                      </div>
                      <div className="user-menu-quota">
                        <div className="user-menu-quota-row">
                          <span className="user-menu-quota-label">
                            <Database size={14} weight="fill" />
                            {t('nav.storage')}
                          </span>
                          {quotaState === 'loading' && (
                            <span className="user-menu-quota-value muted">
                              {t('nav.storageLoading')}
                            </span>
                          )}
                          {quotaState === 'ok' && quota && (
                            <span className="user-menu-quota-value">
                              {formatBytes(quota.remaining_bytes)} / {formatBytes(quota.quota_bytes)}
                            </span>
                          )}
                          {quotaState === 'scope' && (
                            <button className="user-menu-quota-action" onClick={reauthorize}>
                              {t('nav.storageScope')}
                            </button>
                          )}
                          {quotaState === 'error' && (
                            <span className="user-menu-quota-value muted">
                              {t('nav.storageError')}
                            </span>
                          )}
                        </div>
                        <a
                          className="user-menu-quota-manage"
                          href={oauthCreditsUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t('nav.manage')}
                          <ArrowSquareOut size={12} />
                        </a>
                      </div>
                      <button className="user-menu-logout" role="menuitem" onClick={doLogout}>
                        <SignOut size={16} weight="bold" />
                        {t('nav.logout')}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button className="btn btn-ghost login-btn" onClick={startLogin}>
                <SignIn size={16} weight="bold" />
                {t('nav.login')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 移动端底部 tab 栏只服务登录后的工作区，未登录不渲染 */}
      {user && (
        <nav className="bottombar" aria-label={t('nav.home')}>
          <div className="bottombar-inner">
            <NavLink to="/" end className="bottom-link">
              {({ isActive }) => (
                <>
                  <House size={22} weight={isActive ? 'fill' : 'regular'} />
                  <span>{t('nav.home')}</span>
                </>
              )}
            </NavLink>
            <button className="fab" onClick={() => setSheetOpen(true)} aria-label={t('nav.quickActions')}>
              <Plus size={24} weight="bold" />
            </button>
            <NavLink to="/albums" className="bottom-link">
              {({ isActive }) => (
                <>
                  <Images size={22} weight={isActive ? 'fill' : 'regular'} />
                  <span>{t('nav.albums')}</span>
                </>
              )}
            </NavLink>
          </div>
        </nav>
      )}

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              className="sheet-panel glass"
              role="dialog"
              aria-label={t('nav.quickActions')}
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sheet-head">
                <span>{t('nav.quickActions')}</span>
                <button className="btn-icon" onClick={() => setSheetOpen(false)} aria-label={t('nav.close')}>
                  <X size={17} />
                </button>
              </div>
              <button
                className="sheet-action"
                onClick={() => {
                  setSheetOpen(false)
                  upload(null)
                }}
              >
                <span className="sheet-action-icon">
                  <Camera size={20} weight="bold" />
                </span>
                <span className="sheet-action-text">
                  <strong>{t('nav.uploadAction')}</strong>
                  <small>{t('nav.uploadActionDesc')}</small>
                </span>
              </button>
              <button className="sheet-action" onClick={createAlbum}>
                <span className="sheet-action-icon alt">
                  <FolderPlus size={20} weight="bold" />
                </span>
                <span className="sheet-action-text">
                  <strong>{t('nav.newAlbumAction')}</strong>
                  <small>{t('nav.newAlbumActionDesc')}</small>
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
