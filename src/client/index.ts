/**
 * Browser entry for the Git right-sidebar plugin.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  GitBranchesSummary,
  GitCommitDetail,
  GitCommitItem,
  GitDiffSummary,
  GitStatusSummary,
  GitTagItem,
} from '../types.ts'
import { GIT_ID, gitDefinition } from './definition.tsx'
import { GitBody, type GitInjected } from './GitBody.tsx'
import { GitBranchPill } from './GitBranchPill.tsx'
import { GitTitle } from './GitTitle.tsx'
import { en, NS, zh } from './locales.ts'

export type { GitBodyProps, GitInjected } from './GitBody.tsx'
export type { GitViewKey } from './locales.ts'

export interface ConnectionHandle {
  rpc: {
    call: (
      channel: string,
      method: string,
      params?: unknown,
    ) => Promise<{ ok: true; value: unknown } | { ok: false; error: { message: string } }>
  }
}

export interface ClientContext extends Context {
  locale?: any
  sidebarRightTabs?: any
  sidebarRight?: any
  slots?: any
  shortcuts?: any
  connection?: ConnectionHandle
}

/**
 * Required browser services.
 */
export const inject = ['connection', 'slots', 'locale', 'sidebarRightTabs', 'sidebarRight']

/**
 * Client plugin body: registers Git tab definition, locales, shortcut, and components.
 * @param ctx - Client context carrying slots and connection services.
 */
export function apply(ctx: Context): void {
  const client = ctx as ClientContext
  const t = client.locale?.bind?.(NS) ?? ((key: string) => key)

  // Register localization dictionaries
  ctx.effect(() => client.locale?.register?.(NS, { zh, en }), 'git: locales')

  // Register tab definition
  ctx.effect(() => client.sidebarRightTabs?.register?.(gitDefinition(t)), 'git: tab definition')

  // Register shortcut command
  ctx.inject(['shortcuts'], (scope: any) => {
    scope.effect(() => scope.shortcuts?.register?.({
      id: 'workspace.git',
      label: () => t('guide.title'),
      aliases: ['workspace git', 'git', 'source control'],
      defaults: {
        'desktop:macos': { code: 'KeyG', modifiers: ['primary', 'shift'] },
        'desktop:windows': { code: 'KeyG', modifiers: ['primary', 'shift'] },
        'desktop:linux': { code: 'KeyG', modifiers: ['primary', 'shift'] },
        'web:macos': { code: 'KeyG', modifiers: ['primary', 'shift'] },
        'web:windows': { code: 'KeyG', modifiers: ['primary', 'shift'] },
      },
      regions: ['page', 'editable', 'terminal'],
      modals: [],
      resolve: ({ target: element }: { target: any }) => {
        const target = scope.sidebarRight?.commandTarget?.(element)
        if (target === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
        return { status: 'handled', run: () => { scope.sidebarRight?.openTabFromTarget?.('git', target) } }
      },
    }), 'git: shortcut')
  })

  // Define RPC actions bound to Connection
  const getConnection = (): ConnectionHandle => {
    const handle = (client.get?.('connection') ?? client.connection) as ConnectionHandle | undefined
    if (!handle) throw new Error('Connection service not available')
    return handle
  }

  const actions: GitInjected = {
    getStatus: async (sessionId) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'status', { sessionId })
      if (!res.ok) throw new Error(res.error.message)
      return res.value as GitStatusSummary
    },
    getLog: async (sessionId, maxCount) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'log', { sessionId, maxCount })
      if (!res.ok) throw new Error(res.error.message)
      return res.value as readonly GitCommitItem[]
    },
    getCommitDetails: async (sessionId, commit) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'commitDetails', { sessionId, commit })
      if (!res.ok) throw new Error(res.error.message)
      return res.value as GitCommitDetail | undefined
    },
    getDiff: async (sessionId, options) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'diff', { sessionId, ...options })
      if (!res.ok) throw new Error(res.error.message)
      return res.value as GitDiffSummary
    },
    getBranches: async (sessionId) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'branches', { sessionId })
      if (!res.ok) throw new Error(res.error.message)
      return res.value as GitBranchesSummary
    },
    checkout: async (sessionId, branch, create) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'checkout', { sessionId, branch, create })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    stage: async (sessionId, paths) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'stage', { sessionId, paths })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    unstage: async (sessionId, paths) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'unstage', { sessionId, paths })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    discard: async (sessionId, paths) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'discard', { sessionId, paths })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    commit: async (sessionId, message) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'commit', { sessionId, message })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    fetch: async (sessionId) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'fetch', { sessionId })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    pull: async (sessionId) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'pull', { sessionId })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    push: async (sessionId) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'push', { sessionId })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    getTags: async (sessionId) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'tags', { sessionId })
      if (!res.ok) throw new Error(res.error.message)
      return res.value as readonly GitTagItem[]
    },
    createTag: async (sessionId, name, commit, message) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'createTag', { sessionId, name, commit, message })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
    deleteTag: async (sessionId, name) => {
      const conn = getConnection()
      const res = await conn.rpc.call('/git', 'deleteTag', { sessionId, name })
      if (!res.ok) return { success: false, message: res.error.message }
      return res.value as { success: boolean; message?: string }
    },
  }


  // Register slot implementations
  ctx.effect(() => client.slots?.inject?.('sidebar.right.pane.tab', () => client.slots.register(
    {
      name: 'sidebar.right.pane.tab',
      key: GIT_ID,
      locale: NS,
      inject: () => actions,
    },
    GitBody,
  )), 'git: tab body')

  ctx.effect(() => client.slots?.inject?.('sidebar.right.pane.tab.title', () => client.slots.register(
    {
      name: 'sidebar.right.pane.tab.title',
      key: GIT_ID,
    },
    GitTitle,
  )), 'git: tab title')

  // Register Git Branch Pill in conversation composer dock (status bar at bottom)
  ctx.effect(() => client.slots?.inject?.('conversation.composer.dock', () => client.slots.register(
    {
      name: 'conversation.composer.dock',
      id: 'git-branch',
      order: -1,
      locale: NS,
      inject: () => actions,
    },
    GitBranchPill,
  )), 'git: composer dock pill')
}
