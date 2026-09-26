import { metricsCompileContext } from './authoring.js'
import { compileMetrics } from './vendor/metrics-compiler.js'

export const RESULTS_PRESENTATION_SCHEMA = 'vlab.results-presentation/1'
export const RESULTS_PRESENTATION_CONTRACT = Object.freeze({
  schema_version: RESULTS_PRESENTATION_SCHEMA,
  plot_types: ['time-series'],
  panel: {
    required_fields: ['id', 'type', 'metric_ids'],
    id: 'Stable presentation-local identifier. Lowercase letters/digits plus ._- only.',
    type: 'time-series',
    metric_ids: 'Ordered non-empty list of stable metric IDs. A metric may appear in more than one panel.',
  },
  scientific_revision_policy: 'Results presentation is workspace state and does not increment the scientific Experiment revision.',
  arbitrary_plot_code: false,
})

function metricsArtifact(artifacts) {
  const artifact = artifacts.find((candidate) => candidate.id === 'metrics')
  if (!artifact) throw new Error("Experiment is missing required artifact 'metrics'.")
  return artifact
}

function lineOffsets(source) {
  const lines = String(source).split(/\r?\n/)
  const offsets = []
  let cursor = 0
  for (const line of lines) {
    offsets.push(cursor)
    cursor += line.length + 1
  }
  offsets.push(cursor)
  return { lines, offsets }
}

function metricSpans(source, compiled) {
  const { lines, offsets } = lineOffsets(source)
  return compiled.metrics.map((metric, index) => {
    const startLine = Math.max(1, Number(metric.source_line) || 1)
    const nextLine = index + 1 < compiled.metrics.length
      ? Math.max(startLine + 1, Number(compiled.metrics[index + 1].source_line) || lines.length + 1)
      : lines.length + 1
    return {
      id: metric.id,
      start: offsets[Math.min(startLine - 1, offsets.length - 1)],
      end: offsets[Math.min(nextLine - 1, offsets.length - 1)],
    }
  })
}

function oneMetric(source, context) {
  const compiled = compileMetrics(source, context)
  if (compiled.metrics.length !== 1) throw new Error('metric_source must define exactly one @metric(...) function.')
  return compiled.metrics[0]
}

export function metricIdsFromArtifacts(artifacts) {
  const metric = metricsArtifact(artifacts)
  const compiled = compileMetrics(metric.content, metricsCompileContext(artifacts))
  return compiled.metrics.map((entry) => entry.id)
}

export function mutateMetricArtifact(artifacts, { action, metric_id = null, metric_source = null }) {
  const context = metricsCompileContext(artifacts)
  const currentArtifact = metricsArtifact(artifacts)
  const source = currentArtifact.content
  const compiled = compileMetrics(source, context)
  const spans = metricSpans(source, compiled)
  const byId = new Map(spans.map((span) => [span.id, span]))

  let nextSource = source
  let affectedMetricId = metric_id

  if (action === 'create_metric') {
    if (typeof metric_source !== 'string') throw new Error('create_metric requires metric_source.')
    const replacement = oneMetric(metric_source, context)
    if (byId.has(replacement.id)) throw new Error(`Metric '${replacement.id}' already exists.`)
    affectedMetricId = replacement.id
    const prefix = source.trimEnd()
    nextSource = prefix ? `${prefix}\n\n${metric_source.trim()}\n` : `${metric_source.trim()}\n`
  } else if (action === 'update_metric') {
    if (!metric_id) throw new Error('update_metric requires metric_id.')
    if (typeof metric_source !== 'string') throw new Error('update_metric requires metric_source.')
    const span = byId.get(metric_id)
    if (!span) throw new Error(`Metric '${metric_id}' does not exist.`)
    const replacement = oneMetric(metric_source, context)
    if (replacement.id !== metric_id) {
      throw new Error(`update_metric must preserve stable metric id '${metric_id}'. Remove/create explicitly to change identity.`)
    }
    nextSource = `${source.slice(0, span.start)}${metric_source.trim()}\n${source.slice(span.end)}`
  } else if (action === 'remove_metric') {
    if (!metric_id) throw new Error('remove_metric requires metric_id.')
    const span = byId.get(metric_id)
    if (!span) throw new Error(`Metric '${metric_id}' does not exist.`)
    nextSource = `${source.slice(0, span.start)}${source.slice(span.end)}`.replace(/\n{3,}/g, '\n\n').trimEnd()
    if (nextSource) nextSource += '\n'
  } else {
    throw new Error(`Unsupported metric action '${action}'.`)
  }

  compileMetrics(nextSource, context)
  const nextArtifacts = artifacts.map((artifact) => artifact.id === 'metrics'
    ? { ...artifact, content: nextSource }
    : { ...artifact })
  return { artifacts: nextArtifacts, metric_id: affectedMetricId, metrics_source: nextSource }
}

