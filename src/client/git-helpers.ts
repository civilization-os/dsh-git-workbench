/**
 * Conventional Commits and presentation helpers for Git commits and avatars.
 */

export type ConventionalType =
  | 'feat'
  | 'fix'
  | 'style'
  | 'refactor'
  | 'docs'
  | 'test'
  | 'chore'
  | 'release'
  | 'merge'
  | 'revert'

export interface ParsedCommitSubject {
  readonly type?: ConventionalType
  readonly scope?: string
  readonly cleanSubject: string
}

/**
 * Parse conventional commit prefix from a commit subject.
 * @param subject - Raw first line of commit message.
 * @returns Parsed type, scope, and clean subject.
 */
export function parseConventionalCommit(subject: string): ParsedCommitSubject {
  const trimmed = subject.trim()

  // Match merge commits
  if (/^merge\s+(pull\s+request|branch|remote-tracking\s+branch)/i.test(trimmed)) {
    return {
      type: 'merge',
      cleanSubject: trimmed,
    }
  }

  // Match standard conventional commit prefix: "type(scope): message" or "type: message"
  const match = /^(feat|fix|style|refactor|docs|test|chore|release|revert)(?:\(([^)]+)\))?!?:\s*(.*)$/i.exec(trimmed)
  if (match && match[1]) {
    const rawType = match[1].toLowerCase() as ConventionalType
    const scope = match[2]?.trim()
    return {
      type: rawType,
      ...scope !== undefined ? { scope } : {},
      cleanSubject: trimmed,
    }
  }

  return {
    cleanSubject: trimmed,
  }
}

const AVATAR_PALETTE = [
  '#388bfd', // Blue
  '#2ea043', // Green
  '#f0883e', // Orange
  '#a371f7', // Purple
  '#db61a2', // Rose
  '#39c5bb', // Cyan
  '#f9c513', // Amber
  '#6f42c1', // Violet
]

/**
 * Deterministically compute avatar initial and background color for an author name.
 * @param author - Author name or email.
 * @returns Initial letter and hex color code.
 */
export function getAuthorAvatar(author: string): { initial: string; color: string } {
  const clean = author.trim()
  const initial = clean.length > 0 ? (clean[0]?.toUpperCase() ?? '?') : '?'

  let hash = 0
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i)
    hash |= 0
  }

  const index = Math.abs(hash) % AVATAR_PALETTE.length
  const color = AVATAR_PALETTE[index] ?? '#388bfd'

  return { initial, color }
}

/**
 * Format date string into YYYY-MM-DD HH:mm:ss.
 * @param dateStr - ISO or Git date string.
 * @returns Clean formatted local date and time string.
 */
export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr

  const pad = (n: number) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  const seconds = pad(d.getSeconds())

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export const GRAPH_LANE_PALETTE = [
  '#388bfd', // 0: Mainline Blue
  '#3fb950', // 1: Emerald Green
  '#f0883e', // 2: Coral Orange
  '#a371f7', // 3: Violet Purple
  '#58a6ff', // 4: Sky Blue
  '#bc8cff', // 5: Lavender
  '#db61a2', // 6: Magenta
  '#2ea043', // 7: Forest Green
] as const

export interface DagNode {
  readonly hash: string
  readonly lane: number
  readonly color: string
  readonly x: number
  readonly y: number
  readonly isHead: boolean
  readonly hasTag: boolean
}

export interface DagEdge {
  readonly key: string
  readonly fromHash: string
  readonly toHash?: string
  readonly color: string
  readonly d: string
}

export interface DagGraphModel {
  readonly nodes: readonly DagNode[]
  readonly edges: readonly DagEdge[]
  readonly maxLane: number
  readonly graphWidth: number
}

const ROW_HEIGHT = 28
const LANE_WIDTH = 16
const LANE_X_OFFSET = 10

/**
 * Compute global continuous SVG DAG topology graph for commit items (IntelliJ IDEA grade).
 * Eliminates per-row segmentation gaps, floating nodes, and misaligned curves.
 * @param commits - Ordered commit items.
 * @returns Fully computed nodes, edges, maxLane, and width.
 */
