import { motion, useReducedMotion } from 'motion/react'
import {
  CloudArrowUp,
  ImagesSquare,
  LockSimple,
  ShareFat,
  SignIn,
} from '@phosphor-icons/react'
import { beginLogin, oauthConfigured, oauthServerUrl } from '../lib/oauth'
import { useToasts } from '../lib/store'
import { useT } from '../lib/i18n'
import { LoadingImage } from './LoadingImage'

const pic = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`

const reveal = {
  initial: { opacity: 0, y: 26 },
  whileInView: { opacity: 1, y: 0 },
}

/** 未登录首页：产品官网，说明简册是什么、怎么用 */
export function Landing() {
  const toast = useToasts((s) => s.toast)
  const { t } = useT()
  const reduce = useReducedMotion()

  const startLogin = () => {
    if (!oauthConfigured) {
      toast(t('toast.needConfig'), 'error')
      return
    }
    void beginLogin()
  }

  const enter = (delay = 0) =>
    reduce
      ? {}
      : {
          ...reveal,
          viewport: { once: true, amount: 0.25 },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        }

  return (
    <div className="landing">
      {/* ---------- Hero ---------- */}
      <section className="landing-hero">
        <motion.div className="landing-hero-copy" {...enter()}>
          <h1>
            {t('landing.heroPre')}
            <span className="accent-text">{t('landing.heroAccent')}</span>
            {t('landing.heroPost')}
          </h1>
          <p className="landing-sub">{t('landing.heroSub')}</p>
          <div className="landing-cta-row">
            <button className="btn btn-primary landing-cta-btn" onClick={startLogin}>
              <SignIn size={17} weight="bold" />
              {t('landing.cta')}
            </button>
            <span className="landing-note">{t('landing.noSignup')}</span>
          </div>
        </motion.div>

        <motion.div className="landing-hero-art" {...enter(0.12)} aria-hidden="true">
          <div className="hero-card hero-card-a">
            <LoadingImage src={pic('jiance-gather-dusk', 520, 640)} alt="" loading="lazy" ratio="520 / 640" />
          </div>
          <div className="hero-card hero-card-b">
            <LoadingImage src={pic('jiance-gather-sea', 480, 600)} alt="" loading="lazy" ratio="480 / 600" />
          </div>
          <div className="hero-card hero-card-c">
            <LoadingImage src={pic('jiance-gather-cat', 460, 560)} alt="" loading="lazy" ratio="460 / 560" />
          </div>
        </motion.div>
      </section>

      {/* ---------- 特性 Bento ---------- */}
      <section className="landing-section">
        <motion.div {...enter()}>
          <h2 className="landing-section-title">{t('landing.featTitle')}</h2>
          <p className="landing-section-sub">{t('landing.featSub')}</p>
        </motion.div>
        <div className="landing-bento">
          <motion.div className="cell-photo cell-a" {...enter(0.05)}>
            <LoadingImage src={pic('jiance-private-desk', 960, 520)} alt={t('landing.featAltDesk')} loading="lazy" />
            <div className="cell-overlay">
              <h3>
                <LockSimple size={18} weight="fill" />
                {t('landing.featPrivateTitle')}
              </h3>
              <p>{t('landing.featPrivateDesc')}</p>
            </div>
          </motion.div>

          <motion.div className="cell-photo" {...enter(0.12)}>
            <LoadingImage src={pic('jiance-gallery-wall', 520, 520)} alt={t('landing.featAltWall')} loading="lazy" />
          </motion.div>

          <motion.div className="cell-text" {...enter(0.05)}>
            <span className="cell-icon">
              <CloudArrowUp size={22} weight="bold" />
            </span>
            <h3>{t('landing.cloudTitle')}</h3>
            <p>{t('landing.cloudDesc')}</p>
          </motion.div>

          <motion.div className="cell-photo cell-wide" {...enter(0.12)}>
            <LoadingImage src={pic('jiance-share-lake', 960, 520)} alt={t('landing.featAltLake')} loading="lazy" />
            <div className="cell-overlay">
              <h3>
                <ShareFat size={18} weight="fill" />
                {t('landing.shareTitle')}
              </h3>
              <p>{t('landing.shareDesc')}</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ---------- 四步流程 ---------- */}
      <section className="landing-section">
        <motion.div {...enter()}>
          <h2 className="landing-section-title">{t('landing.stepsTitle')}</h2>
        </motion.div>
        <div className="landing-steps">
          <motion.div className="step" {...enter(0)}>
            <h3>
              <SignIn size={18} weight="bold" />
              {t('landing.stepLogin')}
            </h3>
            <p>{t('landing.stepLoginDesc')}</p>
          </motion.div>
          <motion.div className="step" {...enter(0.08)}>
            <h3>
              <CloudArrowUp size={18} weight="bold" />
              {t('landing.stepUpload')}
            </h3>
            <p>{t('landing.stepUploadDesc')}</p>
          </motion.div>
          <motion.div className="step" {...enter(0.16)}>
            <h3>
              <ImagesSquare size={18} weight="bold" />
              {t('landing.stepOrganize')}
            </h3>
            <p>{t('landing.stepOrganizeDesc')}</p>
          </motion.div>
          <motion.div className="step" {...enter(0.24)}>
            <h3>
              <ShareFat size={18} weight="bold" />
              {t('landing.stepShare')}
            </h3>
            <p>{t('landing.stepShareDesc')}</p>
          </motion.div>
        </div>
      </section>

      {/* ---------- 底部 CTA ---------- */}
      <section className="landing-cta">
        <motion.h2 {...enter()}>{t('landing.ctaTitle')}</motion.h2>
        <motion.div {...enter(0.1)}>
          <button className="btn btn-primary landing-cta-btn" onClick={startLogin}>
            <SignIn size={17} weight="bold" />
            {t('landing.cta')}
          </button>
        </motion.div>
      </section>

      <footer className="landing-footer">
        <span>{t('brand')}</span>
        <i />
        <a href={oauthServerUrl} target="_blank" rel="noreferrer">
          {t('landing.toolbox')}
        </a>
      </footer>
    </div>
  )
}
