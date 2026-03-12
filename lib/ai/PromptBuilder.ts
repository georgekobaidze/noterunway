export type MessageRole = 'system' | 'user' | 'assistant'

export interface Message {
  role: MessageRole
  content: string
}

// Shape of a single MCP tool call as returned by the AI in structured JSON
export interface MCPToolCallSpec {
  tool: string
  parameters: Record<string, unknown>
}

// Shape of the full structured JSON response the AI must return
export interface AIActionPlan {
  reasoning: string
  actions: MCPToolCallSpec[]
}

// Abstract base class — one subclass per feature
export abstract class PromptBuilder<TContext = unknown> {
  // Each feature defines its own system prompt
  protected abstract readonly systemPrompt: string

  // Each feature constructs its own user message from workspace context
  protected abstract buildUserPrompt(context: TContext): string

  // Assembles the full [system, user] message array for the AI call
  buildFullPrompt(context: TContext): Message[] {
    return [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: this.buildUserPrompt(context) },
    ]
  }

  // Parses the AI's raw text response into a structured AIActionPlan.
  // Returns null if the response is not valid JSON or missing required fields.
  parseResponse(raw: string): AIActionPlan | null {
    try {
      // Strip markdown code fences if the model wraps its JSON in ```json ... ```
      const cleaned = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
      const parsed = JSON.parse(cleaned)

      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { reasoning?: unknown }).reasoning === 'string' &&
        Array.isArray((parsed as { actions?: unknown }).actions) &&
        (parsed as { actions: unknown[] }).actions.every((action) => {
          if (!action || typeof action !== 'object') return false
          const a = action as { tool?: unknown; parameters?: unknown }
          return (
            typeof a.tool === 'string' &&
            typeof a.parameters === 'object' &&
            a.parameters !== null &&
            !Array.isArray(a.parameters)
          )
        })
      ) {
        return parsed as AIActionPlan
      }

      return null
    } catch {
      return null
    }
  }
}
