/**
 * Definition of the `git` tab type for the right Sidebar.
 */

import React from 'react'

/** The tab kind this package owns */
export const GIT_KIND = 'git'

/** Implementation identity in the tab system */
export const GIT_ID = '@civilization/dsh-git-workbench'

export interface SidebarRightTabGuide {
  id?: string
  commandId?: string
  order?: number
  title: () => string
  description: () => string
  icon?: () => React.ReactElement
}

export interface SidebarRightTabDefinition {
  id: string
  kind: string
  priority?: string
  title: () => string
  guide?: SidebarRightTabGuide[]
}

/** Git artwork for the Sidebar Guide */
export function GuideArtworkGit(): React.ReactElement {
  return (
    <svg width="40" height="40" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="9" x2="12" y2="27" stroke="#F05133" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 21C12 18 15 15 18 15H22C23.5 15 24 14.5 24 13V12" stroke="#F05133" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="26" r="3.5" fill="#FFFFFF" stroke="#F05133" strokeWidth="2.5" />
      <circle cx="12" cy="10" r="3.5" fill="#FFFFFF" stroke="#F05133" strokeWidth="2.5" />
      <circle cx="24" cy="11" r="3.5" fill="#FFFFFF" stroke="#3680F6" strokeWidth="2.5" />
    </svg>
  )
}

/**
 * Tab definition for the Git right-sidebar viewer.
 * @param t - namespace-bound translation function.
 * @returns Complete sidebar tab definition.
 */
export function gitDefinition(t: (key: string) => string): SidebarRightTabDefinition {
  return {
    id: GIT_ID,
    kind: GIT_KIND,
    priority: 'builtin',
    title: () => t('type.label'),
    guide: [{
      id: 'git',
      commandId: 'workspace.git',
      order: 15,
      title: () => t('guide.title'),
      description: () => t('guide.description'),
      icon: GuideArtworkGit,
    }],
  }
}
