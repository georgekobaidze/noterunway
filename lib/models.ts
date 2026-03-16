import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic, createAnthropic } from '@ai-sdk/anthropic'
import { xai, createXai } from '@ai-sdk/xai'
import { google, createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

export type ModelId =
  | 'gpt-4.1'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'claude-opus-4-6'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5'
  | 'grok-4'
  | 'grok-4-1-fast'
  | 'grok-3'
  | 'grok-3-mini'
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
  { id: 'claude-opus-4-6',   label: 'Claude Opus 4.6',     provider: 'anthropic', tier: 'smart' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6',   provider: 'anthropic', tier: 'smart' },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',    provider: 'anthropic', tier: 'fast'  },
  { id: 'grok-4',            label: 'Grok 4',              provider: 'xai',       tier: 'smart' },
  { id: 'grok-4-1-fast',     label: 'Grok 4.1 Fast',       provider: 'xai',       tier: 'fast'  },
  { id: 'grok-3',            label: 'Grok 3',              provider: 'xai',       tier: 'smart' },
  { id: 'grok-3-mini',       label: 'Grok 3 Mini',         provider: 'xai',       tier: 'fast'  },
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
    case 'claude-opus-4-6':   return anthropic('claude-opus-4-6')
    case 'claude-sonnet-4-6': return anthropic('claude-sonnet-4-6')
    case 'claude-haiku-4-5':  return anthropic('claude-haiku-4-5-20251001')
    case 'grok-4':            return xai('grok-4')
    case 'grok-4-1-fast':     return xai('grok-4-1-fast')
    case 'grok-3':            return xai('grok-3-latest')
    case 'grok-3-mini':       return xai('grok-3-mini')
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
  'claude-opus-4-6':   'claude-opus-4-6',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-haiku-4-5':  'claude-haiku-4-5-20251001',
  'grok-4':            'grok-4',
  'grok-4-1-fast':     'grok-4-1-fast',
  'grok-3':            'grok-3-latest',
  'grok-3-mini':       'grok-3-mini',
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
