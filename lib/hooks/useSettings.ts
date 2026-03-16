'use client'

import { useState, useEffect } from 'react'
import type { ModelId } from '@/lib/models'

export type Provider = 'openai' | 'anthropic' | 'xai' | 'google'

export interface Settings {
  aiProvider: Provider
  aiKeys: Record<Provider, string>
  modelId: ModelId
}

const DEFAULTS: Settings = {
  aiProvider: 'openai',
  aiKeys: { openai: '', anthropic: '', xai: '', google: '' },
  modelId: 'gpt-4o-mini',
}

const STORAGE_KEY = 'nr-settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Migrate from old single aiKey field
        if (typeof parsed.aiKey === 'string' && parsed.aiKey) {
          const provider: Provider = parsed.aiProvider ?? 'openai'
          parsed.aiKeys = { ...DEFAULTS.aiKeys, [provider]: parsed.aiKey }
          delete parsed.aiKey
        }
        setSettings({ ...DEFAULTS, ...parsed, aiKeys: { ...DEFAULTS.aiKeys, ...parsed.aiKeys } })
      }
    } catch {
      // ignore parse errors
    }
    setLoaded(true)
  }, [])

  const save = (updates: Partial<Settings & { aiKey: string }>) => {
    setSettings(prev => {
      // Allow callers to pass aiKey as shorthand for the current provider's key
      const { aiKey, ...rest } = updates as Partial<Settings & { aiKey: string }>
      const next: Settings = { ...prev, ...rest }
      if (aiKey !== undefined) {
        next.aiKeys = { ...prev.aiKeys, [next.aiProvider]: aiKey }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  // Computed active key for the current provider
  const aiKey = settings.aiKeys[settings.aiProvider] ?? ''

  return { settings, aiKey, save, loaded }
}
