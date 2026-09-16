/**
 * M1 service-level equivalence (P1-T-22).
 *
 * A-side: src/routes/qds.legacy.ts — a verbatim `git show HEAD` copy of the
 *         production route, running the do_qds_v1.5 engine.
 * B-side: src/routes/qds.ts — the same route wired to the QDS Platform kernel.
 *
 * Both are driven as EXPRESS HANDLERS with identical requests, and the full
 * JSON response body is deep-compared. This is stricter than the P1-T-07
 * golden run, which compared band and next_action only: notes, dimension
 * scores, viability_score, product shape and diagnostics are all in scope here.
 *
 * Fields excluded from comparison, with reason:
 *   processed_at           — wall clock, set per request by both sides
 *   meta.qds_platform      — new, additive; has no A-side counterpart
 */
import axios from 'axios'
// Both routes fire-and-forget an analytics POST. Stub it: the harness is
// comparing decision output, and 130k real HTTP attempts would dominate the run.
;(axios as any).post = async () => ({ data: {} })

import legacyRouter from '../src/routes/qds.legacy'
import kernelRouter from '../src/routes/qds'

const EXPERTISE = ['highly_specific', 'clear_validated', 'broad_general', 'vague_weak']
const AUDIENCE = ['narrow_specific', 'clear_moderate', 'broad_ambiguous', 'vague_undefined']
const OUTCOME = ['concrete_transformation', 'meaningful_outcome', 'generic_benefit', 'unclear_value']
const DEMAND = ['strong_proof', 'moderate_evidence', 'anecdotal_weak', 'no_proof']
const READINESS = ['none', 'outline_only', 'partial_materials', 'substantial_materials', 'launch_ready']
const DELIVERY = ['cohort_program', 'self_paced_course', 'workshop', 'community', 'coaching', 'hybrid']

// Every payload field the legacy notes logic reads, at every value that
// changes a branch, plus undefined.
const CTX_AUDIENCE_SIZE = [undefined, 500, 1000, 5000]
const CTX_TEACHING = [undefined, true, false]
const CTX_TYPE: any[] = [undefined, 'clients', 'subscribers', 'cold', ['clients', 'subscribers'], ['cold', 'clients'], []]
const CTX_RANGE = [undefined, 'none', 'small', 'large']
const CTX_REVENUE = [undefined, 'none', 'services', 'group', 'content', 'multiple']
const CTX_TIMELINE = [undefined, 'asap', 'one_to_three', 'three_to_six', 'no_timeline']

const CONTEXTS: any[] = []
for (const audience_size of CTX_AUDIENCE_SIZE)
  for (const prior_teaching_experience of CTX_TEACHING)
    for (const audience_type of CTX_TYPE)
      for (const audience_range of CTX_RANGE)
        for (const revenue_history of CTX_REVENUE)
          for (const launch_timeline of CTX_TIMELINE)
            CONTEXTS.push({ audience_size, prior_teaching_experience, audience_type, audience_range, revenue_history, launch_timeline })

const NEUTRAL = CONTEXTS[0]

function payloadFor(e: string, a: string, o: string, d: string, r: string, f: string, ctx: any) {
  const p: any = {
    expertise_strength: e, audience_clarity: a, outcome_strength: o, demand_evidence: d,
    content_readiness: r, preferred_delivery_format: f,
    expertise_domain: 'domain', target_audience: 'audience', offer_or_idea: 'offer',
    transformation_outcome: 'outcome', proof_of_demand: 'proof',
  }
  for (const [k, v] of Object.entries(ctx)) if (v !== undefined) p[k] = v
  return p
}

const FIXED_ID = '00000000-0000-4000-8000-000000000000'

async function call(router: any, payload: any): Promise<any> {
  const req: any = {
    body: { version: 'do_qds_v1.5', submission_id: FIXED_ID, submitted_at: '2026-01-01T00:00:00.000Z', payload },
    method: 'POST', url: '/submit', originalUrl: '/submit', baseUrl: '', headers: {}, query: {}, params: {},
    app: { get: () => undefined }, get: () => undefined,
  }
  return new Promise((resolve, reject) => {
    const res: any = {
      statusCode: 0,
      status(c: number) { this.statusCode = c; return this },
      json(b: any) { resolve({ status: this.statusCode, body: b }) },
      set() { return this }, setHeader() { return this },
    }
    router(req, res, (err: any) => (err ? reject(err) : resolve({ status: 404, body: null })))
  })
}

