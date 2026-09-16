// QDS Platform integration — replaces scoring.ts and routing.ts's band/advice
// logic with a kernel call. Governed by QDS-CANON-001 v1.1.
//
// Two sections below, deliberately separated so the P1-T-13 adoption metric
// can be measured honestly:
//   [GLUE]          what adopting the platform costs — the adoption test
//   [PRODUCT-LOCAL] legacy behaviour the kernel does not and should not own
import { validateSpec } from '@stardance/qds-spec'
import { decide } from '@stardance/qds-kernel'
import specJson from '../../specs/creator-viability.sd_qds_v2.json'
import { QDSSubmission } from '../schemas/qds'
import { DimensionScores } from './scoring'

// ---- [GLUE] ---------------------------------------------------------------
const v = validateSpec(specJson)
if (!v.ok) throw new Error(`spec invalid: ${v.code} ${v.detail}`)
const SPEC = v.spec

const FIELD: Record<string, keyof QDSSubmission['payload']> = {
  q_expertise: 'expertise_strength', q_audience: 'audience_clarity',
  q_outcome: 'outcome_strength', q_demand: 'demand_evidence',
  q_readiness: 'content_readiness', q_delivery: 'preferred_delivery_format',
}
const ANSWER: Record<string, Record<string, string>> = Object.fromEntries(
  SPEC.questions.map((q) => [q.question_id,
    Object.fromEntries(q.options.map((o) => [o.map_key!, o.answer_id]))]))

const ROUTING = { ACCELERATE: 'BUILD_NOW', REFINE: 'ITERATE', CULTIVATE: 'NEEDS_CLARITY', ARCHIVE: 'NOT_READY' } as const
const CONFIDENCE = { ACCELERATE: 'high', REFINE: 'medium', CULTIVATE: 'low', ARCHIVE: 'very_low' } as const

export function evaluateQDS(payload: QDSSubmission['payload']) {
  const answers = Object.fromEntries(SPEC.questions.map((q) =>
    [q.question_id, ANSWER[q.question_id][String(payload[FIELD[q.question_id]])]]))
  const rec = decide(SPEC, answers, { mode: 'one_shot' })
  if ('refused' in rec) throw new Error(`${rec.code}: ${rec.detail}`)
  return { rec, routing: ROUTING[rec.band], confidence: CONFIDENCE[rec.band] }
}
// ---- end [GLUE] -----------------------------------------------------------

// ---- [PRODUCT-LOCAL] ------------------------------------------------------
// 1. do_qds_v1.5 names the readiness dimension `content_readiness_score`;
//    sd_qds_v2 names it `content_readiness`. Renaming it is a public API
//    change to `diagnostics.dimension_scores` and needs its own ruling.
//    Key ORDER is also part of the response as clients see it, so the object
//    is built in the do_qds_v1.5 order rather than by spreading.
export function legacyDimensionScores(d: Record<string, number>): DimensionScores {
  return {
    expertise_strength: d.expertise_strength,
    audience_clarity: d.audience_clarity,
    outcome_strength: d.outcome_strength,
    demand_evidence: d.demand_evidence,
    content_readiness_score: d.content_readiness,
    delivery_fit: d.delivery_fit,
  }
}

// 2. QDS-FIND-006. Legacy notes are two populations: eight driven by
//    dimension scores (ported to the spec's notes_rules, emitted by the
//    kernel) and seven driven by payload fields the spec does not score
//    (audience_size, prior_teaching_experience, audience_type,
//    revenue_history, launch_timeline). `notes_rules` cannot express the
//    second kind, and making the kernel read unscored payload fields would
//    put product context inside L2. They stay here. The five-note cap is
//    applied after concatenation, exactly as legacy did.
export function contextNotes(payload: any): string[] {
  const n: string[] = []
  if (payload.audience_size && payload.audience_size > 1000) n.push('Audience size is strong for launch.')
  if (payload.prior_teaching_experience) n.push('Prior teaching experience improves delivery readiness.')
  const types = Array.isArray(payload.audience_type) ? payload.audience_type : [payload.audience_type].filter(Boolean)
  if (types.includes('clients')) n.push('Existing client base is your highest-converting launch audience — offer them first access.')
  if (types.includes('subscribers')) n.push('Paid subscribers signal strong willingness to pay — price your program accordingly.')
  if (types.includes('cold') || types.length === 0 || payload.audience_range === 'none') n.push('No existing audience — JIT validation model recommended before full production.')
  if (payload.revenue_history === 'services') n.push('Existing service clients are your highest-converting first cohort — offer them access first.')
  if (payload.revenue_history === 'none') n.push('First-time monetiser — JIT validation model recommended before full production investment.')
  if (payload.launch_timeline === 'asap') n.push('30-day timeline — prioritise content readiness and audience activation immediately.')
  return n
}
