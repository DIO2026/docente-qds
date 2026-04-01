import { z } from 'zod'

// Enum definitions
export const ContentReadinessEnum = z.enum([
  'none',
  'outline_only',
  'partial_materials',
  'substantial_materials',
  'launch_ready',
])

export const DeliveryFormatEnum = z.enum([
  'cohort_program',
  'self_paced_course',
  'workshop',
  'community',
  'coaching',
  'hybrid',
])

export const ExpertiseStrengthEnum = z.enum([
  'highly_specific',    // 90
  'clear_validated',    // 75
  'broad_general',      // 55
  'vague_weak',         // 25
])

export const AudienceClarityEnum = z.enum([
  'narrow_specific',    // 90
  'clear_moderate',     // 75
  'broad_ambiguous',    // 55
  'vague_undefined',    // 25
])

export const OutcomeStrengthEnum = z.enum([
  'concrete_transformation',  // 90
  'meaningful_outcome',       // 75
  'generic_benefit',          // 55
  'unclear_value',            // 25
])

export const DemandEvidenceEnum = z.enum([
  'strong_proof',       // 90 — buyers, waitlist, repeated asks
  'moderate_evidence',  // 70 — engagement, audience interest
  'anecdotal_weak',     // 50 — light proof
  'no_proof',           // 20 — nothing yet
])

export const QDSSubmissionSchema = z.object({
  version: z.literal('do_qds_v1.5'),
  submission_id: z.string().uuid(),
  submitted_at: z.string(),
  payload: z.object({
    // Scored dimensions — structured options
    expertise_strength: ExpertiseStrengthEnum,
    audience_clarity: AudienceClarityEnum,
    outcome_strength: OutcomeStrengthEnum,
    demand_evidence: DemandEvidenceEnum,
    content_readiness: ContentReadinessEnum,
    preferred_delivery_format: DeliveryFormatEnum,

    // Context fields — not scored, used for result notes
    expertise_domain: z.string().min(3).max(500),
    target_audience: z.string().min(3).max(500),
    offer_or_idea: z.string().min(3).max(1000),
    transformation_outcome: z.string().min(3).max(500),
    proof_of_demand: z.string().min(3).max(500),

    // Optional enrichment
    audience_size: z.number().optional(),
    prior_teaching_experience: z.boolean().optional(),
    monetization_goal: z.string().max(500).optional(),
  }),
})

export type QDSSubmission = z.infer<typeof QDSSubmissionSchema>
