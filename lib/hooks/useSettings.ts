'use client'

import { useState, useEffect } from 'react'
import type { ModelId } from '@/lib/models'

export interface Settings {
  aiProvider: 'openai' | 'anthropic' | 'xai'
  aiKey: string
  modelId: ModelId
}

const DEFAULTS: Settings = {
  aiProvider: 'openai',
  aiKey: '',
  modelId: 'gpt-4o-mini',
}

const STORAGE_KEY = 'nr-settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) })
    } catch {
      // ignore parse errors
    }
    setLoaded(true)
  }, [])

  const save = (updates: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return { settings, save, loaded }
}
