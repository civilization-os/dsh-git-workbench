/**
 * Status bar Git branch pill and popover branch switcher (Clean & Elegant UI).
 * Injected into the 'conversation.composer.dock' slot at order: -1.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { GitBranchesSummary, GitStatusSummary } from '../types.ts'
import css from './GitBranchPill.module.css'

const MenuSurface = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, className, style, ...rest }, ref) => (
    <div ref={ref} className={className} style={style} role="dialog" {...rest}>
      {children}
    </div>
  ),
)
MenuSurface.displayName = 'MenuSurface'

function IconBranchOutlineRegular({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0z" />
    </svg>
  )
}

function IconCheckOutlineRegular({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 8 7 12 13 4" />
    </svg>
  )
}

function IconRefreshOutlineRegular({ className }: { className?: string }): React.ReactElement {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2 6" />
      <path d="M2 2v4h4" />
    </svg>
  )
}

export interface GitBranchPillProps {
  getStatus?: ((sessionId?: string) => Promise<GitStatusSummary>) | undefined
  getBranches?: ((sessionId?: string) => Promise<GitBranchesSummary>) | undefined
  checkout?: (
    (sessionId: string | undefined, branch: string, create?: boolean) => Promise<{ success: boolean; message?: string }>
  ) | undefined
  pull?: ((sessionId?: string) => Promise<{ success: boolean; message?: string }>) | undefined
  push?: ((sessionId?: string) => Promise<{ success: boolean; message?: string }>) | undefined
  sessionId?: string | undefined
}

/**
 * Git Branch Pill rendered in the Composer Dock.
 */
