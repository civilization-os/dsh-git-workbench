/**
 * Agent model tool for inspecting Git repository status, commits, and diffs.
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[]
import {
  getGitAllBranches,
  getGitCommitDetails,
  getGitDiff,
  getGitLog,
  getGitStatus,
  getGitTags,
  gitCheckout,
  gitCreateTag,
  gitDeleteTag,
} from './git-executor.ts'

/**
 * Register git model tools (git_view and git_checkout) in the tools service.
 * @param ctx - Context carrying the tools service.
 * @param resolveDir - Resolver for the current agent or session working directory.
 */
export function registerGitTool(ctx: Context, resolveDir: (sessionId?: string) => string): void {
  ctx.inject(['tools'], (scope) => {
    // 1. Tool for inspecting git status, DAG history, diff, and branches
    scope.effect(() => scope.tools.register(defineTool({
      name: 'git_view',
      description: 'Inspect the current project Git repository status, changed files, DAG commit tree, branch list, or code diffs.',
      parameters: {
        action: {
          type: 'string',
          enum: ['status', 'log', 'diff', 'branches', 'commit', 'tags'],
          description: 'The Git query action: "status" (changes and branch info), "log" (commits with DAG topology rails), "diff" (code diffs), "branches" (branch list), "commit" (commit details), or "tags" (all repository tags).',
        },
        path: {
          type: 'string',
          description: 'Optional file path filter for diff or status inspection.',
        },
        staged: {
          type: 'boolean',
          description: 'Whether to check staged changes when viewing diff (defaults to false for working tree changes).',
        },
        maxCount: {
          type: 'number',
          description: 'Maximum number of commits to retrieve when action is "log" (defaults to 30).',
        },
        commit: {
          type: 'string',
          description: 'Specific commit hash to inspect diff or details for.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec): Promise<Record<string, JsonValue>> {
        const cwd = resolveDir(exec.agent?.session.id)
        const action = args.action ?? 'status'

        switch (action) {
          case 'log': {
            const rawCommits = await getGitLog(cwd, args.maxCount ?? 30)
            const commits = rawCommits.map(c => ({
              hash: c.hash,
              shortHash: c.shortHash,
              author: c.author,
              authorEmail: c.authorEmail,
              relativeDate: c.relativeDate,
              date: c.date,
              subject: c.subject,
              parents: c.parents ? [...c.parents] : [],
              refs: c.refs ? [...c.refs] : [],
              ...c.lane !== undefined ? { lane: c.lane } : {},
              ...c.laneColor !== undefined ? { laneColor: c.laneColor } : {},
            }))
            return { action: 'log', count: commits.length, commits }
          }
          case 'commit': {
            if (!args.commit) {
              return { action: 'commit', error: 'Missing commit parameter' }
            }
            const details = await getGitCommitDetails(cwd, args.commit)
            if (!details) return { action: 'commit', found: false }
            return {
              action: 'commit',
              found: true,
              commit: {
                hash: details.commit.hash,
                shortHash: details.commit.shortHash,
                author: details.commit.author,
                date: details.commit.date,
                subject: details.commit.subject,
              },
              files: details.files.map(f => ({
                path: f.path,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
              })),
              totalAdditions: details.totalAdditions,
              totalDeletions: details.totalDeletions,
            }
          }
          case 'diff': {
            const diff = await getGitDiff(cwd, {
              ...args.path !== undefined ? { path: args.path } : {},
              ...args.staged !== undefined ? { staged: args.staged } : {},
              ...args.commit !== undefined ? { commit: args.commit } : {},
            })
            const files = diff.files.map(f => ({ path: f.path, additions: f.additions, deletions: f.deletions }))
            return { action: 'diff', files, rawDiff: diff.rawDiff }
          }
          case 'branches': {
            const summary = await getGitAllBranches(cwd)
            return {
              action: 'branches',
              ...summary.current !== undefined ? { current: summary.current } : {},
              local: summary.local.map(b => ({
                name: b.name,
                isCurrent: b.isCurrent,
                ...b.upstream !== undefined ? { upstream: b.upstream } : {},
                ...b.ahead !== undefined ? { ahead: b.ahead } : {},
                ...b.behind !== undefined ? { behind: b.behind } : {},
              })),
              remote: summary.remote.map(b => ({
                name: b.name,
                isCurrent: b.isCurrent,
              })),
            }
          }
          case 'tags': {
            const rawTags = await getGitTags(cwd)
            return {
              action: 'tags',
              total: rawTags.length,
              tags: rawTags.map(t => ({
                name: t.name,
                commitHash: t.commitHash,
                shortHash: t.shortHash,
                date: t.date,
                relativeDate: t.relativeDate,
                message: t.message,
                author: t.author,
                isAnnotated: t.isAnnotated,
              })),
            }
          }
          case 'status':
          default: {
            const status = await getGitStatus(cwd)
            return {
              action: 'status',
              isRepo: status.isRepo,
              ...status.rootPath !== undefined ? { rootPath: status.rootPath } : {},
              ...status.branch !== undefined ? { branch: status.branch } : {},
              ...status.upstream !== undefined ? { upstream: status.upstream } : {},
              ahead: status.ahead,
              behind: status.behind,
              staged: status.staged.map(f => ({ path: f.path, status: f.status, staged: f.staged })),
              unstaged: status.unstaged.map(f => ({ path: f.path, status: f.status, staged: f.staged })),
              untracked: status.untracked.map(f => ({ path: f.path, status: f.status, staged: f.staged })),
              totalChanges: status.totalChanges,
            }
          }
        }
      },
      presentCall: args => ({ card: 'generic', title: `git_view (${args.action ?? 'status'})`, rawInput: args }),
    })), 'experimental-git: register git_view tool')

    // 2. Dedicated tool for checking out or creating branches
    scope.effect(() => scope.tools.register(defineTool({
      name: 'git_checkout',
      description: 'Switch branch or create and checkout a new branch in the current project Git repository.',
      parameters: {
        branch: {
          type: 'string',
          required: true,
          description: 'The target branch name to switch to (e.g. "feature/auth", "dev", "master").',
        },
        create: {
          type: 'boolean',
          description: 'Whether to create a new branch from current HEAD and check it out (-b). Defaults to false.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
        render: (_args, val) => {
          const value = val as { success?: boolean; branch?: string; message?: string }
          return [{
            type: 'text',
            text: value.success
              ? `Successfully checked out branch '${value.branch ?? ''}'.`
              : `Failed to checkout branch '${value.branch ?? ''}': ${value.message ?? ''}`,
          }]
        },
      },

      async execute(args, exec): Promise<Record<string, JsonValue>> {
        const cwd = resolveDir(exec.agent?.session.id)
        const branch = args.branch.trim()
        const createNew = args.create ?? false
        const result = await gitCheckout(cwd, branch, createNew)

        return {
          success: result.success,
          branch,
          message: result.message ?? '',
        }
      },
      presentCall: args => ({
        card: 'generic',
        title: `git_checkout ${args.create ? '-b ' : ''}${args.branch}`,
        rawInput: args,
      }),
    })), 'experimental-git: register git_checkout tool')

    // 3. Dedicated tool for creating or deleting git tags
    scope.effect(() => scope.tools.register(defineTool({
      name: 'git_tag',
      description: 'Create or delete a Git tag in the current project repository.',
      parameters: {
        name: {
          type: 'string',
          required: true,
          description: 'The tag name (e.g. "v1.0.0", "release-20261020").',
        },
        action: {
          type: 'string',
          enum: ['create', 'delete'],
          description: 'Tag operation: "create" (default) or "delete".',
        },
        commit: {
          type: 'string',
          description: 'Target commit hash to place the tag on when creating (defaults to current HEAD).',
        },
        message: {
          type: 'string',
          description: 'Optional annotation message for an annotated tag (git tag -a -m).',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
        },
        render: (_args, val) => {
          const value = val as { success?: boolean; name?: string; message?: string }
          return [{
            type: 'text',
            text: value.message ?? (value.success ? 'Success' : 'Failed'),
          }]
        },
      },
      async execute(args, exec): Promise<Record<string, JsonValue>> {
        const cwd = resolveDir(exec.agent?.session.id)
        const name = args.name.trim()
        const action = args.action ?? 'create'

        if (action === 'delete') {
          const result = await gitDeleteTag(cwd, name)
          return {
            success: result.success,
            name,
            action: 'delete',
            message: result.message ?? '',
          }
        }

        const result = await gitCreateTag(cwd, name, args.commit, args.message)
        return {
          success: result.success,
          name,
          action: 'create',
          message: result.message ?? '',
        }
      },
      presentCall: args => ({
        card: 'generic',
        title: `git_tag ${args.action ?? 'create'} ${args.name}`,
        rawInput: args,
      }),
    })), 'experimental-git: register git_tag tool')
  })
}
