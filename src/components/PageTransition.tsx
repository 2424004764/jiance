import { useReducedMotion, motion } from 'motion/react'
import type { ReactNode } from 'react'

export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="page"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
