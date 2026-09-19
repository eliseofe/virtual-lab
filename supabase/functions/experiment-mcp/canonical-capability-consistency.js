export function validateCanonicalCapabilitySurface(registryRows, bindings) {
  const errors = []
  const rows = Array.isArray(registryRows) ? registryRows : []
  const authoringBindings = Array.isArray(bindings) ? bindings : []

  const rowsById = new Map()
  const rowsByKey = new Map()
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || typeof row.capability_key !== "string") {
      errors.push("Canonical registry row lacks stable id/key.")
      continue
    }
    if (rowsById.has(row.id)) errors.push(`Duplicate canonical capability id: ${row.id}`)
    if (rowsByKey.has(row.capability_key)) errors.push(`Duplicate canonical capability key: ${row.capability_key}`)
    rowsById.set(row.id, row)
    rowsByKey.set(row.capability_key, row)

    const provenance = Array.isArray(row.publication_provenance) ? row.publication_provenance : []
    if (provenance.length === 0) {
      errors.push(`Canonical capability lacks publication provenance: ${row.capability_key}`)
    }

    if (row.implementation_state === "implemented") {
      if (!Array.isArray(row.implementation_contracts) || row.implementation_contracts.length === 0) {
        errors.push(`Implemented capability lacks implementation contracts: ${row.capability_key}`)
      }
      if (typeof row.implementation_version !== "string" || row.implementation_version.trim().length === 0) {
        errors.push(`Implemented capability lacks implementation version: ${row.capability_key}`)
      }
      if (typeof row.implemented_at !== "string" || row.implemented_at.trim().length === 0) {
        errors.push(`Implemented capability lacks implementation timestamp: ${row.capability_key}`)
      }
    }
  }

  const bindingsById = new Map()
  for (const binding of authoringBindings) {
    if (!binding || typeof binding.canonical_capability_id !== "string" || typeof binding.capability_key !== "string") {
      errors.push("Authoring binding lacks canonical id/key.")
      continue
    }
    if (bindingsById.has(binding.canonical_capability_id)) {
      errors.push(`Duplicate authoring binding for canonical id: ${binding.canonical_capability_id}`)
    }
    bindingsById.set(binding.canonical_capability_id, binding)

    const row = rowsById.get(binding.canonical_capability_id)
    if (!row) {
      errors.push(`Authoring binding references missing canonical capability: ${binding.capability_key}`)
      continue
    }
    if (row.capability_key !== binding.capability_key) {
      errors.push(`Authoring binding key mismatch for canonical id ${binding.canonical_capability_id}`)
    }
    if (row.implementation_state !== "implemented") {
      errors.push(`Non-implemented capability is advertised as authorable: ${binding.capability_key}`)
    }
  }

  for (const row of rows) {
    if (row?.implementation_state !== "implemented") continue
    const binding = bindingsById.get(row.id)
    if (!binding) {
      errors.push(`Implemented canonical capability lacks deployed authoring binding: ${row.capability_key}`)
    }
  }

  return { valid: errors.length === 0, errors }
}
