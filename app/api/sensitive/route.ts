import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { NotionClient } from '@/lib/notion/NotionClient'
import { getModelWithKey, MODEL_META, DEFAULT_MODEL } from '@/lib/models'
import type { ModelId } from '@/lib/models'
import type { SensitiveFinding, SensitiveCategory } from '@/lib/notion/NotionClient'

function getNotionToken(req: NextRequest): string | null {
  return req.cookies.get('notion_token')?.value ?? null
}

function sanitizeRedactedSnippet(snippet: string | null | undefined): string {
  // Defensive server-side redaction: enforce a max length and mask everything
  // after the first few visible characters, regardless of what the model returns.
  if (!snippet) return ''

  const MAX_LEN = 256
  const VISIBLE_PREFIX = 4

  let s = snippet.trim()
  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN)
  }

  if (s.length <= VISIBLE_PREFIX) {
    return '*'.repeat(s.length)
  }

  const prefix = s.slice(0, VISIBLE_PREFIX)
  const masked = '*'.repeat(s.length - VISIBLE_PREFIX)
  return prefix + masked
}

const KNOWN_PATTERNS_DESCRIPTION = `
- OpenAI API keys (starting with sk- or sk-proj-)
- Anthropic API keys (starting with sk-ant-)
- xAI/Grok keys (starting with xai-)
- Stripe keys (starting with sk_live_, sk_test_, pk_live_, pk_test_)
- AWS Access Key IDs (starting with AKIA)
- GitHub tokens (starting with ghp_, gho_, ghu_, ghs_, ghr_, github_pat_)
- PEM private keys (-----BEGIN PRIVATE KEY-----)
- JWT tokens (three base64url parts separated by dots)
- Database connection URLs (postgres://, mysql://, mongodb://, redis://)
- Credit card numbers (16-digit Visa/Mastercard/Amex/Discover patterns)
- Assignments like: password = "...", secret: "...", api_secret = "..."
`.trim()

const AI_SYSTEM_PROMPT = `You are a security analyst reviewing Notion workspace pages for accidentally stored sensitive data.

We already automatically detect the following patterns — DO NOT report these:
${KNOWN_PATTERNS_DESCRIPTION}

Your job is ONLY to flag sensitive data written in natural language or informal formats that the patterns above would miss. Examples of what you SHOULD flag:
- "the password is: hunter2"
- "use this token: abc123xyz"
- "my secret key is supersecret99"
- "login with admin / password123"
- "API key: some-value-here"
- Social security numbers written in prose
- Bank account numbers in plain text
- Private keys or secrets shared conversationally

Be conservative — only flag things that are clearly sensitive. Do NOT flag:
- Example/placeholder values like "your-api-key-here" or "REPLACE_ME"
- Code comments explaining what a variable does
- Documentation describing what a field is for
- Things already covered by the known patterns list above

For each finding, return:
- patternName: short human-readable label (e.g. "Natural language password", "Shared credentials")
- category: one of "api_key", "credential", "pii", "crypto"
- redactedSnippet: redact the sensitive value, showing only first 4 chars + "..." (e.g. "password is: hunt...")
- context: the surrounding sentence (max 100 chars) so the user understands where it appeared`

const aiSensitiveSchema = z.object({
  findings: z.array(z.object({
    patternName: z.string(),
    category: z.enum(['api_key', 'credential', 'pii', 'crypto']),
    redactedSnippet: z.string(),
    context: z.string(),
  })),
})

// GET /api/sensitive
// Scans all workspace pages for sensitive data patterns (API keys, tokens, PII, etc.).
// Pass header x-ai-key + x-ai-model to also run a deep AI scan for natural-language secrets.
// Read-only — no pages are modified.
export async function GET(req: NextRequest) {
  const token = getNotionToken(req)
  if (!token) {
    return NextResponse.json({ error: 'not_connected' }, { status: 401 })
  }

  const deepAI = req.nextUrl.searchParams.get('deepAI') === 'true'
  const aiKey = req.headers.get('x-ai-key')
  const requestedModel = req.headers.get('x-ai-model')
  const modelId: ModelId = (requestedModel && MODEL_META.some((m) => m.id === requestedModel))
    ? requestedModel as ModelId
    : DEFAULT_MODEL

  if (deepAI && !aiKey) {
    return NextResponse.json({ error: 'missing_ai_key' }, { status: 400 })
  }

  try {
    const notion = new NotionClient(token)
    const result = await notion.getSensitiveFindings()

    if (!deepAI || !aiKey) {
      return NextResponse.json(result)
    }

    // ── Deep AI scan ─────────────────────────────────────────────────────────
    // For each page that has text, send content to AI to find natural-language secrets.
    // We build a set of (pageId, lowerSnippet) pairs from regex findings to deduplicate.
    const regexKeys = new Set(
      result.findings.map((f) => `${f.sourcePageId}:${f.redactedSnippet.toLowerCase()}`)
    )

    const aiFindings: SensitiveFinding[] = []
    const model = getModelWithKey(modelId, aiKey)

    // Group text by page — reuse the pages from the result stats
    const pages = await notion.getAllPagesWithText()

    for (const { pageId, pageTitle, text } of pages) {
      if (!text.trim()) continue

      // Chunk text to ~3000 chars to stay within token limits
      const chunks: string[] = []
      for (let i = 0; i < text.length; i += 3000) {
        chunks.push(text.slice(i, i + 3000))
      }

      for (const chunk of chunks) {
        let parsed
        try {
          const { object } = await generateObject({
            model,
            schema: aiSensitiveSchema,
            messages: [
              { role: 'system', content: AI_SYSTEM_PROMPT },
              { role: 'user', content: `Page: "${pageTitle}"\n\nContent:\n${chunk}` },
            ],
            temperature: 0,
          })
          parsed = object
        } catch {
          continue
        }

        for (const f of parsed.findings) {
          const sanitizedSnippet = sanitizeRedactedSnippet(f.redactedSnippet)
          const key = `${pageId}:${sanitizedSnippet.toLowerCase()}`
          if (regexKeys.has(key)) continue  // already caught by regex
          regexKeys.add(key)                // prevent duplicates across chunks
          aiFindings.push({
            sourcePageId: pageId,
            sourcePageTitle: pageTitle,
            patternName: f.patternName,
            category: f.category as SensitiveCategory,
            redactedSnippet: sanitizedSnippet,
          })
        }
      }
    }

    return NextResponse.json({
      ...result,
      aiFindings,
      stats: {
        ...result.stats,
        aiFindingCount: aiFindings.length,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
