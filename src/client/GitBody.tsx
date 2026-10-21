/**
 * IntelliJ IDEA-Grade Git Tool Window Component.
 * Supports DAG commit topology graph visualization, working tree staging, commit console,
 * branch switcher, and unified diff inspector.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, ReactElement } from 'react'
import type {
  GitBranchesSummary,
  GitCommitDetail,
  GitCommitItem,
  GitDiffSummary,
  GitStatusSummary,
  GitTagItem,
} from '../types.ts'
import {
  computeDagGraph,
  formatFullDate,
  getAuthorAvatar,
  parseConventionalCommit,
} from './git-helpers.ts'
import type {} from './locales.ts'
import css from './GitBody.module.css'

function getTypeBadgeClass(type?: string): string {
  switch (type) {
    case 'feat': return css.typeFeat ?? ''
    case 'fix': return css.typeFix ?? ''
    case 'style': return css.typeStyle ?? ''
    case 'refactor': return css.typeRefactor ?? ''
    case 'release': return css.typeRelease ?? ''
    case 'merge': return css.typeMerge ?? ''
    case 'test': return css.typeTest ?? ''
    case 'docs': return css.typeDocs ?? ''
    case 'revert': return css.typeRevert ?? ''
    case 'chore':
    default:
      return css.typeChore ?? ''
  }
}


/** Injected Git RPC methods */
export interface GitInjected {
  readonly getStatus: (sessionId?: string) => Promise<GitStatusSummary>
  readonly getLog: (sessionId?: string, maxCount?: number) => Promise<readonly GitCommitItem[]>
  readonly getCommitDetails: (sessionId?: string, commit?: string) => Promise<GitCommitDetail | undefined>
  readonly getDiff: (sessionId?: string, options?: { filePath?: string; staged?: boolean; commit?: string }) => Promise<GitDiffSummary>
  readonly getBranches: (sessionId?: string) => Promise<GitBranchesSummary>
  readonly checkout: (sessionId?: string, branch?: string, create?: boolean) => Promise<{ success: boolean; message?: string }>
  readonly stage: (sessionId?: string, paths?: string[] | 'all') => Promise<{ success: boolean; message?: string }>
  readonly unstage: (sessionId?: string, paths?: string[] | 'all') => Promise<{ success: boolean; message?: string }>
  readonly discard: (sessionId?: string, paths?: string[]) => Promise<{ success: boolean; message?: string }>
  readonly commit: (sessionId?: string, message?: string) => Promise<{ success: boolean; message?: string }>
  readonly fetch: (sessionId?: string) => Promise<{ success: boolean; message?: string }>
  readonly pull: (sessionId?: string) => Promise<{ success: boolean; message?: string }>
  readonly push: (sessionId?: string) => Promise<{ success: boolean; message?: string }>
  readonly getTags: (sessionId?: string) => Promise<readonly GitTagItem[]>
  readonly createTag: (
    sessionId?: string,
    name?: string,
    commit?: string,
    message?: string,
  ) => Promise<{ success: boolean; message?: string }>
  readonly deleteTag: (sessionId?: string, name?: string) => Promise<{ success: boolean; message?: string }>
}

export interface GitBodyProps extends GitInjected {
  readonly sessionId?: string
  readonly t: (key: string, ...args: any[]) => string
}

type ActiveTab = 'changes' | 'tree' | 'branches' | 'tags'

/**
 * Render color-coded unified diff lines.
 */