function panelId(value) {
  const id = String(value ?? '').trim()
  if (!/^[a-z][a-z0-9_.-]*$/.test(id)) {
    throw new Error("Panel id must start with a lowercase letter and contain only lowercase letters, digits, '.', '_' or '-'.")
  }
  return id
}

export function normalizeResultsPanels(panels, availableMetricIds) {
  if (!Array.isArray(panels)) throw new Error('Results panels must be an array.')
  const available = new Set(availableMetricIds ?? [])
  const ids = new Set()
  return panels.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each Results panel must be an object.')
    const id = panelId(raw.id)
    if (ids.has(id)) throw new Error(`Duplicate Results panel id '${id}'.`)
    ids.add(id)
    const type = raw.type ?? 'time-series'
    if (type !== 'time-series') throw new Error(`Unsupported Results plot type '${type}'.`)
    if (!Array.isArray(raw.metric_ids) || raw.metric_ids.length === 0) {
      throw new Error(`Results panel '${id}' requires at least one metric_id.`)
    }
    const metricIds = []
    const seen = new Set()
    for (const value of raw.metric_ids) {
      const metricId = String(value)
      if (!available.has(metricId)) throw new Error(`Results panel '${id}' references unknown metric '${metricId}'.`)
      if (seen.has(metricId)) throw new Error(`Results panel '${id}' repeats metric '${metricId}'.`)
      seen.add(metricId)
      metricIds.push(metricId)
    }
    return { id, type: 'time-series', metric_ids: metricIds }
  })
}

export function emptyResultsPresentation() {
  return { schema_version: RESULTS_PRESENTATION_SCHEMA, revision: 0, panels: [] }
}

// Saved panels may name metrics that a later Experiment revision removed. Such
// references cannot be plotted, so they are dropped (and a panel left empty is
// dropped) before any change, instead of blocking every panel edit.
function plottablePanels(currentPanels, availableMetricIds) {
  const available = new Set(availableMetricIds ?? [])
  return (currentPanels ?? [])
    .map((panel) => ({ ...panel, metric_ids: (panel?.metric_ids ?? []).filter((id) => available.has(String(id))) }))
    .filter((panel) => panel.metric_ids.length > 0)
}

export function mutateResultsPanels(currentPanels, availableMetricIds, operation) {
  let panels = normalizeResultsPanels(plottablePanels(currentPanels, availableMetricIds), availableMetricIds)
  if (operation.action === 'upsert_panel') {
    const next = normalizeResultsPanels([{
      id: operation.panel_id,
      type: 'time-series',
      metric_ids: operation.metric_ids,
    }], availableMetricIds)[0]
    const index = panels.findIndex((panel) => panel.id === next.id)
    if (index >= 0) panels[index] = next
    else panels.push(next)
  } else if (operation.action === 'remove_panel') {
    const id = panelId(operation.panel_id)
    if (!(currentPanels ?? []).some((panel) => panel?.id === id)) throw new Error(`Results panel '${id}' does not exist.`)
    panels = panels.filter((panel) => panel.id !== id)
  } else {
    throw new Error(`Unsupported Results action '${operation.action}'.`)
  }
  return normalizeResultsPanels(panels, availableMetricIds)
}

export function pruneMetricFromPanels(currentPanels, availableMetricIds, removedMetricId) {
  const available = new Set(availableMetricIds)
  const next = []
  for (const panel of currentPanels ?? []) {
    const metricIds = (panel.metric_ids ?? []).filter((id) => id !== removedMetricId && available.has(id))
    if (metricIds.length) next.push({ id: panel.id, type: 'time-series', metric_ids: metricIds })
  }
  return normalizeResultsPanels(next, availableMetricIds)
}
