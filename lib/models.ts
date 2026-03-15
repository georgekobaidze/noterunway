import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { xai, createXai } from '@ai-sdk/xai'
import { google, createGoogleGenerativeAI } from '@ai-sdk/google'
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
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'

export interface ModelMeta {
  id: ModelId
  label: string
  provider: 'openai' | 'anthropic' | 'xai' | 'google'
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
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   provider: 'google', tier: 'smart' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google', tier: 'fast'  },
]

// Returns a Vercel AI SDK LanguageModelV1 instance for the given model ID.
// The SDK reads the provider's API key from the environment automatically:
//   OPENAI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
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
    case 'gemini-2.5-pro':   return google('gemini-2.5-pro')
    case 'gemini-2.5-flash': return google('gemini-2.5-flash')
  }
}

export const DEFAULT_MODEL: ModelId = 'gpt-4o-mini'

// Maps a ModelId to the provider-specific string used by each SDK
const MODEL_SDK_ID: Record<ModelId, string> = {
  'gpt-4.1':           'gpt-4.1',
  'gpt-4o':            'gpt-4o',
  'gpt-4o-mini':       'gpt-4o-mini',
  'claude-sonnet-4-5': 'claude-sonnet-4-5',
  'claude-3-7-sonnet': 'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet': 'claude-3-5-sonnet-20241022',
  'claude-3-haiku':    'claude-3-haiku-20240307',
  'grok-3':            'grok-3',
  'grok-2':            'grok-2-1212',
  'gemini-2.5-pro':   'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
}

// Returns a model instance using a user-supplied API key (BYOK).
// Used in API routes where the key comes from the client request headers.
export function getModelWithKey(id: ModelId, apiKey: string): LanguageModel {
  const meta = MODEL_META.find((m) => m.id === id)
  if (!meta) throw new Error(`Unknown model: ${id}`)
  const sdkId = MODEL_SDK_ID[id]
  switch (meta.provider) {
    case 'openai':    return createOpenAI({ apiKey })(sdkId)
    case 'anthropic': return createAnthropic({ apiKey })(sdkId)
    case 'xai':       return createXai({ apiKey })(sdkId)
    case 'google':    return createGoogleGenerativeAI({ apiKey })(sdkId)
  }
}
