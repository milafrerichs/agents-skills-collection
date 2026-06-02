export interface SkillEntry {
  name: string
  description: string
  format: 'directory' | 'zip' | 'skill'
  path: string
  hasReferences: boolean
  metadata?: Record<string, unknown>
}

export interface AgentEntry {
  name: string
  description: string
  model?: string
  color?: string
  memory?: string
  skills: string[]
  path: string
}

export interface Frontmatter {
  [key: string]: unknown
}

export interface ParsedMarkdown {
  frontmatter: Frontmatter
  content: string
}