export const GitBranchPill = memo(function GitBranchPill({
  getStatus,
  getBranches,
  checkout,
  pull,
  push,
  sessionId,
}: GitBranchPillProps) {
  const [status, setStatus] = useState<GitStatusSummary | null>(null)
  const [branches, setBranches] = useState<GitBranchesSummary | null>(null)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [switching, setSwitching] = useState(false)

  const anchorRef = useRef<HTMLSpanElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverPos, setPopoverPos] = useState<{ bottom: number; left: number } | null>(null)

  // Fetch status and branches from injected actions
  const refresh = useCallback(async () => {
    if (!getStatus || !getBranches) return

    try {
      const [statusRes, branchRes] = await Promise.all([
        getStatus(sessionId),
        getBranches(sessionId),
      ])
      setStatus(statusRes)
      setBranches(branchRes)
    } catch {
      // safe fallback on communication errors
    }
  }, [getStatus, getBranches, sessionId])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5000)
    return () => { clearInterval(timer) }
  }, [refresh])

  // Recalculate popover position relative to anchor button
  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    setPopoverPos({
      bottom: window.innerHeight - rect.top + 8,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)),
    })
  }, [])

  const handleToggle = useCallback((e: MouseEvent) => {
    e.stopPropagation()
    if (!open) {
      updatePosition()
      void refresh()
    }
    setOpen(prev => !prev)
    setCreatingBranch(false)
    setFilter('')
  }, [open, refresh, updatePosition])

  // Dismiss popover on outside click or escape
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (popoverRef.current?.contains(target) || anchorRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // Checkout branch
  const handleCheckout = useCallback(async (branchName: string, create = false) => {
    if (!checkout || switching) return

    setSwitching(true)
    try {
      const res = await checkout(sessionId, branchName, create)
      if (res.success) {
        setOpen(false)
        setCreatingBranch(false)
        setNewBranchName('')
        await refresh()
      } else {
        alert(res.message ?? 'Checkout failed')
      }
    } finally {
      setSwitching(false)
    }
  }, [checkout, refresh, sessionId, switching])

  // Create new branch
  const handleCreateBranchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const trimmed = newBranchName.trim()
      if (trimmed) void handleCheckout(trimmed, true)
    } else if (e.key === 'Escape') {
      setCreatingBranch(false)
    }
  }, [handleCheckout, newBranchName])

  // Pull
  const handlePull = useCallback(async () => {
    if (!pull) return
    await pull(sessionId)
    await refresh()
  }, [pull, refresh, sessionId])

  // Push
  const handlePush = useCallback(async () => {
    if (!push) return
    await push(sessionId)
    await refresh()
  }, [push, refresh, sessionId])

  // Filtered branches
  const filteredLocal = useMemo(() => {
    if (!branches?.local) return []
    const q = filter.trim().toLowerCase()
    return q ? branches.local.filter(b => b.name.toLowerCase().includes(q)) : branches.local
  }, [branches?.local, filter])

  const filteredRemote = useMemo(() => {
    if (!branches?.remote) return []
    const q = filter.trim().toLowerCase()
    return q ? branches.remote.filter(b => b.name.toLowerCase().includes(q)) : branches.remote
  }, [branches?.remote, filter])

  if (status && !status.isRepo) {
    return null
  }

  const currentBranchName = status?.branch || 'main'

  return (
    <span ref={anchorRef} className={css.anchor} data-composer-stat="git-branch">
      <button
        type="button"
        className={css.pill}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Git Branch: ${currentBranchName}`}
        onClick={handleToggle}
      >
        <IconBranchOutlineRegular className={css.icon} />
        <span className={css.branchName}>{currentBranchName}</span>
        {status !== null && status.ahead > 0 && <span className={`${css.badge} ${css.badgeAhead}`}>↑{status.ahead}</span>}
        {status !== null && status.behind > 0 && <span className={`${css.badge} ${css.badgeBehind}`}>↓{status.behind}</span>}
      </button>

      {open && popoverPos && createPortal(
        <MenuSurface
          ref={popoverRef}
          className={css.popover}
          style={{ bottom: `${popoverPos.bottom}px`, left: `${popoverPos.left}px` }}
        >
          <div className={css.header}>
            <div className={css.searchRow}>
              <input
                autoFocus
                className={css.searchInput}
                placeholder="搜索或过滤分支..."
                value={filter}
                onChange={(e) => { setFilter(e.target.value) }}
              />
            </div>

            <div className={css.actionBar}>
              <button
                type="button"
                className={css.toolBtnPrimary}
                onClick={() => { setCreatingBranch(prev => !prev) }}
              >
                <span>+ 新建分支</span>
              </button>
              <div className={css.toolBtnGroup}>
                <button
                  type="button"
                  className={css.toolBtn}
                  onClick={() => { void handlePull() }}
                >
                  Pull
                </button>
                <button
                  type="button"
                  className={css.toolBtn}
                  onClick={() => { void handlePush() }}
                >
                  Push
                </button>
                <button
                  type="button"
                  className={css.toolBtn}
                  title="刷新状态"
                  onClick={() => { void refresh() }}
                >
                  <IconRefreshOutlineRegular className={css.btnIcon} />
                </button>
              </div>
            </div>

            {creatingBranch && (
              <div className={css.newBranchBox}>
                <input
                  autoFocus
                  className={css.newBranchInput}
                  placeholder="新分支名称 (按 Enter 创建)..."
                  value={newBranchName}
                  onChange={(e) => { setNewBranchName(e.target.value) }}
                  onKeyDown={handleCreateBranchKeyDown}
                />
              </div>
            )}
          </div>

          <div className={css.branchList}>
            {/* Local Branches */}
            <div className={css.groupLabel}>本地分支 ({filteredLocal.length})</div>
            {filteredLocal.map(b => (
              <button
                key={b.name}
                type="button"
                className={`${css.branchItem} ${b.isCurrent ? css.currentBranch : ''}`}
                disabled={switching}
                onClick={() => {
                  if (!b.isCurrent) void handleCheckout(b.name)
                }}
              >
                <div className={css.branchItemLeft}>
                  <IconBranchOutlineRegular className={css.itemIcon} />
                  <span className={css.itemText}>{b.name}</span>
                </div>
                {b.isCurrent && <IconCheckOutlineRegular className={css.checkMark} />}
              </button>
            ))}

            {/* Remote Branches */}
            {filteredRemote.length > 0 && (
              <>
                <div className={css.groupLabel}>远程分支 ({filteredRemote.length})</div>
                {filteredRemote.map(b => (
                  <button
                    key={b.name}
                    type="button"
                    className={`${css.branchItem} ${b.isCurrent ? css.currentBranch : ''}`}
                    disabled={switching}
                    onClick={() => {
                      if (!b.isCurrent) void handleCheckout(b.name)
                    }}
                  >
                    <div className={css.branchItemLeft}>
                      <IconBranchOutlineRegular className={css.itemIcon} />
                      <span className={css.itemText}>{b.name}</span>
                    </div>
                    {b.isCurrent && <IconCheckOutlineRegular className={css.checkMark} />}
                  </button>
                ))}
              </>
            )}

            {filteredLocal.length === 0 && filteredRemote.length === 0 && (
              <div className={css.emptyTip}>未找到匹配的分支</div>
            )}
          </div>
        </MenuSurface>,
        document.body,
      )}
    </span>
  )
})
