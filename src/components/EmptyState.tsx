import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

interface Props {
  icon: ReactNode
  title: string
  desc: string
  action?: ReactNode
}

export function EmptyState({ icon, title, desc, action }: Props) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="empty-state"
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{desc}</p>
      {action && <div className="empty-action">{action}</div>}
    </motion.div>
  )
}