function normalise(r: any) {
  if (!r.body) return r
  const b = JSON.parse(JSON.stringify(r.body))
  delete b.processed_at
  if (b.meta) delete b.meta.qds_platform
  return { status: r.status, body: b }
}

function firstDiff(a: any, b: any, path = ''): string | null {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`
  const ka = Object.keys(a), kb = Object.keys(b)
  for (const k of new Set([...ka, ...kb])) {
    const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k)
    if (d) return d
  }
  if (ka.join(',') !== kb.join(',')) return `${path}: key order ${ka.join(',')} != ${kb.join(',')}`
  return `${path}: shape differs`
}

async function main() {
  let compared = 0
  const mismatches: any[] = []
  const bandCount: Record<string, number> = {}

  const record = async (payload: any, label: string) => {
    const [A, B] = await Promise.all([call(legacyRouter, payload), call(kernelRouter, payload)])
    compared++
    const na = normalise(A), nb = normalise(B)
    const d = firstDiff(na.body, nb.body)
    if (d) { if (mismatches.length < 25) mismatches.push({ label, diff: d, payload }) ; else mismatches.push({ label, diff: d }) }
    const rd = na.body?.result?.routing_decision
    if (rd) bandCount[rd] = (bandCount[rd] ?? 0) + 1
  }

  // Pass 1 — the full scored space, neutral context. 7,680 vectors.
  let i = 0
  for (const e of EXPERTISE) for (const a of AUDIENCE) for (const o of OUTCOME)
    for (const d of DEMAND) for (const r of READINESS) for (const f of DELIVERY) {
      await record(payloadFor(e, a, o, d, r, f, NEUTRAL), `scored:${e}/${a}/${o}/${d}/${r}/${f}`)
      i++
    }
  const pass1 = compared

  // Pass 2 — the full context space against scored vectors chosen to emit
  // 0,1,2,3 and 4 dimension notes, which is every reachable value of the
  // dimension-note count. This covers the concat and the five-note cap.
  const NOTE_CLASSES: [string, string, string, string][] = [
    ['broad_general', 'broad_ambiguous', 'generic_benefit', 'anecdotal_weak'],       // 0 notes
    ['highly_specific', 'broad_ambiguous', 'generic_benefit', 'anecdotal_weak'],     // 1
    ['highly_specific', 'narrow_specific', 'generic_benefit', 'anecdotal_weak'],     // 2
    ['highly_specific', 'narrow_specific', 'concrete_transformation', 'anecdotal_weak'], // 3
    ['highly_specific', 'narrow_specific', 'concrete_transformation', 'strong_proof'],   // 4 (high side)
    ['vague_weak', 'vague_undefined', 'unclear_value', 'no_proof'],                  // 4 (low side)
  ]
  for (const [e, a, o, d] of NOTE_CLASSES)
    for (const ctx of CONTEXTS)
      await record(payloadFor(e, a, o, d, 'partial_materials', 'workshop', ctx), `ctx:${e}/${JSON.stringify(ctx)}`)

  const report = {
    tool: 'm1-service-equivalence',
    a_side: 'src/routes/qds.legacy.ts (verbatim HEAD copy, do_qds_v1.5 engine)',
    b_side: 'src/routes/qds.ts (@stardance/qds-kernel)',
    compared_scope: 'entire JSON response body except processed_at and meta.qds_platform',
    pass_1_scored_vectors: pass1,
    pass_2_context_vectors: compared - pass1,
    context_combinations: CONTEXTS.length,
    total_requests_compared: compared,
    mismatches: mismatches.length,
    band_distribution_pass_1: bandCount,
    sample_mismatches: mismatches.slice(0, 10),
    PASS: mismatches.length === 0,
  }
  require('fs').mkdirSync('evidence', { recursive: true })
  require('fs').writeFileSync('evidence/m1-service-equivalence.json', JSON.stringify(report, null, 2))
  console.log(`requests ${compared} | scored ${pass1} | context ${compared - pass1} | mismatches ${mismatches.length} | PASS=${mismatches.length === 0}`)
  if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 5), null, 2))
  process.exit(mismatches.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
