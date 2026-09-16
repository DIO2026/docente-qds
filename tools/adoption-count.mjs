// P1-T-13 adoption metric. The criterion: a surface adopts the QDS Platform
// with ONE spec file and UNDER 50 LINES of glue.
//
// Counted as glue: the [GLUE] section of kernel-adapter.ts (imports, spec
// load, field/answer mapping, the decide() call, band->legacy vocabulary),
// plus the lines the route itself had to change to call it.
// Not counted as glue, and reported separately: product-local code the
// kernel does not own (legacy dimension key names, payload-context notes,
// recommendProductShape) and the additive meta.qds_platform provenance block.
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const code = (t) => t.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))

const ad = readFileSync('src/engine/kernel-adapter.ts', 'utf8')
const glueSrc = ad.split('// ---- end [GLUE]')[0]
const localSrc = ad.split('// ---- [PRODUCT-LOCAL]')[1] ?? ''

const glue = code(glueSrc)
const local = code(localSrc)

// Route delta, from git, excluding the additive provenance block.
const diff = execSync('git diff HEAD -- src/routes/qds.ts').toString().split('\n')
const added = diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1))
const removed = diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1))
const provenance = added.slice(added.findIndex((l) => l.includes('qds_platform: {')))
const routeAdded = code(added.join('\n')).length - code(provenance.join('\n')).length
const routeRemoved = code(removed.join('\n')).length

const report = {
  criterion: 'one spec file + under 50 lines of glue (P1-T-13)',
  spec_files: 1,
  spec_file: 'specs/creator-viability.sd_qds_v2.json',
  glue_lines: { adapter_glue_section: glue.length, route_changes: routeAdded, total: glue.length + routeAdded },
  under_50: glue.length + routeAdded < 50,
  product_local_lines: {
    adapter_product_local_section: local.length,
    note: 'legacy dimension key names + payload-context notes the spec does not score (QDS-FIND-006). Not adoption cost; retained legacy behaviour.',
  },
  provenance_block_lines: code(provenance.join('\n')).length,
  legacy_engine_lines_replaced: {
    scoring_ts: code(readFileSync('src/engine/scoring.ts', 'utf8')).length,
    routing_ts_superseded: 'assignRoutingDecision, assignConfidenceBand, generateNextStep, generateNotes (dimension half)',
    route_lines_removed: routeRemoved,
  },
}
console.log(JSON.stringify(report, null, 2))
import { mkdirSync, writeFileSync } from 'node:fs'
mkdirSync('evidence', { recursive: true })
writeFileSync('evidence/adoption-count.json', JSON.stringify(report, null, 2))
