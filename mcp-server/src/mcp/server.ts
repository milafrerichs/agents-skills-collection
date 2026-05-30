import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getSkillIndex, getAgentIndex, getSkillContent, getAgentContent } from '../services/indexer.js'

export function createMcpServer() {
  const server = new McpServer(
    { name: 'skills-collection', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.tool(
    'list_skills',
    'List all available skills in the collection. Returns name, description, format, and whether reference files are available. Use the optional query parameter to filter by keyword.',
    { query: z.string().optional().describe('Filter skills by keyword in name or description') },
    async ({ query }) => {
      const index = getSkillIndex()
      let skills = Array.from(index.values())

      if (query) {
        const q = query.toLowerCase()
        skills = skills.filter(s =>
          s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
        )
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(skills.map(s => ({
            name: s.name,
            description: s.description,
            format: s.format,
            hasReferences: s.hasReferences,
          })), null, 2),
        }],
      }
    }
  )

  server.tool(
    'list_agents',
    'List all available agents in the collection. Returns name, description, model, and the skills each agent depends on. Use the optional query parameter to filter by keyword.',
    { query: z.string().optional().describe('Filter agents by keyword in name or description') },
    async ({ query }) => {
      const index = getAgentIndex()
      let agents = Array.from(index.values())

      if (query) {
        const q = query.toLowerCase()
        agents = agents.filter(a =>
          a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
        )
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(agents.map(a => ({
            name: a.name,
            description: a.description,
            model: a.model,
            skills: a.skills,
          })), null, 2),
        }],
      }
    }
  )

  server.tool(
    'get_skill',
    'Get the full content of a skill by name. Returns the complete SKILL.md markdown content that can be loaded into context. Set include_references to true to also get all reference files appended.',
    {
      name: z.string().describe('Skill name (e.g., "tdd", "clean-code", "design-patterns-expert")'),
      include_references: z.boolean().optional().default(false)
        .describe('Include reference files if available — can be large for skills with many references'),
    },
    async ({ name, include_references }) => {
      const content = getSkillContent(name, include_references)
      if (!content) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Skill "${name}" not found` }) }],
          isError: true,
        }
      }
      return { content: [{ type: 'text', text: content }] }
    }
  )

  server.tool(
    'get_agent',
    'Get the full definition of an agent by name. Returns the raw markdown (frontmatter + system prompt body) and parsed metadata including which skills the agent depends on. Load those skills with get_skill to fully configure the agent.',
    {
      name: z.string().describe('Agent name (e.g., "tdd-clean-coder", "file-finder")'),
    },
    async ({ name }) => {
      const result = getAgentContent(name)
      if (!result) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: `Agent "${name}" not found` }) }],
          isError: true,
        }
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            metadata: result.metadata,
            system_prompt: result.raw,
          }, null, 2),
        }],
      }
    }
  )

  server.tool(
    'search',
    'Search across skills and agents by keyword. Matches against names, descriptions, and content. Results are ranked: name matches first, then description, then body content.',
    {
      query: z.string().describe('Search keyword'),
      type: z.enum(['all', 'skills', 'agents']).optional().default('all')
        .describe('Limit search to skills, agents, or both'),
    },
    async ({ query, type }) => {
      const q = query.toLowerCase()
      const results: { kind: string; name: string; description: string; matchIn: string }[] = []

      if (type === 'all' || type === 'skills') {
        for (const skill of getSkillIndex().values()) {
          if (skill.name.toLowerCase().includes(q)) {
            results.push({ kind: 'skill', name: skill.name, description: skill.description, matchIn: 'name' })
          } else if (skill.description.toLowerCase().includes(q)) {
            results.push({ kind: 'skill', name: skill.name, description: skill.description, matchIn: 'description' })
          } else {
            const content = getSkillContent(skill.name, false)
            if (content && content.toLowerCase().includes(q)) {
              results.push({ kind: 'skill', name: skill.name, description: skill.description, matchIn: 'content' })
            }
          }
        }
      }

      if (type === 'all' || type === 'agents') {
        for (const agent of getAgentIndex().values()) {
          if (agent.name.toLowerCase().includes(q)) {
            results.push({ kind: 'agent', name: agent.name, description: agent.description, matchIn: 'name' })
          } else if (agent.description.toLowerCase().includes(q)) {
            results.push({ kind: 'agent', name: agent.name, description: agent.description, matchIn: 'description' })
          } else {
            const content = getAgentContent(agent.name)
            if (content && content.raw.toLowerCase().includes(q)) {
              results.push({ kind: 'agent', name: agent.name, description: agent.description, matchIn: 'content' })
            }
          }
        }
      }

      const priority = { name: 0, description: 1, content: 2 }
      results.sort((a, b) => priority[a.matchIn as keyof typeof priority] - priority[b.matchIn as keyof typeof priority])

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ count: results.length, results }, null, 2),
        }],
      }
    }
  )

  return server
}
