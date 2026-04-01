import { DimensionScores, computeViabilityScore } from './scoring'

export type RoutingDecision = 'BUILD_NOW' | 'ITERATE' | 'NEEDS_CLARITY' | 'NOT_READY'
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'very_low'
export type ProductShape =
  | 'cohort_program'
  | 'self_paced_course'
  | 'workshop'
  | 'community'
  | 'coaching'
  | 'hybrid'

export function assignRoutingDecision(score: number): RoutingDecision {
  if (score >= 80) return 'BUILD_NOW'
  if (score >= 60) return 'ITERATE'
  if (score >= 40) return 'NEEDS_CLARITY'
  return 'NOT_READY'
}

export function assignConfidenceBand(score: number): ConfidenceBand {
  if (score >= 80) return 'high'
  if (score >= 60) return 'medium'
  if (score >= 40) return 'low'
  return 'very_low'
}

export function recommendProductShape(
  payload: { preferred_delivery_format: string; content_readiness: string },
  dimensions: { expertise_strength: number; outcome_strength: number; audience_clarity: number }
): ProductShape {
  const { preferred_delivery_format, content_readiness } = payload
  const { expertise_strength, outcome_strength, audience_clarity } = dimensions

  if (expertise_strength >= 75 && content_readiness === 'launch_ready') {
    return 'self_paced_course'
  }
  if (expertise_strength >= 75 && outcome_strength >= 75 && audience_clarity >= 75) {
    return 'cohort_program'
  }
  if (preferred_delivery_format === 'workshop' || outcome_strength >= 75) {
    return 'workshop'
  }
  if (preferred_delivery_format === 'coaching') {
    return 'coaching'
  }
  if (expertise_strength < 55 || audience_clarity < 55) {
    return 'hybrid'
  }
  return preferred_delivery_format as ProductShape
}

export function generateNextStep(routing: RoutingDecision, dimensions: any): string {
  const weakest = Object.entries(dimensions)
    .sort(([, a], [, b]) => (a as number) - (b as number))[0][0]

  const nextSteps: Record<RoutingDecision, Record<string, string>> = {
    BUILD_NOW: {
      expertise_strength: 'Begin packaging your expertise into a structured curriculum now.',
      audience_clarity: 'Start building — refine your audience as you go.',
      outcome_strength: 'Launch immediately and sharpen the outcome promise post-launch.',
      demand_evidence: 'Launch now — validate pricing with first cohort.',
      content_readiness_score: 'Build the content structure and launch within 30 days.',
      delivery_fit: 'You are ready to build. Start with your preferred format.',
    },
    ITERATE: {
      expertise_strength: 'Deepen your expertise positioning before building.',
      audience_clarity: 'Narrow your target learner — specificity drives conversion.',
      outcome_strength: 'Sharpen the transformation promise — what exactly changes for the learner?',
      demand_evidence: 'Validate demand with 5-10 target learners before building.',
      content_readiness_score: 'Develop more content before committing to a launch date.',
      delivery_fit: 'Test your format preference with a small pilot before full build.',
    },
    NEEDS_CLARITY: {
      expertise_strength: 'Clarify your core expertise and what makes it credible and unique.',
      audience_clarity: 'Define exactly who this is for — get specific on the learner profile.',
      outcome_strength: 'Define the exact before and after result for your learner.',
      demand_evidence: 'Gather proof of demand — speak to 10 potential learners this week.',
      content_readiness_score: 'Start with an outline before building full content.',
      delivery_fit: 'Clarify your offer structure before deciding on delivery format.',
    },
    NOT_READY: {
      expertise_strength: 'Strengthen your expertise positioning — document your results and track record.',
      audience_clarity: 'Research your target audience before building anything.',
      outcome_strength: 'Identify a clear transformation you can reliably deliver.',
      demand_evidence: 'Find proof of demand before investing in production.',
      content_readiness_score: 'Start documenting your knowledge before building a course.',
      delivery_fit: 'Clarify your offer fundamentals before choosing a delivery format.',
    },
  }

  return nextSteps[routing][weakest] || 'Revisit your inputs and strengthen the weakest dimensions.'
}

export function generateNotes(
  routing: RoutingDecision,
  dimensions: any,
  payload: any
): string[] {
  const notes: string[] = []

  if (dimensions.expertise_strength >= 75) notes.push('Strong expertise signal detected.')
  if (dimensions.expertise_strength < 55) notes.push('Expertise signal needs strengthening.')
  if (dimensions.audience_clarity >= 75) notes.push('Audience definition is clear and specific.')
  if (dimensions.audience_clarity < 55) notes.push('Audience definition is too broad — narrow your learner profile.')
  if (dimensions.outcome_strength >= 75) notes.push('Transformation outcome is compelling.')
  if (dimensions.outcome_strength < 55) notes.push('Outcome promise is weak — sharpen the before/after.')
  if (dimensions.demand_evidence >= 75) notes.push('Strong demand evidence — you have proof.')
  if (dimensions.demand_evidence < 55) notes.push('Demand evidence is weak — validate before building.')
  if (payload.audience_size && payload.audience_size > 1000) notes.push('Audience size is strong for launch.')
  if (payload.prior_teaching_experience) notes.push('Prior teaching experience improves delivery readiness.')

  return notes.slice(0, 4) // Max 4 notes
}
