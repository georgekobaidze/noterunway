import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { xai } from '@ai-sdk/xai'
import type { LanguageModel } from 'ai'

export type ModelId =
  | 'gpt-4.1'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'claude-sonnet-4-5'
  | 'claude-3-7-sonnet'
  | 'claude-3-5-sonnet'
  | 'claude-3-haiku'
  | 'grok-3'
  | 'grok-2'

export interface ModelMeta {
  id: ModelId
  label: string
  provider: 'openai' | 'anthropic' | 'xai'
  // fast = cheaper/bulk scanning; smart = best reasoning for complex tasks
  tier: 'fast' | 'smart'
}

export const MODEL_META: ModelMeta[] = [
  { id: 'gpt-4.1',           label: 'GPT-4.1',             provider: 'openai',    tier: 'smart' },
  { id: 'gpt-4o',            label: 'GPT-4o',              provider: 'openai',    tier: 'smart' },
  { id: 'gpt-4o-mini',       label: 'GPT-4o Mini',         provider: 'openai',    tier: 'fast'  },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5',   provider: 'anthropic', tier: 'smart' },
  { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet',   provider: 'anthropic', tier: 'smart' },
  { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet',   provider: 'anthropic', tier: 'smart' },
  { id: 'claude-3-haiku',    label: 'Claude 3 Haiku',      provider: 'anthropic', tier: 'fast'  },
  { id: 'grok-3',            label: 'Grok 3',              provider: 'xai',       tier: 'smart' },
  { id: 'grok-2',            label: 'Grok 2',              provider: 'xai',       tier: 'fast'  },
]

// Returns a Vercel AI SDK LanguageModelV1 instance for the given model ID.
// The SDK reads the provider's API key from the environment automatically:
//   OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY
export function getModel(id: ModelId): LanguageModel {
  switch (id) {
    case 'gpt-4.1':           return openai('gpt-4.1')
    case 'gpt-4o':            return openai('gpt-4o')
    case 'gpt-4o-mini':       return openai('gpt-4o-mini')
    case 'claude-sonnet-4-5': return anthropic('claude-sonnet-4-5')
    case 'claude-3-7-sonnet': return anthropic('claude-3-7-sonnet-20250219')
    case 'claude-3-5-sonnet': return anthropic('claude-3-5-sonnet-20241022')
    case 'claude-3-haiku':    return anthropic('claude-3-haiku-20240307')
    case 'grok-3':            return xai('grok-3')
    case 'grok-2':            return xai('grok-2-1212')
  }
}

export const DEFAULT_MODEL: ModelId = 'gpt-4o-mini'
