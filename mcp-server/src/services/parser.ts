import YAML from 'yaml'
import type { ParsedMarkdown } from '../types.js'

export function parseMarkdown(raw: string): ParsedMarkdown {
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith('---')) {
    return { frontmatter: {}, content: raw }
  }

  const end = trimmed.indexOf('---', 3)
  if (end === -1) {
    return { frontmatter: {}, content: raw }
  }

  const yamlBlock = trimmed.slice(3, end).trim()
  const content = trimmed.slice(end + 3).trim()

  try {
    const frontmatter = YAML.parse(yamlBlock) ?? {}
    return { frontmatter, content }
  } catch {
    return { frontmatter: {}, content: raw }
  }
}
