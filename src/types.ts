/**
 * Core type declarations for the experimental Git plugin.
 * Shared across the Host RPC handlers and Client UI viewers.
 */

/** File change status representation in git */
export type GitFileStatusCode = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'

/** One changed file entry in the working directory or staging area */
export interface GitFileStatus {
  /** Relative file path from the repository root */
  readonly path: string
  /** Previous path if the file was renamed */
  readonly originalPath?: string
  /** Normalized status kind */
  readonly status: GitFileStatusCode
  /** Whether the change has been staged to index */
  readonly staged: boolean
}

/** Information about one local git branch */
export interface GitBranchInfo {
  /** Branch name (e.g. 'main', 'master', 'feature/xyz') */
  readonly name: string
  /** Whether this branch is currently checked out */
  readonly isCurrent: boolean
  /** Upstream tracking branch if configured */
  readonly upstream?: string
  /** Number of commits ahead of upstream */
  readonly ahead?: number
  /** Number of commits behind upstream */
  readonly behind?: number
}

/** Full status summary of the workspace repository */
export interface GitStatusSummary {
  /** Whether the checked directory is inside a Git worktree/repository */
  readonly isRepo: boolean
  /** Absolute root directory of the repository */
  readonly rootPath?: string
  /** Current branch name, or commit hash if detached */
  readonly branch?: string
  /** Upstream branch name */
  readonly upstream?: string
  /** Commits ahead of upstream */
  readonly ahead: number
  /** Commits behind upstream */
  readonly behind: number
  /** Latest commit summary on current HEAD */
  readonly headCommit?: {
    readonly hash: string
    readonly shortHash: string
    readonly message: string
  }
  /** Staged changes in index */
  readonly staged: readonly GitFileStatus[]
  /** Unstaged changes in working tree */
  readonly unstaged: readonly GitFileStatus[]
  /** Untracked new files */
  readonly untracked: readonly GitFileStatus[]
  /** Total count of all changed/untracked files */
  readonly totalChanges: number
  /** Total count of commits in the current repository */
  readonly totalCommitsCount?: number
}

/** One commit log entry with optional DAG topology metadata */
export interface GitCommitItem {
  /** Full 40-character commit hash */
  readonly hash: string
  /** Abbreviated 7-character commit hash */
  readonly shortHash: string
  /** Author name */
  readonly author: string
  /** Author email address */
  readonly authorEmail: string
  /** Human-readable relative date (e.g. '2 hours ago') */
  readonly relativeDate: string
  /** ISO date string */
  readonly date: string
  /** Commit subject/first line of commit message */
  readonly subject: string
  /** Full multiline commit body message (excluding subject) */
  readonly body?: string
  /** Parent commit hashes */
  readonly parents?: readonly string[]
  /** Git branch / tag reference names */
  readonly refs?: readonly string[]
  /** Topological vertical lane column index (0-based) */
  readonly lane?: number
  /** Color hex code for the current commit's lane */
  readonly laneColor?: string
  /** Connecting graph rails to parent commits */
  readonly paths?: readonly GitGraphLanePath[]
}

/** Vector path connecting lanes in the DAG graph visualization */
export interface GitGraphLanePath {
  /** Starting lane index (from this commit) */
  readonly fromLane: number
  /** Target lane index (to parent commit or pass-through) */
  readonly toLane: number
  /** Type of track: pass-through, fork out, or merge in */
  readonly kind: 'straight' | 'fork' | 'merge'
  /** Color of this track line */
  readonly color: string
}

/** Detail information for a single commit including changed files */
export interface GitCommitDetail {
  readonly commit: GitCommitItem
  readonly body?: string
  readonly parents?: readonly string[]
  readonly files: readonly {
    readonly path: string
    readonly oldPath?: string
    readonly status: GitFileStatusCode
    readonly additions: number
    readonly deletions: number
  }[]
  readonly totalAdditions: number
  readonly totalDeletions: number
}

/** Complete log query summary including commits and total count */
export interface GitLogSummary {
  readonly commits: readonly GitCommitItem[]
  readonly totalCount: number
}

/** One Git tag entry */
export interface GitTagItem {
  /** Tag name (e.g. 'v1.0.0', 'dsh-v0.2.1-rc.2') */
  readonly name: string
  /** Target commit full 40-character SHA hash */
  readonly commitHash: string
  /** Target commit abbreviated 7-character hash */
  readonly shortHash: string
  /** ISO 8601 date string of tag or commit */
  readonly date: string
  /** Human-readable relative date (e.g. '3 days ago') */
  readonly relativeDate: string
  /** Tag annotation message or commit subject */
  readonly message: string
  /** Author or tagger name */
  readonly author: string
  /** Whether this is an annotated tag (git tag -a) */
  readonly isAnnotated: boolean
}

/** Aggregated local and remote branches */
export interface GitBranchesSummary {
  readonly current?: string
  readonly local: readonly GitBranchInfo[]
  readonly remote: readonly GitBranchInfo[]
}

/** Generic result of executing a git mutative operation */
export interface GitOperationResult {
  readonly success: boolean
  readonly message?: string
  readonly output?: string
}

/** One file's diff result */
export interface GitDiffFile {
  /** File path */
  readonly path: string
  /** Old file path if renamed */
  readonly oldPath?: string
  /** Change status */
  readonly status: GitFileStatusCode
  /** Raw unified diff patch lines */
  readonly diffText: string
  /** Count of added lines */
  readonly additions: number
  /** Count of removed lines */
  readonly deletions: number
}

/** Complete diff result summary */
export interface GitDiffSummary {
  /** List of parsed diff files */
  readonly files: readonly GitDiffFile[]
  /** Complete raw unified diff output */
  readonly rawDiff: string
}
