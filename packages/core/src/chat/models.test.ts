import { describe, expect, it } from 'vitest'

import {
  contextLimit,
  effortLabel,
  modelSummary,
  modelsFor,
  normalizeModelCatalog,
  selectedModel,
} from './models'

const catalog = normalizeModelCatalog({
  claude: {
    models: [
      {
        label: 'Default',
        description: 'The recommended model',
        effort: true,
        contextLimit: 200_000,
      },
      {
        value: 'big',
        label: 'Big',
        description: 'A larger window',
        effort: true,
        contextLimit: 1_000_000,
      },
      { value: 'small', label: 'Small', description: 'Fast', effort: false, contextLimit: 200_000 },
    ],
    effortLevels: ['low', 'high', 'xhigh'],
    effortLabels: { xhigh: 'Extra high', low: undefined },
    defaultEffort: 'high',
  },
  empty: { models: [], effortLevels: [], effortLabels: {}, defaultEffort: '' },
  gone: undefined,
})

describe('normalizeModelCatalog', () => {
  it('gives the default model a null value and drops what is absent', () => {
    expect(catalog.claude.models[0].value).toBeNull()
    expect(catalog.claude.effortLabels).toEqual({ xhigh: 'Extra high' })
    expect(catalog.gone).toBeUndefined()
  })
})

describe('modelsFor', () => {
  it('finds a provider that lists models, and nothing otherwise', () => {
    expect(modelsFor(catalog, 'claude')?.models).toHaveLength(3)
    expect(modelsFor(catalog, 'empty')).toBeNull()
    expect(modelsFor(catalog, 'codex')).toBeNull()
    expect(modelsFor(catalog, undefined)).toBeNull()
  })
})

describe('a session’s model', () => {
  const models = catalog.claude

  it('is the one named, or the first when it names none that is listed', () => {
    expect(selectedModel(models, 'big').label).toBe('Big')
    expect(selectedModel(models, null).label).toBe('Default')
    expect(selectedModel(models, 'retired').label).toBe('Default')
  })

  it('is summed up with its effort, when it takes one', () => {
    expect(modelSummary(models, null, null)).toBe('Default · High')
    expect(modelSummary(models, 'big', 'xhigh')).toBe('Big · Extra high')
    expect(modelSummary(models, 'small', 'high')).toBe('Small')
  })

  it('names an effort level without a display name by title-casing it', () => {
    expect(effortLabel(models, 'low')).toBe('Low')
  })

  it('has the context window its model lists', () => {
    expect(contextLimit(catalog, 'claude', 'big')).toBe(1_000_000)
    expect(contextLimit(catalog, 'codex', null)).toBe(200_000)
  })
})
