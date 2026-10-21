import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  checkIsGitRepo,
  getGitBranches,
  getGitDiff,
  getGitLog,
  getGitStatus,
  getGitTags,
  gitCreateTag,
  gitDeleteTag,
} from '../src/git-executor.ts'
import * as GitPlugin from '../src/index.ts'

const exec = promisify(execFile)
let testDir: string | undefined

afterEach(async () => {
  if (testDir) {
    try {
      await rm(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 })
    } catch {}
    testDir = undefined
  }
})

describe('git-executor', () => {
  it('correctly inspects repo status, commits, branches, and diffs', async () => {
    testDir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-git-test-')))
    const repo = join(testDir, 'repo')
    await mkdir(repo)

    const git = (...args: string[]) => exec('git', args, {
      cwd: repo,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '',
        GIT_AUTHOR_NAME: 'Test Author',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test Author',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    })

    // Before init
    expect(await checkIsGitRepo(repo)).toBe(false)
    const emptyStatus = await getGitStatus(repo)
    expect(emptyStatus.isRepo).toBe(false)

    // Init repo
    await git('init', '-b', 'main')
    await git('config', 'user.name', 'Test Author')
    await git('config', 'user.email', 'test@example.com')
    expect(await checkIsGitRepo(repo)).toBe(true)

    // Initial commit
    await writeFile(join(repo, 'hello.txt'), 'hello world\n')
    await git('add', 'hello.txt')
    await git('commit', '-m', 'feat: initial commit')

    // Clean status
    let status = await getGitStatus(repo)
    expect(status.isRepo).toBe(true)
    expect(status.branch).toBe('main')
    expect(status.totalChanges).toBe(0)
    expect(status.headCommit?.message).toBe('feat: initial commit')

    // Add modified and untracked files
    await writeFile(join(repo, 'hello.txt'), 'hello world modified\n')
    await writeFile(join(repo, 'new-file.ts'), 'export const x = 1\n')

    status = await getGitStatus(repo)
    expect(status.totalChanges).toBe(2)
    expect(status.unstaged.some(f => f.path === 'hello.txt' && f.status === 'modified')).toBe(true)
    expect(status.untracked.some(f => f.path === 'new-file.ts' && f.status === 'untracked')).toBe(true)

    // Diff
    const diff = await getGitDiff(repo, { path: 'hello.txt' })
    expect(diff.rawDiff).toContain('+hello world modified')
    expect(diff.rawDiff).toContain('-hello world')

    // Log
    const logs = await getGitLog(repo)
    expect(logs.length).toBe(1)
    expect(logs[0]?.subject).toBe('feat: initial commit')
    expect(logs[0]?.author).toBe('Test Author')

    // Branches
    const branches = await getGitBranches(repo)
    expect(branches.some(b => b.name === 'main' && b.isCurrent)).toBe(true)

    // Tags
    const tagRes = await gitCreateTag(repo, 'v0.1.0', undefined, 'first release')
    expect(tagRes.success).toBe(true)
    const tags = await getGitTags(repo)
    expect(tags.length).toBe(1)
    expect(tags[0]?.name).toBe('v0.1.0')
    expect(tags[0]?.isAnnotated).toBe(true)
    expect(tags[0]?.message).toBe('first release')

    const delRes = await gitDeleteTag(repo, 'v0.1.0')
    expect(delRes.success).toBe(true)
    expect((await getGitTags(repo)).length).toBe(0)
  })
})

describe('git host plugin', () => {
  it('registers webServer HTTP prefix routes and handles client RPC requests', async () => {
    testDir = await realpath(await mkdtemp(join(tmpdir(), 'dsh-git-plugin-test-')))
    const repo = join(testDir, 'repo')
    await mkdir(repo)

    const git = (...args: string[]) => exec('git', args, { cwd: repo })
    await git('init', '-b', 'master')
    await git('config', 'user.name', 'Plugin Tester')
    await git('config', 'user.email', 'tester@example.com')
    await writeFile(join(repo, 'readme.md'), '# Test\n')
    await git('add', 'readme.md')
    await git('commit', '-m', 'docs: init readme')

    const ctx = new Context()
    let registeredRoute: any

    // Mock webServer service
    ctx.provide('webServer')
    ;(ctx as any).webServer = {
      register: (route: any) => {
        registeredRoute = route
        return () => {}
      },
    }

    // Mock sessions service
    ctx.provide('sessions')
    ;(ctx as any).sessions = {
      get: () => undefined,
    }

    // Mock sandbox policy
    ctx.provide('sandboxPolicy')
    ;(ctx as any).sandboxPolicy = { workspaceRoot: repo }

    GitPlugin.apply(ctx)
    expect(registeredRoute).toBeDefined()
    expect(registeredRoute.path).toBe('/git')

    const callRpc = (endpoint: string, payload: any): Promise<any> => {
      return new Promise<any>((resolve, reject) => {
        let responseData = ''
        let statusCode = 200
        const req = {
          method: 'POST',
          url: `http://localhost/git/${endpoint}`,
          on: (event: string, cb: any) => {
            if (event === 'data') {
              cb(Buffer.from(JSON.stringify({ type: 'client-request', rpcId: 'test-1', payload })))
            } else if (event === 'end') {
              cb()
            }
          },
        }
        const res = {
          writeHead: (code: number) => { statusCode = code },
          end: (data: string) => {
            responseData = data
            try {
              expect(statusCode).toBe(200)
              const parsed = JSON.parse(responseData)
              expect(parsed.type).toBe('server-response')
              expect(parsed.rpcId).toBe('test-1')
              resolve(parsed.result)
            } catch (e) {
              reject(e)
            }
          },
        }
        registeredRoute.handler(req, res).catch(reject)
      })
    }

    // Test RPC status
    const statusResult = await callRpc('status', {})
    expect(statusResult.ok).toBe(true)
    expect(statusResult.value.isRepo).toBe(true)
    expect(statusResult.value.branch).toBe('master')

    // Test RPC log with DAG topology
    const logResult = await callRpc('log', { maxCount: 5 })
    expect(logResult.ok).toBe(true)
    expect(logResult.value.length).toBe(1)
    expect(logResult.value[0]?.subject).toBe('docs: init readme')
    expect(logResult.value[0]?.lane).toBe(0)
    expect(Array.isArray(logResult.value[0]?.paths)).toBe(true)

    // Test RPC checkout new branch
    const checkoutResult = await callRpc('checkout', { branch: 'feat/test-branch', create: true })
    expect(checkoutResult.ok).toBe(true)
    expect(checkoutResult.value.success).toBe(true)

    // Check status reflects new branch
    const branchStatus = await callRpc('status', {})
    expect(branchStatus.value.branch).toBe('feat/test-branch')

    // Test RPC createTag
    const createTagRes = await callRpc('createTag', { name: 'v1.0.0', message: 'prod release' })
    expect(createTagRes.ok).toBe(true)
    expect(createTagRes.value.success).toBe(true)

    // Test RPC tags query
    const tagsRes = await callRpc('tags', {})
    expect(tagsRes.ok).toBe(true)
    expect(tagsRes.value.some((t: any) => t.name === 'v1.0.0')).toBe(true)

    // Test RPC deleteTag
    const delTagRes = await callRpc('deleteTag', { name: 'v1.0.0' })
    expect(delTagRes.ok).toBe(true)
    expect(delTagRes.value.success).toBe(true)

    await ctx.fiber.dispose()
  })
})
