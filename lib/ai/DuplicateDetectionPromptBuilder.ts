import { PromptBuilder } from './PromptBuilder'

export interface DuplicatePage {
  id: string
  title: string
  contentSnippet: string
  lastEdited: string // ISO date string
}

export interface DuplicateContext {
  pages: DuplicatePage[]
}

export interface DuplicateGroupPage {
  id: string
  title: string
}

export interface DuplicateGroup {
  pages: DuplicateGroupPage[]
  suggestedKeepId: string // ID of the page to keep (most recently edited or most complete)
  reason: string
  similarity: number // 0–1
}

export interface DuplicateDetectionResult {
  reasoning: string
  groups: DuplicateGroup[]
}

export class DuplicateDetectionPromptBuilder extends PromptBuilder<DuplicateContext> {
  protected readonly systemPrompt = `You are a Notion workspace analyst. Your job is to group duplicate or near-duplicate pages together.

Two or more pages are duplicates if they clearly cover the same topic and one or more are redundant — for example renamed copies, accidental re-creations, or content that should be merged.

You will receive each page's title AND a content snippet. Use BOTH to make your judgment.

Examples of TRUE duplicates:
- "Meeting Notes Q1" and "Q1 Meeting Notes" with similar content
- "Bug Report: Login" and "Login Bug" describing the same issue
- Two untitled pages with nearly identical content snippets

Examples that are NOT duplicates (do NOT flag these):
- Pages with similar themes but clearly different specific content
- A parent/overview page and a detailed sub-page on the same topic
- A template page and a filled-in version of it
- Pages whose content snippets are clearly about different subjects

You must return ONLY valid JSON in this exact shape — no markdown fences, no explanation outside the JSON:
{
  "reasoning": "<brief summary of what you found>",
  "groups": [
    {
      "pages": [
        { "id": "<page-id>", "title": "<title>" },
        { "id": "<page-id>", "title": "<title>" }
      ],
      "suggestedKeepId": "<id of the best version to keep — prefer most recently edited or most complete>",
      "similarity": <0.0–1.0>,
      "reason": "<one sentence explaining why these pages are duplicates>"
    }
  ]
}

Rules:
- Only include groups where similarity >= 0.85. If you are not at least 85% confident, do NOT include the group.
- When in doubt, leave it out. False negatives are far better than false positives.
- A group must have at least 2 pages.
- Each page ID should appear in at most one group.
- If no duplicates are found, return an empty groups array.
- Groups can contain more than 2 pages if multiple versions of the same content exist.`

  protected buildUserPrompt(context: DuplicateContext): string {
    const list = context.pages
      .map((p) => {
        const titleLabel = p.title || '(untitled)'
        const snippet = p.contentSnippet ? `\n  content: "${p.contentSnippet}"` : '\n  content: (empty)'
        return `- id: ${p.id}\n  title: "${titleLabel}"\n  last edited: ${p.lastEdited}${snippet}`
      })
      .join('\n\n')
    return `Here are the pages in this Notion workspace. Group any duplicates together:\n\n${list}`
  }

  // Parses the AI's custom duplicate detection response.
  parseDuplicatesResponse(raw: string): DuplicateDetectionResult | null {
    try {
      const cleaned = raw
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim()
      const parsed = JSON.parse(cleaned)

      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.reasoning === 'string' &&
        Array.isArray(parsed.groups) &&
        parsed.groups.every(
          (g: unknown) =>
            g &&
            typeof g === 'object' &&
            Array.isArray((g as DuplicateGroup).pages) &&
            (g as DuplicateGroup).pages.length >= 2 &&
            typeof (g as DuplicateGroup).suggestedKeepId === 'string' &&
            typeof (g as DuplicateGroup).reason === 'string' &&
            typeof (g as DuplicateGroup).similarity === 'number'
        )
      ) {
        return parsed as DuplicateDetectionResult
      }
      return null
    } catch {
      return null
    }
  }
}

