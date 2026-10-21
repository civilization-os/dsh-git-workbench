/**
 * Host entry for the Git Workbench & source control plugin.
 * Provides RPC endpoints for the Client right-sidebar viewer, status bar, and model tools for Agents.
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  getGitAllBranches,
  getGitCommitDetails,
  getGitDiff,
  getGitLog,
  getGitStatus,
  getGitTags,
  gitCheckout,
  gitCommit,
  gitCreateTag,
  gitDeleteTag,
  gitDiscard,
  gitFetch,
  gitPull,
  gitPush,
  gitStage,
  gitUnstage,
} from './git-executor.ts'
import { registerGitTool } from './tool.ts'

export type * from './types.ts'

/** Cordis plugin name */
export const name = '@civilization/dsh-git-sidebar'

/** Required host services */
export const inject = ['connection']

interface HostServices {
  connection: {
    rpc: {
      handle: (
        channel: string,
        handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>
      ) => () => void
    }
  }
  sessions?: {
    get: (id: string) => { header?: { cwd?: string } } | undefined
  }
  sandboxPolicy?: {
    workspaceRoot?: string
  }
}

/**
 * Apply the Git host plugin.
 * Sets up authenticated RPC handlers under `/git/*` and registers the model tool.
 * @param ctx - Context carrying the connection and optional session services.
 */
export function apply(ctx: Context): void {
  const host = ctx as any as HostServices
  const resolveTargetDir = (sessionId?: string): string => {
    if (sessionId) {
      const liveCwd = host.sessions?.get(sessionId)?.header?.cwd
      if (liveCwd) return liveCwd
    }
    const workspaceRoot = host.sandboxPolicy?.workspaceRoot
    return workspaceRoot ?? process.cwd()
  }

  // Register dedicated /git RPC channel
  host.connection.rpc.handle(
    '/git',
    async (endpoint: string, payload: unknown, _signal: AbortSignal) => {
      const body = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined
      const cwd = typeof body.path === 'string' ? body.path : resolveTargetDir(sessionId)

      try {
        if (endpoint === 'status') {
          const status = await getGitStatus(cwd)
          return { ok: true, value: status }
        }

        if (endpoint === 'log') {
          const maxCount = typeof body.maxCount === 'number' ? body.maxCount : 50
          const commits = await getGitLog(cwd, maxCount)
          return { ok: true, value: commits }
        }

        if (endpoint === 'commitDetails') {
          const commit = typeof body.commit === 'string' ? body.commit : ''
          const details = await getGitCommitDetails(cwd, commit)
          return { ok: true, value: details }
        }

        if (endpoint === 'diff') {
          const path = typeof body.filePath === 'string' ? body.filePath : undefined
          const staged = typeof body.staged === 'boolean' ? body.staged : false
          const commit = typeof body.commit === 'string' ? body.commit : undefined
          const diff = await getGitDiff(cwd, {
            ...path !== undefined ? { path } : {},
            staged,
            ...commit !== undefined ? { commit } : {},
          })
          return { ok: true, value: diff }
        }

        if (endpoint === 'branches') {
          const branches = await getGitAllBranches(cwd)
          return { ok: true, value: branches }
        }

        if (endpoint === 'checkout') {
          const branch = typeof body.branch === 'string' ? body.branch : ''
          const createNew = typeof body.create === 'boolean' ? body.create : false
          const result = await gitCheckout(cwd, branch, createNew)
          return { ok: true, value: result }
        }

        if (endpoint === 'stage') {
          const paths = Array.isArray(body.paths)
            ? (body.paths as string[])
            : body.paths === 'all'
              ? 'all'
              : typeof body.path === 'string'
                ? [body.path]
                : 'all'
          const result = await gitStage(cwd, paths)
          return { ok: true, value: result }
        }

        if (endpoint === 'unstage') {
          const paths = Array.isArray(body.paths)
            ? (body.paths as string[])
            : body.paths === 'all'
              ? 'all'
              : typeof body.path === 'string'
                ? [body.path]
                : 'all'
          const result = await gitUnstage(cwd, paths)
          return { ok: true, value: result }
        }

        if (endpoint === 'discard') {
          const paths = Array.isArray(body.paths)
            ? (body.paths as string[])
            : typeof body.path === 'string'
              ? [body.path]
              : []
          const result = await gitDiscard(cwd, paths)
          return { ok: true, value: result }
        }

        if (endpoint === 'commit') {
          const message = typeof body.message === 'string' ? body.message : ''
          const result = await gitCommit(cwd, message)
          return { ok: true, value: result }
        }

        if (endpoint === 'fetch') {
          const result = await gitFetch(cwd)
          return { ok: true, value: result }
        }

        if (endpoint === 'pull') {
          const result = await gitPull(cwd)
          return { ok: true, value: result }
        }

        if (endpoint === 'push') {
          const result = await gitPush(cwd)
          return { ok: true, value: result }
        }

        if (endpoint === 'tags') {
          const tags = await getGitTags(cwd)
          return { ok: true, value: tags }
        }

        if (endpoint === 'createTag') {
          const name = typeof body.name === 'string' ? body.name : ''
          const commit = typeof body.commit === 'string' ? body.commit : undefined
          const message = typeof body.message === 'string' ? body.message : undefined
          const result = await gitCreateTag(cwd, name, commit, message)
          return { ok: true, value: result }
        }

        if (endpoint === 'deleteTag') {
          const name = typeof body.name === 'string' ? body.name : ''
          const result = await gitDeleteTag(cwd, name)
          return { ok: true, value: result }
        }


        return {
          ok: false,
          error: {
            code: 'git/not_found',
            message: `Unknown git RPC endpoint: ${endpoint}`,
            details: {},
          },
        }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'git/error',
            message: error instanceof Error ? error.message : String(error),
            details: {},
          },
        }
      }
    },
  )


  // Register the agent tool
  registerGitTool(ctx, resolveTargetDir)
}
