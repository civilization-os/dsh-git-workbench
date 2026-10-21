/**
 * The Git tab's chip title in the right-sidebar header.
 */

import type { ReactNode } from 'react'
import css from './GitBody.module.css'

export interface GitTitleProps {
  useTabInfo: () => { tab: { title: string } }
}

/**
 * Git chip title component with branch glyph and title text.
 * @param props - Slot props including tab info hook.
 * @returns React node for tab chip.
 */
export function GitTitle({ useTabInfo }: GitTitleProps): ReactNode {
  const { tab } = useTabInfo()
  return (
    <span className={css.titleContainer}>
      <svg className={css.titleIcon} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0z" />
      </svg>
      <span className={css.titleText}>{tab.title}</span>
    </span>
  )
}
