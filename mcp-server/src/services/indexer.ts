import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'
import type { SkillEntry, AgentEntry } from '../types.js'
import { parseMarkdown } from './parser.js'
import { readSkillFromArchive } from './zip-reader.js'

let skillIndex = new Map<string, SkillEntry>()
let agentIndex = new Map<string, AgentEntry>()

export function getSkillIndex(): Map<string, SkillEntry> {
  return skillIndex
}

export function getAgentIndex(): Map<string, AgentEntry> {
  return agentIndex
}

export function buildIndex(skillsDir: string, agentsDir: string) {
  skillIndex = scanSkills(skillsDir)
  agentIndex = scanAgents(agentsDir)
  console.log(`[index] ${skillIndex.size} skills, ${agentIndex.size} agents`)
}

function scanSkills(dir: string): Map<string, SkillEntry> {
  const index = new Map<string, SkillEntry>()
  if (!existsSync(dir)) return index

  const entries = readdirSync(dir)
  const directoryNames = new Set<string>()

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      const skillMdPath = join(fullPath, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      const raw = readFileSync(skillMdPath, 'utf-8')
      const parsed = parseMarkdown(raw)
      const name = (parsed.frontmatter.name as string) || entry
      const description = (parsed.frontmatter.description as string) || ''

      const refsDir = join(fullPath, 'references')
      const hasReferences = existsSync(refsDir) && statSync(refsDir).isDirectory()

      let metadata: Record<string, unknown> | undefined
      const metaPath = join(fullPath, 'metadata.json')
      if (existsSync(metaPath)) {
        try {
          metadata = JSON.parse(readFileSync(metaPath, 'utf-8'))
        } catch {}
      }

      directoryNames.add(entry)
      index.set(name, { name, description, format: 'directory', path: fullPath, hasReferences, metadata })
    }
  }

  for (const entry of entries) {
    const ext = extname(entry)
    if (ext !== '.zip' && ext !== '.skill') continue

    const baseName = basename(entry, ext)
    if (directoryNames.has(baseName)) continue

    const fullPath = join(dir, entry)
    const archive = readSkillFromArchive(fullPath)
    if (!archive) continue

    const parsed = parseMarkdown(archive.skillMd)
    const name = (parsed.frontmatter.name as string) || baseName
    const description = (parsed.frontmatter.description as string) || ''

    if (index.has(name)) continue

    const format = ext === '.skill' ? 'skill' as const : 'zip' as const
    index.set(name, {
      name, description, format, path: fullPath,
      hasReferences: archive.referenceFiles.length > 0,
    })
  }

  return index
}

function scanAgents(dir: string): Map<string, AgentEntry> {
  const index = new Map<string, AgentEntry>()
  if (!existsSync(dir)) return index

  const entries = readdirSync(dir)

  for (const entry of entries) {
    if (extname(entry) !== '.md') continue
    const fullPath = join(dir, entry)
    if (!statSync(fullPath).isFile()) continue

    const raw = readFileSync(fullPath, 'utf-8')
    const parsed = parseMarkdown(raw)
    const fm = parsed.frontmatter

    const name = (fm.name as string) || basename(entry, '.md')
    const description = (fm.description as string) || ''
    const model = fm.model as string | undefined
    const color = fm.color as string | undefined
    const memory = fm.memory as string | undefined
    const skills = Array.isArray(fm.skills) ? (fm.skills as string[]) : []

    index.set(name, { name, description, model, color, memory, skills, path: fullPath })
  }

  return index
}

export function getSkillContent(name: string, includeReferences: boolean): string | null {
  const entry = skillIndex.get(name)
  if (!entry) return null

  if (entry.format === 'directory') {
    let content = readFileSync(join(entry.path, 'SKILL.md'), 'utf-8')
    if (includeReferences && entry.hasReferences) {
      const refsDir = join(entry.path, 'references')
      const refs = readdirSync(refsDir).filter(f => extname(f) === '.md').sort()
      for (const ref of refs) {
        const refContent = readFileSync(join(refsDir, ref), 'utf-8')
        content += `\n\n---\n\n## Reference: ${basename(ref, '.md')}\n\n${refContent}`
      }
    }
    return content
  }

  const archive = readSkillFromArchive(entry.path)
  if (!archive) return null

  let content = archive.skillMd
  if (includeReferences && archive.referenceFiles.length > 0) {
    for (const ref of archive.referenceFiles) {
      content += `\n\n---\n\n## Reference: ${basename(ref.name, '.md')}\n\n${ref.content}`
    }
  }
  return content
}

export function getAgentContent(name: string): { raw: string; metadata: Omit<AgentEntry, 'path'> } | null {
  const entry = agentIndex.get(name)
  if (!entry) return null

  const raw = readFileSync(entry.path, 'utf-8')
  const { path: _, ...metadata } = entry
  return { raw, metadata }
}
