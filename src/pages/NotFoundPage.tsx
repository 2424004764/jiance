import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from '@phosphor-icons/react'
import { PageTransition } from '../components/PageTransition'
import { EmptyState } from '../components/EmptyState'
import { useT } from '../lib/i18n'

export function NotFoundPage() {
  const { t, lang } = useT()
  useEffect(() => {
    document.title = t('nf.docTitle')
  }, [t, lang])

  return (
    <PageTransition>
      <EmptyState
        icon={<Compass size={30} weight="thin" />}
        title={t('nf.title')}
        desc={t('nf.desc')}
        action={
          <Link className="btn btn-primary" to="/">
            {t('nf.cta')}
          </Link>
        }
      />
    </PageTransition>
  )
}