export function computeDagGraph(commits: readonly {
  hash: string
  parents?: readonly string[]
  refs?: readonly string[]
}[]): DagGraphModel {
  if (commits.length === 0) {
    return { nodes: [], edges: [], maxLane: 0, graphWidth: 36 }
  }

  // 1. Map commit hash -> index
  const hashToIndex = new Map<string, number>()
  commits.forEach((c, idx) => hashToIndex.set(c.hash, idx))

  // 2. Identify mainline (first-parent chain starting from HEAD or newest commit)
  const mainlineSet = new Set<string>()
  let curr = commits.find(c => c.refs?.some(r => r.includes('HEAD') || r === 'master' || r === 'main'))?.hash
    ?? commits[0]?.hash
  while (curr && hashToIndex.has(curr)) {
    mainlineSet.add(curr)
    const commitIdx = hashToIndex.get(curr)
    if (commitIdx === undefined) break
    const c = commits[commitIdx]
    if (!c || !c.parents || c.parents.length === 0) break
    curr = c.parents[0]
  }

  // 3. Assign lanes to each commit
  const activeLanes: (string | null)[] = [null]
  const commitLanes: number[] = Array.from({ length: commits.length }, () => 0)

  commits.forEach((c, idx) => {
    let lane = 0
    if (mainlineSet.has(c.hash)) {
      lane = 0
      for (let l = 1; l < activeLanes.length; l++) {
        if (activeLanes[l] === c.hash) activeLanes[l] = null
      }
    } else {
      let foundLane = -1
      for (let l = 1; l < activeLanes.length; l++) {
        if (activeLanes[l] === c.hash) {
          foundLane = l
          break
        }
      }

      if (foundLane !== -1) {
        lane = foundLane
        activeLanes[lane] = null
      } else {
        let slot = -1
        for (let l = 1; l < activeLanes.length; l++) {
          if (activeLanes[l] === null) {
            slot = l
            break
          }
        }
        if (slot !== -1) {
          lane = slot
        } else {
          lane = Math.max(1, activeLanes.length)
          while (activeLanes.length <= lane) activeLanes.push(null)
        }
      }
    }

    commitLanes[idx] = lane

    // Reserve lanes for non-mainline parents
    if (c.parents && c.parents.length > 0) {
      c.parents.forEach((parentHash, pIdx) => {
        if (mainlineSet.has(parentHash)) return
        if (activeLanes.includes(parentHash)) return

        if (pIdx === 0 && lane >= 1 && activeLanes[lane] === null) {
          activeLanes[lane] = parentHash
        } else {
          let slot = -1
          for (let l = 1; l < activeLanes.length; l++) {
            if (activeLanes[l] === null) {
              slot = l
              break
            }
          }
          if (slot !== -1) {
            activeLanes[slot] = parentHash
          } else {
            activeLanes.push(parentHash)
          }
        }
      })
    }

    while (activeLanes.length > 1 && activeLanes.at(-1) === null) {
      activeLanes.pop()
    }
  })

  const maxLane = Math.max(0, ...commitLanes)

  // 4. Compute Edges (Connections from Child -> Parent)
  const edges: DagEdge[] = []
  const processedEdges = new Set<string>()

  commits.forEach((c, idx) => {
    const fromLane = commitLanes[idx] ?? 0
    const x1 = fromLane * LANE_WIDTH + LANE_X_OFFSET
    const y1 = idx * ROW_HEIGHT + ROW_HEIGHT / 2
    const nodeColor = GRAPH_LANE_PALETTE[fromLane % GRAPH_LANE_PALETTE.length] ?? '#388bfd'

    if (!c.parents || c.parents.length === 0) return

    c.parents.forEach((pHash) => {
      const edgeKey = `${c.hash}->${pHash}`
      if (processedEdges.has(edgeKey)) return
      processedEdges.add(edgeKey)

      const pIdxInList = hashToIndex.get(pHash)
      if (pIdxInList !== undefined) {
        const toLane = commitLanes[pIdxInList] ?? 0
        const x2 = toLane * LANE_WIDTH + LANE_X_OFFSET
        const y2 = pIdxInList * ROW_HEIGHT + ROW_HEIGHT / 2
        const edgeColor = fromLane > 0
          ? nodeColor
          : (toLane > 0 ? (GRAPH_LANE_PALETTE[toLane % GRAPH_LANE_PALETTE.length] ?? nodeColor) : nodeColor)

        if (x1 === x2) {
          edges.push({
            key: edgeKey,
            fromHash: c.hash,
            toHash: pHash,
            color: edgeColor,
            d: `M ${x1} ${y1} L ${x2} ${y2}`,
          })
        } else if (pIdxInList === idx + 1) {
          edges.push({
            key: edgeKey,
            fromHash: c.hash,
            toHash: pHash,
            color: edgeColor,
            d: `M ${x1} ${y1} C ${x1} ${y1 + 14}, ${x2} ${y2 - 14}, ${x2} ${y2}`,
          })
        } else if (toLane === 0) {
          edges.push({
            key: edgeKey,
            fromHash: c.hash,
            toHash: pHash,
            color: edgeColor,
            d: `M ${x1} ${y1} L ${x1} ${y2 - 28} C ${x1} ${y2 - 14}, ${x2} ${y2 - 14}, ${x2} ${y2}`,
          })
        } else {
          edges.push({
            key: edgeKey,
            fromHash: c.hash,
            toHash: pHash,
            color: edgeColor,
            d: `M ${x1} ${y1} C ${x1} ${y1 + 14}, ${x2} ${y1 + 14}, ${x2} ${y1 + 28} L ${x2} ${y2}`,
          })
        }
      } else {
        const bottomY = commits.length * ROW_HEIGHT
        edges.push({
          key: edgeKey,
          fromHash: c.hash,
          color: nodeColor,
          d: `M ${x1} ${y1} L ${x1} ${bottomY}`,
        })
      }
    })
  })

  // 5. Compute Nodes
  const nodes: DagNode[] = commits.map((c, idx) => {
    const lane = commitLanes[idx] ?? 0
    const x = lane * LANE_WIDTH + LANE_X_OFFSET
    const y = idx * ROW_HEIGHT + ROW_HEIGHT / 2
    const color = GRAPH_LANE_PALETTE[lane % GRAPH_LANE_PALETTE.length] ?? '#388bfd'
    const isHead = Boolean(c.refs?.some(r => r.includes('HEAD') || r === 'master' || r === 'main'))
    const hasTag = Boolean(c.refs?.some(r => r.startsWith('tag: ') || r.includes('tag:')))

    return {
      hash: c.hash,
      lane,
      color,
      x,
      y,
      isHead,
      hasTag,
    }
  })

  return {
    nodes,
    edges,
    maxLane,
    graphWidth: Math.max(36, (maxLane + 1) * LANE_WIDTH + 16),
  }
}
