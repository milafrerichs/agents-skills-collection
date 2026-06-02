import AdmZip from 'adm-zip'

export interface ArchiveContent {
  skillMd: string
  referenceFiles: { name: string; content: string }[]
}

export function readSkillFromArchive(archivePath: string): ArchiveContent | null {
  const zip = new AdmZip(archivePath)
  const entries = zip.getEntries().filter(e => !e.entryName.startsWith('__MACOSX'))

  const skillEntry = entries.find(e => e.entryName.endsWith('/SKILL.md') || e.entryName === 'SKILL.md')
  if (!skillEntry) return null

  const skillMd = skillEntry.getData().toString('utf-8')

  const referenceFiles = entries
    .filter(e => e.entryName.includes('/references/') && !e.isDirectory)
    .map(e => ({
      name: e.entryName.split('/').pop()!,
      content: e.getData().toString('utf-8'),
    }))

  return { skillMd, referenceFiles }
}