function DiffViewer({ diffText }: { readonly diffText: string }): ReactElement {
  if (!diffText.trim()) {
    return <div className={css.diffViewer}>无代码内容变动</div>
  }

  const lines = diffText.split('\n')
  return (
    <div className={css.diffViewer}>
      {lines.map((line, idx) => {
        let lineClass = css.diffLine
        if (line.startsWith('+') && !line.startsWith('+++')) lineClass = `${css.diffLine} ${css.diffAdd}`
        else if (line.startsWith('-') && !line.startsWith('---')) lineClass = `${css.diffLine} ${css.diffDel}`
        else if (line.startsWith('@@')) lineClass = `${css.diffLine} ${css.diffHunk}`

        return (
          <div key={idx} className={lineClass}>
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}


/**
 * Main Git Body Component.
 */
export const GitBody = memo(function GitBody(props: GitBodyProps) {
  const {
    t,
    sessionId,
    getStatus,
    getLog,
    getCommitDetails,
    getDiff,
    getBranches,
    getTags,
    createTag,
    deleteTag,
    checkout,
    stage,
    unstage,
    discard,
    commit,
    fetch: fetchGit,
    pull,
    push,
  } = props

  const [activeTab, setActiveTab] = useState<ActiveTab>('changes')
  const [loading, setLoading] = useState(false)

  const [status, setStatus] = useState<GitStatusSummary | null>(null)
  const [commits, setCommits] = useState<readonly GitCommitItem[]>([])
  const [branches, setBranches] = useState<GitBranchesSummary | null>(null)
  const [tags, setTags] = useState<readonly GitTagItem[]>([])

  // Commit Console State
  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  // Diff Preview State
  const [selectedFileDiff, setSelectedFileDiff] = useState<{ path: string; staged: boolean; diff: string } | null>(null)

  // Tree Selected Commit State
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null)
  const [commitDetail, setCommitDetail] = useState<GitCommitDetail | null>(null)

  // Locate in DAG Tree State
  const [highlightedCommitHash, setHighlightedCommitHash] = useState<string | null>(null)
  const [locatedNotice, setLocatedNotice] = useState<string | null>(null)

  // Tree Filter & Search State
  const [treeSearch, setTreeSearch] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'mainline'>('all')

  // Branch Filter State
  const [branchFilter, setBranchFilter] = useState('')
  const [newBranchName, setNewBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)

  // Tag Management State
  const [tagFilter, setTagFilter] = useState('')
  const [creatingTag, setCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagCommit, setNewTagCommit] = useState('')
  const [newTagMessage, setNewTagMessage] = useState('')

  // Fetch full repository data
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, logRes, branchRes, tagRes] = await Promise.all([
        getStatus(sessionId).catch(() => null),
        getLog(sessionId, 50).catch(() => []),
        getBranches(sessionId).catch(() => null),
        getTags(sessionId).catch(() => []),
      ])
      if (statusRes) setStatus(statusRes)
      setCommits(logRes)
      if (branchRes) setBranches(branchRes)
      setTags(tagRes)
    } finally {
      setLoading(false)
    }
  }, [getBranches, getLog, getStatus, getTags, sessionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Inspect commit details when a tree node is clicked
  const handleSelectCommit = useCallback(async (hash: string) => {
    if (selectedCommitHash === hash) {
      setSelectedCommitHash(null)
      setCommitDetail(null)
      return
    }
    setSelectedCommitHash(hash)
    try {
      const details = await getCommitDetails(sessionId, hash)
      setCommitDetail(details ?? null)
    } catch {
      setCommitDetail(null)
    }
  }, [getCommitDetails, selectedCommitHash, sessionId])

  // Inspect file diff
  const handleViewDiff = useCallback(async (path: string, staged: boolean, commitHash?: string) => {
    try {
      const res = await getDiff(sessionId, {
        filePath: path,
        staged,
        ...commitHash !== undefined ? { commit: commitHash } : {},
      })
      setSelectedFileDiff({
        path,
        staged,
        diff: res.rawDiff,
      })
    } catch {
      setSelectedFileDiff(null)
    }
  }, [getDiff, sessionId])

  // Stage / Unstage / Discard
  const handleStage = useCallback(async (paths: string[] | 'all') => {
    await stage(sessionId, paths)
    await refresh()
  }, [refresh, sessionId, stage])

  const handleUnstage = useCallback(async (paths: string[] | 'all') => {
    await unstage(sessionId, paths)
    await refresh()
  }, [refresh, sessionId, unstage])

  const handleDiscard = useCallback(async (paths: string[]) => {
    if (confirm(`确认放弃对 ${paths.length} 个文件的所有更改吗？此操作无法撤销。`)) {
      await discard(sessionId, paths)
      await refresh()
    }
  }, [discard, refresh, sessionId])

  // Commit
  const handleCommit = useCallback(async (andPush = false) => {
    const trimmed = commitMessage.trim()
    if (!trimmed) {
      alert(t('commit.emptyWarning'))
      return
    }

    setCommitting(true)
    try {
      const res = await commit(sessionId, trimmed)
      if (res.success) {
        setCommitMessage('')
        if (andPush) {
          await push(sessionId)
        }
        await refresh()
      } else {
        alert(res.message || '提交失败')
      }
    } finally {
      setCommitting(false)
    }
  }, [commit, commitMessage, push, refresh, sessionId, t])

  const handleCommitKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleCommit(false)
    }
  }, [handleCommit])

  // Branch Switch
  const handleCheckoutBranch = useCallback(async (bName: string, create = false) => {
    const res = await checkout(sessionId, bName, create)
    if (res.success) {
      setCreatingBranch(false)
      setNewBranchName('')
      await refresh()
    } else {
      alert(res.message || '检出失败')
    }
  }, [checkout, refresh, sessionId])


  // Locate commit in DAG tree and pulse glow
  const handleLocateCommit = useCallback(async (commitHash: string, tagName?: string) => {
    setActiveTab('tree')
    let found = commits.find(c => c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash))
    if (!found) {
      try {
        const deepLogs = await getLog(sessionId, 200)
        setCommits(deepLogs)
        found = deepLogs.find(c => c.hash.startsWith(commitHash) || commitHash.startsWith(c.hash))
      } catch {
        // Continue with current list
      }
    }

    if (found) {
      setSelectedCommitHash(found.hash)
      setHighlightedCommitHash(found.hash)
      if (tagName) {
        setLocatedNotice(t('tag.locatedNotice', { name: tagName }))
        setTimeout(() => { setLocatedNotice(null) }, 3000)
      }
      void handleSelectCommit(found.hash)
      setTimeout(() => {
        const el = document.getElementById(`git-commit-${found.hash}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
      setTimeout(() => {
        setHighlightedCommitHash(null)
      }, 3500)
    }
  }, [commits, getLog, handleSelectCommit, sessionId, t])

  // Create Tag
  const handleCreateTag = useCallback(async () => {
    const name = newTagName.trim()
    if (!name) {
      alert('请输入标签名称')
      return
    }
    const targetCommit = newTagCommit.trim() || undefined
    const message = newTagMessage.trim() || undefined
    const res = await createTag(sessionId, name, targetCommit, message)
    if (res.success) {
      setCreatingTag(false)
      setNewTagName('')
      setNewTagCommit('')
      setNewTagMessage('')
      await refresh()
    } else {
      alert(res.message || '创建标签失败')
    }
  }, [createTag, newTagCommit, newTagMessage, newTagName, refresh, sessionId])

  // Delete Tag
  const handleDeleteTag = useCallback(async (tagName: string) => {
    if (confirm(t('tag.deleteConfirm', { name: tagName }))) {
      const res = await deleteTag(sessionId, tagName)
      if (res.success) {
        await refresh()
      } else {
        alert(res.message || '删除标签失败')
      }
    }
  }, [deleteTag, refresh, sessionId, t])

  // Filtered branches for branch tab
  const filteredLocalBranches = useMemo(() => {
    if (!branches?.local) return []
    const q = branchFilter.trim().toLowerCase()
    return q ? branches.local.filter(b => b.name.toLowerCase().includes(q)) : branches.local
  }, [branches?.local, branchFilter])

  const filteredRemoteBranches = useMemo(() => {
    if (!branches?.remote) return []
    const q = branchFilter.trim().toLowerCase()
    return q ? branches.remote.filter(b => b.name.toLowerCase().includes(q)) : branches.remote
  }, [branches?.remote, branchFilter])

  // Filtered tags for tags tab
  const filteredTags = useMemo(() => {
    const q = tagFilter.trim().toLowerCase()
    if (!q) return tags
    return tags.filter(item =>
      item.name.toLowerCase().includes(q)
      || item.shortHash.toLowerCase().includes(q)
      || item.commitHash.toLowerCase().includes(q)
      || item.message.toLowerCase().includes(q)
      || item.author.toLowerCase().includes(q),
    )
  }, [tags, tagFilter])

  // Filtered commits for tree tab
  const filteredCommits = useMemo(() => {
    let list = commits
    if (filterMode === 'mainline') {
      list = list.filter(c => (c.lane ?? 0) === 0)
    }
    const q = treeSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(c =>
        c.subject.toLowerCase().includes(q)
        || c.hash.toLowerCase().includes(q)
        || c.shortHash.toLowerCase().includes(q)
        || c.author.toLowerCase().includes(q)
        || (c.refs && c.refs.some(r => r.toLowerCase().includes(q))),
      )
    }
    return list
  }, [commits, filterMode, treeSearch])

  // Load more commits
  const handleLoadMore = useCallback(async () => {
    setLoading(true)
    try {
      const nextCount = commits.length + 50
      const more = await getLog(sessionId, nextCount)
      setCommits(more)
    } finally {
      setLoading(false)
    }
  }, [commits.length, getLog, sessionId])

  // Dynamic graph column width and DAG topology model
  const dagGraph = useMemo(() => computeDagGraph(filteredCommits), [filteredCommits])
  const graphColWidth = dagGraph.graphWidth

  if (!status || !status.isRepo) {
    return (
      <div className={css.root}>
        <div className={css.emptyState}>
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5v-9zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8V1.5z" />
          </svg>
          <div>{t('status.notRepo')}</div>
        </div>
      </div>
    )
  }

  const stagedCount = status.staged.length
  const unstagedCount = status.unstaged.length
  const untrackedCount = status.untracked.length
  const totalChanges = status.totalChanges

  return (
    <div className={css.root}>
      {/* 1. Header Banner */}
      <div className={css.header}>
        <div className={css.branchInfo}>
          <span className={css.branchBadge} title={`当前分支: ${status.branch}`}>
            <svg className={css.branchIcon} width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a1.75 1.75 0 1 0-2.45 1.606V6.5a1.5 1.5 0 0 1-1.5 1.5H5.8A2.75 2.75 0 0 0 3.5 6.25V4.106a1.75 1.75 0 1 0-1.5 0v7.788a1.75 1.75 0 1 0 1.5 0V8.25A1.25 1.25 0 0 1 4.75 7h3a3 3 0 0 0 3-3V4.106a1.75 1.75 0 0 0 1-1.606z" />
            </svg>
            {status.branch || 'HEAD'}
          </span>
          {(status.ahead > 0 || status.behind > 0) && (
            <div className={css.statusAheadBehind}>
              {status.ahead > 0 && <span className={css.aheadText}>↑{status.ahead}</span>}
              {status.behind > 0 && <span className={css.behindText}>↓{status.behind}</span>}
            </div>
          )}
        </div>

        <div className={css.headerActions}>
          <button
            type="button"
            className={css.iconButton}
            title={t('actions.fetch')}
            onClick={() => { void fetchGit(sessionId).then(() => refresh()) }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 3a.75.75 0 0 0 0 1.5h8.5a3.25 3.25 0 0 1 3.25 3.25v2.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l1.72 1.72V7.75A1.75 1.75 0 0 0 10.25 6H1.75a.75.75 0 0 0 0-1.5z" />
            </svg>
          </button>
          <button
            type="button"
            className={css.iconButton}
            title="拉取 (Pull)"
            onClick={() => { void pull(sessionId).then(() => refresh()) }}
          >

            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.03 8.22a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 0 1 1.06-1.06L7.5 11.69V2.75a.75.75 0 0 1 1.5 0v8.94l3.47-3.47a.75.75 0 0 1 1.06 0z" />
            </svg>
          </button>
          <button
            type="button"
            className={css.iconButton}
            title="推送 (Push)"
            onClick={() => { void push(sessionId).then(() => refresh()) }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.97 7.78a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 1 1-1.06 1.06L8.5 4.31v8.94a.75.75 0 0 1-1.5 0V4.31L3.53 7.78a.75.75 0 0 1-1.06 0z" />
            </svg>
          </button>
          <button
            type="button"
            className={`${css.iconButton} ${loading ? css.spinning : ''}`}
            title="刷新"
            onClick={() => { void refresh() }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .655-.835zm12.59-1.01a.75.75 0 0 1-.834-.656 5.5 5.5 0 0 0-9.592-2.97l1.204 1.204a.25.25 0 0 1-.177.427H1.25a.25.25 0 0 1-.25-.25V1.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-.655.835z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2. Tabs Bar */}
      <div className={css.tabs}>
        <button
          type="button"
          className={`${css.tab} ${activeTab === 'changes' ? css.tabActive : ''}`}
          onClick={() => { setActiveTab('changes') }}
        >
          {t('tabs.changes')}
          {totalChanges > 0 && <span className={css.tabCount}>{totalChanges}</span>}
        </button>
        <button
          type="button"
          className={`${css.tab} ${activeTab === 'tree' ? css.tabActive : ''}`}
          onClick={() => { setActiveTab('tree') }}
        >
          {t('tabs.tree')}
          <span className={css.tabCount}>{commits.length}</span>
        </button>
        <button
          type="button"
          className={`${css.tab} ${activeTab === 'branches' ? css.tabActive : ''}`}
          onClick={() => { setActiveTab('branches') }}
        >
          {t('tabs.branches')}
        </button>
        <button
          type="button"
          className={`${css.tab} ${activeTab === 'tags' ? css.tabActive : ''}`}
          onClick={() => { setActiveTab('tags') }}
        >
          {t('tabs.tags')}
          {tags.length > 0 && <span className={css.tabCount}>{tags.length}</span>}
        </button>
      </div>

      {locatedNotice && (
        <div style={{
          padding: '6px 12px',
          background: 'color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)',
          color: 'var(--dsw-alias-state-business-primary)',
          fontSize: '11px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
        }}>
          <span>🎯</span>
          <span>{locatedNotice}</span>
        </div>
      )}

      {/* 3. Main Content Panes */}
      <div className={css.content}>
        {/* TAB 1: Local Changes */}
        {activeTab === 'changes' && (
          <>
            {totalChanges === 0 ? (
              <div className={css.emptyState}>
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
                </svg>
                <div>{t('status.clean')}</div>
              </div>
            ) : (
              <>
                {/* 1.1 Staged Changes */}
                {stagedCount > 0 && (
                  <div className={css.section}>
                    <div className={css.sectionHeader}>
                      <div className={css.sectionTitle}>
                        <span className={`${css.statusBadge} ${css.statusA}`}>✓</span>
                        <span>{t('status.staged')} ({stagedCount})</span>
                      </div>
                      <div className={css.sectionActions}>
                        <button
                          type="button"
                          className={css.actionTextBtn}
                          title={t('actions.unstageAll')}
                          onClick={() => { void handleUnstage('all') }}
                        >
                          全部取消暂存
                        </button>
                      </div>
                    </div>
                    <div className={css.fileList}>
                      {status.staged.map(f => (
                        <div
                          key={`staged-${f.path}`}
                          className={css.fileItem}
                          onClick={() => { void handleViewDiff(f.path, true) }}
                        >
                          <div className={css.fileLeft}>
                            <span className={`${css.statusBadge} ${css.statusA}`}>
                              {f.status[0]?.toUpperCase() ?? 'M'}
                            </span>
                            <span className={css.fileName}>{f.path}</span>
                          </div>
                          <div className={css.fileItemActions}>
                            <button
                              type="button"
                              className={css.fileMiniBtn}
                              title={t('actions.unstage')}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleUnstage([f.path])
                              }}
                            >
                              -
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1.2 Unstaged Changes */}
                {unstagedCount > 0 && (
                  <div className={css.section}>
                    <div className={css.sectionHeader}>
                      <div className={css.sectionTitle}>
                        <span className={`${css.statusBadge} ${css.statusM}`}>M</span>
                        <span>{t('status.unstaged')} ({unstagedCount})</span>
                      </div>
                      <div className={css.sectionActions}>
                        <button
                          type="button"
                          className={css.actionTextBtn}
                          title={t('actions.stageAll')}
                          onClick={() => { void handleStage('all') }}
                        >
                          全部暂存
                        </button>
                      </div>
                    </div>
                    <div className={css.fileList}>
                      {status.unstaged.map(f => (
                        <div
                          key={`unstaged-${f.path}`}
                          className={css.fileItem}
                          onClick={() => { void handleViewDiff(f.path, false) }}
                        >
                          <div className={css.fileLeft}>
                            <span className={`${css.statusBadge} ${css.statusM}`}>
                              {f.status[0]?.toUpperCase() ?? 'M'}
                            </span>
                            <span className={css.fileName}>{f.path}</span>
                          </div>
                          <div className={css.fileItemActions}>
                            <button
                              type="button"
                              className={css.fileMiniBtn}
                              title={t('actions.stage')}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleStage([f.path])
                              }}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className={css.fileMiniBtn}
                              title={t('actions.discard')}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleDiscard([f.path])
                              }}
                            >
                              ↺
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1.3 Untracked Files */}
                {untrackedCount > 0 && (
                  <div className={css.section}>
                    <div className={css.sectionHeader}>
                      <div className={css.sectionTitle}>
                        <span className={`${css.statusBadge} ${css.statusU}`}>?</span>
                        <span>{t('status.untracked')} ({untrackedCount})</span>
                      </div>
                    </div>
                    <div className={css.fileList}>
                      {status.untracked.map(f => (
                        <div
                          key={`untracked-${f.path}`}
                          className={css.fileItem}
                          onClick={() => { void handleViewDiff(f.path, false) }}
                        >
                          <div className={css.fileLeft}>
                            <span className={`${css.statusBadge} ${css.statusU}`}>?</span>
                            <span className={css.fileName}>{f.path}</span>
                          </div>
                          <div className={css.fileItemActions}>
                            <button
                              type="button"
                              className={css.fileMiniBtn}
                              title={t('actions.stage')}
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleStage([f.path])
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 1.4 Commit Console (IDEA Style) */}
                <div className={css.commitBox}>
                  <textarea
                    className={css.commitTextarea}
                    placeholder={t('commit.placeholder')}
                    value={commitMessage}
                    onChange={(e) => { setCommitMessage(e.target.value) }}
                    onKeyDown={handleCommitKeyDown}
                  />
                  <div className={css.commitButtonRow}>
                    <button
                      type="button"
                      className={css.commitPushBtn}
                      disabled={committing || stagedCount === 0}
                      onClick={() => { void handleCommit(true) }}
                    >
                      {t('actions.commitAndPush')}
                    </button>
                    <button
                      type="button"
                      className={css.commitBtn}
                      disabled={committing || stagedCount === 0}
                      onClick={() => { void handleCommit(false) }}
                    >
                      {t('actions.commit')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Active File Diff Inspector */}
            {selectedFileDiff && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>差异对比: {selectedFileDiff.path}</span>
                  <button
                    type="button"
                    className={css.actionTextBtn}
                    onClick={() => { setSelectedFileDiff(null) }}
                  >
                    关闭
                  </button>
                </div>
                <DiffViewer diffText={selectedFileDiff.diff} />
              </div>
            )}
          </>
        )}

        {/* TAB 2: DAG Topology Tree & Log (Workstation Grade) */}
        {activeTab === 'tree' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'hidden',
          }}>
            {/* Top Filter and Mainline Toggle Bar */}
            <div className={css.treeFilterRow}>
              <input
                className={css.treeSearchInput}
                placeholder={t('tree.searchPlaceholder')}
                value={treeSearch}
                onChange={(e) => { setTreeSearch(e.target.value) }}
              />
              <div className={css.mainlineToggleGroup}>
                <button
                  type="button"
                  className={`${css.mainlineToggleBtn} ${filterMode === 'all' ? css.mainlineToggleBtnActive : ''}`}
                  onClick={() => { setFilterMode('all') }}
                >
                  {t('tree.filterAll')}
                </button>
                <button
                  type="button"
                  className={`${css.mainlineToggleBtn} ${filterMode === 'mainline' ? css.mainlineToggleBtnActive : ''}`}
                  onClick={() => { setFilterMode('mainline') }}
                >
                  {t('tree.filterMainline')}
                </button>
              </div>
            </div>

            {/* Main Workstation Layout: Table on left, Details on right */}
            <div
              className={css.workstationLayout}
              style={{ '--git-graph-col-width': `${graphColWidth}px` } as Record<string, string>}
            >
              <div className={css.tablePane}>
                {/* Columnar Grid Table Header */}
                <div className={css.treeTableHeader}>
                  <span className={css.colHeaderTitle}>{t('tree.colGraph')}</span>
                  <span className={css.colHeaderTitle}>{t('tree.colSubject')}</span>
                  <span className={css.colHeaderTitle}>{t('tree.colAuthor')}</span>
                  <span className={css.colHeaderTitle}>{t('tree.colTime')}</span>
                  <span className={css.colHeaderTitle}>{t('tree.colSha')}</span>
                </div>

                {/* Rows List */}
                <div className={css.treeContainer} style={{ position: 'relative' }}>
                  {/* Global Continuous SVG Graph Layer (IntelliJ IDEA Grade) */}
                  <svg
                    className={css.graphOverlaySvg}
                    style={{
                      width: `${graphColWidth}px`,
                      height: `${filteredCommits.length * 28}px`,
                    }}
                  >
                    {/* Continuous Edges (Trunk & Branch Bezier Rails) */}
                    {dagGraph.edges.map(e => (
                      <path
                        key={e.key}
                        d={e.d}
                        stroke={e.color}
                        strokeWidth={2}
                        fill="none"
                        strokeLinecap="round"
                      />
                    ))}

                    {/* Nodes (Centered on (x, y)) */}
                    {dagGraph.nodes.map((n) => {
                      const isHighlighted = highlightedCommitHash === n.hash
                      return (
                        <g key={n.hash}>
                          {isHighlighted && (
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={8.5}
                              className={css.locateGlowRing}
                            />
                          )}

                          {n.hasTag && (
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={6.5}
                              stroke="#f0883e"
                              strokeWidth={1.5}
                              fill="none"
                              opacity={0.9}
                            />
                          )}

                          {n.isHead && !n.hasTag && (
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={6.5}
                              stroke={n.color}
                              strokeWidth={1.5}
                              fill="none"
                              opacity={0.8}
                            />
                          )}

                          <circle
                            cx={n.x}
                            cy={n.y}
                            r={4}
                            fill={n.color}
                          />
                        </g>
                      )
                    })}
                  </svg>

                  {filteredCommits.map((c) => {
                    const isSelected = selectedCommitHash === c.hash
                    const isHighlighted = highlightedCommitHash === c.hash
                    const parsed = parseConventionalCommit(c.subject)
                    const avatar = getAuthorAvatar(c.author)

                    return (
                      <div
                        key={c.hash}
                        id={`git-commit-${c.hash}`}
                        className={[
                          css.treeRowGrid,
                          isSelected ? css.treeRowGridSelected : '',
                          isHighlighted ? css.treeRowHighlighted : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => { void handleSelectCommit(c.hash) }}
                      >
                        {/* Col 1: Empty Graph Column Spacer */}
                        <div style={{ width: `${graphColWidth}px`, height: 28, flexShrink: 0 }} />

                        {/* Col 2: Subject & Ref Badges & Conventional Commits */}
                        <div className={css.subjectCol}>
                          {c.refs?.map((ref, idx) => {
                            let refClass = css.refBranch
                            let refText = ref
                            if (ref.startsWith('tag: ')) {
                              refClass = css.refTag
                              refText = `🏷️ ${ref.slice(5)}`
                            } else if (ref.includes('HEAD')) {
                              refClass = css.refHead
                            } else if (ref.startsWith('origin/')) {
                              refClass = css.refRemote
                            }
                            return (
                              <span key={idx} className={`${css.refBadge} ${refClass}`} title={ref}>
                                {refText}
                              </span>
                            )
                          })}
                          {parsed.type && (
                            <span className={`${css.typeBadge} ${getTypeBadgeClass(parsed.type)}`}>
                              {parsed.type}
                            </span>
                          )}
                          <span className={css.treeSubject} title={c.subject}>
                            {c.subject}
                          </span>

                          {/* Hover Actions */}
                          <div className={css.treeRowActions} onClick={(e) => { e.stopPropagation() }}>
                            <button
                              type="button"
                              className={css.treeActionBtn}
                              title="复制完整 SHA"
                              onClick={() => {
                                void navigator.clipboard.writeText(c.hash)
                              }}
                            >
                              SHA
                            </button>
                            <button
                              type="button"
                              className={css.treeActionBtn}
                              title="在此提交新建 Tag"
                              onClick={() => {
                                setNewTagCommit(c.shortHash)
                                setCreatingTag(true)
                                setActiveTab('tags')
                              }}
                            >
                              🏷️
                            </button>
                            <button
                              type="button"
                              className={css.treeActionBtn}
                              title="在此提交新建分支"
                              onClick={() => {
                                setCreatingBranch(true)
                                setActiveTab('branches')
                              }}
                            >
                              ⑂
                            </button>
                          </div>
                        </div>

                        {/* Col 3: Author with avatar initial */}
                        <div className={css.authorCol} title={c.author}>
                          <span className={css.authorAvatar} style={{ background: avatar.color }}>
                            {avatar.initial}
                          </span>
                          <span className={css.authorNameText}>{c.author}</span>
                        </div>

                        {/* Col 4: Time */}
                        <span className={css.timeCol} title={c.date}>
                          {c.relativeDate}
                        </span>

                        {/* Col 5: Commit Short Hash */}
                        <span className={css.shaCol} title={c.hash}>
                          {c.shortHash}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Right Details Panel: Commit Details & Changed Files (Matching Reference Image) */}
              {commitDetail && (
                <div className={css.detailsPane}>
                  <div className={css.detailsHeader}>
                    <span>{t('detail.title')}</span>
                    <button
                      type="button"
                      className={css.iconButton}
                      title="关闭详情"
                      onClick={() => {
                        setSelectedCommitHash(null)
                        setCommitDetail(null)
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div className={css.detailsContent}>
                    {/* Commit Subject Title */}
                    <div className={css.detailsSubject}>
                      {commitDetail.commit.subject}
                    </div>

                    {/* Commit Body Description */}
                    {commitDetail.body && (
                      <div className={css.detailsBody}>
                        {commitDetail.body}
                      </div>
                    )}

                    {/* References */}
                    {commitDetail.commit.refs && commitDetail.commit.refs.length > 0 && (
                      <div>
                        <div className={css.detailsSectionTitle}>{t('detail.references')}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {commitDetail.commit.refs.map((ref, idx) => {
                            let refClass = css.refBranch
                            let refText = ref
                            if (ref.startsWith('tag: ')) {
                              refClass = css.refTag
                              refText = `🏷️ ${ref.slice(5)}`
                            } else if (ref.includes('HEAD')) {
                              refClass = css.refHead
                            } else if (ref.startsWith('origin/')) {
                              refClass = css.refRemote
                            }
                            return (
                              <span key={idx} className={`${css.refBadge} ${refClass}`}>
                                {refText}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Meta Properties Grid */}
                    <div className={css.detailsMetaGrid}>
                      <div className={css.detailsMetaRow}>
                        <span className={css.detailsMetaLabel}>{t('detail.author')}</span>
                        <span className={css.authorCol} style={{ maxWidth: '180px' }}>
                          {(() => {
                            const av = getAuthorAvatar(commitDetail.commit.author)
                            return (
                              <>
                                <span className={css.authorAvatar} style={{ background: av.color }}>
                                  {av.initial}
                                </span>
                                <span className={css.authorNameText}>
                                  {commitDetail.commit.author}
                                </span>
                              </>
                            )
                          })()}
                        </span>
                      </div>
                      <div className={css.detailsMetaRow}>
                        <span className={css.detailsMetaLabel}>{t('detail.date')}</span>
                        <span className={css.detailsMetaVal}>
                          {formatFullDate(commitDetail.commit.date)}
                        </span>
                      </div>
                      <div className={css.detailsMetaRow}>
                        <span className={css.detailsMetaLabel}>Commit SHA</span>
                        <span
                          className={css.tagShaPill}
                          title="点击复制完整 SHA"
                          onClick={() => {
                            void navigator.clipboard.writeText(commitDetail.commit.hash)
                          }}
                        >
                          {commitDetail.commit.hash.slice(0, 13)}
                        </span>
                      </div>
                      {commitDetail.parents && commitDetail.parents.length > 0 && (
                        <div className={css.detailsMetaRow}>
                          <span className={css.detailsMetaLabel}>{t('detail.parent')}</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {commitDetail.parents.map(p => (
                              <span
                                key={p}
                                className={css.detailsParentLink}
                                title={`定位到父提交: ${p}`}
                                onClick={() => { void handleLocateCommit(p) }}
                              >
                                {p.slice(0, 10)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Changed Files */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>
                          变更文件 ({commitDetail.files.length} 个文件)
                        </span>
                        <span className={css.numstat}>
                          <span className={css.addStat}>+{commitDetail.totalAdditions}</span>
                          <span className={css.delStat}>-{commitDetail.totalDeletions}</span>
                        </span>
                      </div>
                      <div className={css.detailFilesList}>
                        {commitDetail.files.map(f => (
                          <div
                            key={f.path}
                            className={css.detailFileItem}
                            onClick={() => { void handleViewDiff(f.path, false, commitDetail.commit.hash) }}
                          >
                            <div className={css.fileLeft}>
                              <span
                                className={`${css.statusBadge} ${
                                  f.status === 'added' ? css.statusA : f.status === 'deleted' ? css.statusD : css.statusM
                                }`}
                              >
                                {f.status[0]?.toUpperCase() ?? 'M'}
                              </span>
                              <span className={css.fileName}>{f.path}</span>
                            </div>
                            <span className={css.numstat}>
                              <span className={css.addStat}>+{f.additions}</span>
                              <span className={css.delStat}>-{f.deletions}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Diff Preview if selected file */}
                    {selectedFileDiff && (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>差异: {selectedFileDiff.path}</span>
                          <button
                            type="button"
                            className={css.actionTextBtn}
                            onClick={() => { setSelectedFileDiff(null) }}
                          >
                            关闭
                          </button>
                        </div>
                        <DiffViewer diffText={selectedFileDiff.diff} />
                      </div>
                    )}

                    {/* Bottom Actions */}
                    <div className={css.detailsBottomActions}>
                      <button
                        type="button"
                        className={css.actionTextBtn}
                        style={{ flex: 1, padding: '5px' }}
                        onClick={() => {
                          void handleCheckoutBranch(commitDetail.commit.shortHash)
                        }}
                      >
                        {t('detail.checkout')}
                      </button>
                      <button
                        type="button"
                        className={css.commitBtn}
                        style={{ flex: 1, padding: '5px' }}
                        onClick={() => {
                          setNewTagCommit(commitDetail.commit.shortHash)
                          setCreatingTag(true)
                          setActiveTab('tags')
                        }}
                      >
                        {t('detail.createBranchOrTag')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Status Footer (Sync Status & Commit Stats) */}
            <div className={css.treeStatusFooter}>
              <div className={css.footerSyncStatus}>
                <span className={css.syncDot} />
                <span>
                  {status.ahead === 0 && status.behind === 0
                    ? t('footer.syncNormal')
                    : status.ahead > 0
                      ? t('footer.ahead', { count: status.ahead })
                      : t('footer.behind', { count: status.behind })}
                </span>
              </div>
              <div className={css.footerStats}>
                <span>
                  {t('footer.showingCount', {
                    count: filteredCommits.length,
                    total: status.totalCommitsCount ?? commits.length,
                  })}
                </span>
                {status.totalCommitsCount && commits.length < status.totalCommitsCount && (
                  <span className={css.loadMoreLink} onClick={() => { void handleLoadMore() }}>
                    {t('footer.loadMore')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Branches */}
        {activeTab === 'branches' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Search and New Branch bar */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                className={css.commitTextarea}
                style={{ minHeight: '30px', height: '30px', padding: '4px 8px' }}
                placeholder={t('branch.filter')}
                value={branchFilter}
                onChange={(e) => { setBranchFilter(e.target.value) }}
              />
              <button
                type="button"
                className={css.actionTextBtn}
                style={{ flexShrink: 0 }}
                onClick={() => { setCreatingBranch(prev => !prev) }}
              >
                + 新建分支
              </button>
            </div>

            {creatingBranch && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  autoFocus
                  className={css.commitTextarea}
                  style={{ minHeight: '30px', height: '30px', padding: '4px 8px' }}
                  placeholder="新分支名称..."
                  value={newBranchName}
                  onChange={(e) => { setNewBranchName(e.target.value) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const trimmed = newBranchName.trim()
                      if (trimmed) void handleCheckoutBranch(trimmed, true)
                    }
                  }}
                />
                <button
                  type="button"
                  className={css.commitBtn}
                  onClick={() => {
                    const trimmed = newBranchName.trim()
                    if (trimmed) void handleCheckoutBranch(trimmed, true)
                  }}
                >
                  创建并检出
                </button>
              </div>
            )}

            {/* Local Branches */}
            <div className={css.section}>
              <div className={css.sectionHeader}>
                <span>本地分支 ({filteredLocalBranches.length})</span>
              </div>
              <div className={css.fileList}>
                {filteredLocalBranches.map(b => (
                  <div
                    key={b.name}
                    className={css.fileItem}
                    style={{ background: b.isCurrent ? 'rgba(56, 139, 253, 0.15)' : undefined }}
                    onClick={() => {
                      if (!b.isCurrent) void handleCheckoutBranch(b.name)
                    }}
                  >
                    <div className={css.fileLeft}>
                      <span style={{ color: b.isCurrent ? '#388bfd' : 'inherit' }}>
                        {b.isCurrent ? '●' : '○'}
                      </span>
                      <span style={{ fontWeight: b.isCurrent ? 600 : 400 }}>{b.name}</span>
                    </div>
                    {b.isCurrent && <span style={{ fontSize: '11px', color: '#58a6ff' }}>当前检出</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Remote Branches */}
            {filteredRemoteBranches.length > 0 && (
              <div className={css.section}>
                <div className={css.sectionHeader}>
                  <span>远程分支 ({filteredRemoteBranches.length})</span>
                </div>
                <div className={css.fileList}>
                  {filteredRemoteBranches.map(b => (
                    <div
                      key={b.name}
                      className={css.fileItem}
                      onClick={() => { void handleCheckoutBranch(b.name) }}
                    >
                      <div className={css.fileLeft}>
                        <span style={{ opacity: 0.6 }}>☁</span>
                        <span>{b.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Tags (GitHub Releases/Tags Style) */}
        {activeTab === 'tags' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Search and New Tag bar */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                className={css.commitTextarea}
                style={{ minHeight: '30px', height: '30px', padding: '4px 8px' }}
                placeholder={t('tag.filter')}
                value={tagFilter}
                onChange={(e) => { setTagFilter(e.target.value) }}
              />
              <button
                type="button"
                className={css.actionTextBtn}
                style={{ flexShrink: 0 }}
                onClick={() => { setCreatingTag(prev => !prev) }}
              >
                + {t('tag.newPrompt')}
              </button>
            </div>

            {/* Create Tag Form */}
            {creatingTag && (
              <div className={css.tagForm}>
                <div className={css.tagFormTitle}>{t('tag.newPrompt')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' }}>
                    {t('tag.nameLabel')} *
                  </label>
                  <input
                    autoFocus
                    className={css.commitTextarea}
                    style={{ minHeight: '28px', height: '28px', padding: '4px 8px' }}
                    placeholder={t('tag.namePlaceholder')}
                    value={newTagName}
                    onChange={(e) => { setNewTagName(e.target.value) }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' }}>
                    {t('tag.targetCommitLabel')}
                  </label>
                  <input
                    className={css.commitTextarea}
                    style={{ minHeight: '28px', height: '28px', padding: '4px 8px' }}
                    placeholder="例如 687f282 或留空为 HEAD"
                    value={newTagCommit}
                    onChange={(e) => { setNewTagCommit(e.target.value) }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--dsw-alias-label-secondary)' }}>
                    {t('tag.messageLabel')}
                  </label>
                  <input
                    className={css.commitTextarea}
                    style={{ minHeight: '28px', height: '28px', padding: '4px 8px' }}
                    placeholder={t('tag.messagePrompt')}
                    value={newTagMessage}
                    onChange={(e) => { setNewTagMessage(e.target.value) }}
                  />
                </div>
                <div className={css.tagFormActions}>
                  <button
                    type="button"
                    className={css.actionTextBtn}
                    onClick={() => { setCreatingTag(false) }}
                  >
                    {t('tag.cancelBtn')}
                  </button>
                  <button
                    type="button"
                    className={css.commitBtn}
                    onClick={() => { void handleCreateTag() }}
                  >
                    {t('tag.createBtn')}
                  </button>
                </div>
              </div>
            )}

            {/* Tags Cards List */}
            {filteredTags.length === 0 ? (
              <div className={css.emptyState}>
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25v5.025zM6 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
                </svg>
                <div>{t('tag.empty')}</div>
              </div>
            ) : (
              <div className={css.tagList}>
                {filteredTags.map(tag => (
                  <div key={tag.name} className={css.tagCard}>
                    <div className={css.tagCardHeader}>
                      <div className={css.tagTitleRow}>
                        <span style={{ fontSize: '13px' }}>🏷️</span>
                        <span
                          className={css.tagName}
                          title="点击在图谱中定位"
                          onClick={() => { void handleLocateCommit(tag.commitHash, tag.name) }}
                        >
                          {tag.name}
                        </span>
                        <span
                          className={css.tagShaPill}
                          title={`Commit: ${tag.commitHash} (点击在图谱中定位)`}
                          onClick={() => { void handleLocateCommit(tag.commitHash, tag.name) }}
                        >
                          {tag.shortHash}
                        </span>
                        {tag.isAnnotated && (
                          <span className={css.tagAnnotatedBadge}>{t('tag.annotated')}</span>
                        )}
                      </div>
                      <div className={css.tagActions}>
                        <button
                          type="button"
                          className={css.tagLocateBtn}
                          title="在图谱中定位该提交"
                          onClick={() => { void handleLocateCommit(tag.commitHash, tag.name) }}
                        >
                          <span>🎯</span>
                          <span>{t('tag.locateBtn')}</span>
                        </button>
                        <button
                          type="button"
                          className={css.fileMiniBtn}
                          title={t('tag.copyName')}
                          onClick={() => {
                            void navigator.clipboard.writeText(tag.name)
                          }}
                        >
                          📋
                        </button>
                        <button
                          type="button"
                          className={css.fileMiniBtn}
                          title={t('tag.deleteBtn')}
                          onClick={() => { void handleDeleteTag(tag.name) }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {/* Commit Message or Tag Annotation */}
                    {tag.message && (
                      <div className={css.tagMessage} title={tag.message}>
                        {tag.message}
                      </div>
                    )}

                    {/* Footer with author and date */}
                    <div className={css.tagMetaFooter}>
                      <span className={css.tagAuthor}>
                        <span>👤</span>
                        <span>{tag.author}</span>
                      </span>
                      <span title={tag.date}>
                        {tag.relativeDate}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
