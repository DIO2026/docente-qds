import { QDSSubmission } from '../schemas/qds'

export interface DimensionScores {
  expertise_strength: number
  audience_clarity: number
  outcome_strength: number
  demand_evidence: number
  content_readiness_score: number
  delivery_fit: number
}

// Deterministic scoring maps
const EXPERTISE_SCORES: Record<string, number> = {
  highly_specific: 90,
  clear_validated: 75,
  broad_general: 55,
  vague_weak: 25,
}

const AUDIENCE_SCORES: Record<string, number> = {
  narrow_specific: 90,
  clear_moderate: 75,
  broad_ambiguous: 55,
  vague_undefined: 25,
}

const OUTCOME_SCORES: Record<string, number> = {
  concrete_transformation: 90,
  meaningful_outcome: 75,
  generic_benefit: 55,
  unclear_value: 25,
}

const DEMAND_SCORES: Record<string, number> = {
  strong_proof: 90,
  moderate_evidence: 70,
  anecdotal_weak: 50,
  no_proof: 20,
}

const CONTENT_READINESS_SCORES: Record<string, number> = {
  none: 10,
  outline_only: 35,
  partial_materials: 60,
  substantial_materials: 80,
  launch_ready: 95,
}

const DELIVERY_FIT_SCORES: Record<string, number> = {
  cohort_program: 85,
  self_paced_course: 75,
  workshop: 80,
  community: 70,
  coaching: 75,
  hybrid: 85,
}

const AUDIENCE_RANGE_SCORES: Record<string, number> = {
  none: 10,
  micro: 35,
  small: 55,
  medium: 75,
  large: 90,
}

// Weights — must sum to 1.0
const WEIGHTS = {
  expertise_strength: 0.20,
  audience_clarity: 0.20,
  outcome_strength: 0.20,
  demand_evidence: 0.20,
  content_readiness_score: 0.10,
  delivery_fit: 0.10,
}

export function scoreDimensions(payload: QDSSubmission['payload']): DimensionScores {
  return {
    expertise_strength: EXPERTISE_SCORES[payload.expertise_strength],
    audience_clarity: AUDIENCE_SCORES[payload.audience_clarity],
    outcome_strength: OUTCOME_SCORES[payload.outcome_strength],
    demand_evidence: DEMAND_SCORES[payload.demand_evidence],
    content_readiness_score: CONTENT_READINESS_SCORES[payload.content_readiness],
    delivery_fit: DELIVERY_FIT_SCORES[payload.preferred_delivery_format],
  }
}

export function computeViabilityScore(dimensions: DimensionScores): number {
  const score =
    dimensions.expertise_strength * WEIGHTS.expertise_strength +
    dimensions.audience_clarity * WEIGHTS.audience_clarity +
    dimensions.outcome_strength * WEIGHTS.outcome_strength +
    dimensions.demand_evidence * WEIGHTS.demand_evidence +
    dimensions.content_readiness_score * WEIGHTS.content_readiness_score +
    dimensions.delivery_fit * WEIGHTS.delivery_fit

  return Math.round(score * 10) / 10
}
