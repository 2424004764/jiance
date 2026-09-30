import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle, WarningCircle, Info } from '@phosphor-icons/react'
import { useToasts } from '../lib/store'
import type { ToastType } from '../lib/types'

const ICONS: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
}

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <motion.button
              key={t.id}
              className={`toast toast-${t.type}`}
              initial={{ opacity: 0, y: 20, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              onClick={() => dismiss(t.id)}
            >
              <Icon size={17} weight="fill" />
              <span>{t.message}</span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
