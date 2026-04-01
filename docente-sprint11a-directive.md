# CC DIRECTIVE — SPRINT 11A (QDS v1.5)
**New Repo:** `docente-qds`
**Also touches:** `docente-frontend` + `docente-analytics`
**Mission:** Qualified Diagnostic System v1.5 — deterministic creator offer viability scoring
**Gate:** GATE 12 — creator completes 7-step diagnostic, receives viability score + routing decision + next step

---

## RULES
- Scoring is fully deterministic — no AI calls in scoring engine
- Same input always returns same output
- UI layer contains zero scoring logic
- Scoring engine is isolated from API transport layer
- Signal capture is required — not optional
- Do not touch learner flow
- Do not touch existing DO curriculum generation

---

## OVERVIEW

QDS answers one question for creators:

> "Should this expertise / offer / idea become a monetizable learning product, and what is the recommended next direction?"

**Four routing outcomes:**
- BUILD_NOW (80-100)
- ITERATE (60-79)
- NEEDS_CLARITY (40-59)
- NOT_READY (0-39)

**Six scoring dimensions:**
- expertise_strength (weight: 0.20)
- audience_clarity (weight: 0.20)
- outcome_strength (weight: 0.20)
- demand_evidence (weight: 0.20)
- content_readiness (weight: 0.10)
- delivery_fit (weight: 0.10)

---

## PART A — `docente-qds` (NEW REPO)

### A1 — Clone and initialize

```bash
cd ~ && git clone https://github.com/DIO2026/docente-qds.git
cd docente-qds
npm init -y
npm install express zod dotenv cors uuid
npm install -D typescript @types/express @types/node @types/uuid ts-node nodemon rimraf
npx tsc --init
```

### A2 — Replace tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### A3 — Replace scripts in package.json

```json
"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "rimraf dist && tsc",
  "start": "node dist/index.js"
}
```

### A4 — Create .env

```
PORT=3005
ANALYTICS_SERVICE_URL=http://localhost:3003
```

### A5 — Create .gitignore

```
node_modules/
dist/
.env
```

### A6 — Create src/schemas/qds.ts

```typescript
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
```

### A7 — Create src/engine/scoring.ts

```typescript
import { QDSSubmission } from '../schemas/qds'

interface DimensionScores {
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
```

### A8 — Create src/engine/routing.ts

```typescript
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
```

### A9 — Create src/routes/qds.ts

```typescript
import { Router, Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import axios from 'axios'
import { QDSSubmissionSchema } from '../schemas/qds'
import { scoreDimensions, computeViabilityScore } from '../engine/scoring'
import {
  assignRoutingDecision,
  assignConfidenceBand,
  recommendProductShape,
  generateNextStep,
  generateNotes,
} from '../engine/routing'

const router = Router()

router.post('/submit', async (req: Request, res: Response) => {
  // Validate schema
  const validated = QDSSubmissionSchema.safeParse(req.body)
  if (!validated.success) {
    res.status(422).json({
      status: 'error',
      error_code: 'VALIDATION_ERROR',
      message: 'One or more required fields are missing or invalid.',
      field_errors: validated.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
      meta: { schema_version: 'do_qds_v1.5' },
    })
    return
  }

  const { payload, submission_id } = validated.data
  const processed_at = new Date().toISOString()

  try {
    // Score dimensions
    const dimensions = scoreDimensions(payload)
    const viability_score = computeViabilityScore(dimensions)
    const routing_decision = assignRoutingDecision(viability_score)
    const confidence_band = assignConfidenceBand(viability_score)
    const recommended_product_shape = recommendProductShape(payload, dimensions)
    const next_step = generateNextStep(routing_decision, dimensions)
    const notes = generateNotes(routing_decision, dimensions, payload)
    const route_reason = `Score: ${viability_score}/100. Weakest dimension drives next step guidance.`

    // Capture signal to analytics
    try {
      await axios.post(`${process.env.ANALYTICS_SERVICE_URL}/events`, {
        event_type: 'qds_submitted',
        payload: {
          submission_id,
          viability_score,
          routing_decision,
          confidence_band,
          recommended_product_shape,
        },
      })
    } catch {
      // Fire and forget — never block on analytics
    }

    res.status(200).json({
      status: 'success',
      version: 'do_qds_v1.5',
      submission_id,
      processed_at,
      result: {
        viability_score,
        confidence_band,
        routing_decision,
        next_step,
        recommended_product_shape,
        notes,
      },
      diagnostics: {
        dimension_scores: dimensions,
        route_reason,
      },
      meta: {
        deterministic: true,
        schema_version: 'do_qds_v1.5',
        scoring_model_version: 'do_qds_v1.5',
        response_object_version: 'do_qds_v1.5',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({
      status: 'error',
      error_code: 'PROCESSING_FAILURE',
      message: 'The submission could not be processed.',
      meta: { schema_version: 'do_qds_v1.5' },
    })
  }
})

export default router
```

### A10 — Create src/index.ts

```typescript
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import qdsRouter from './routes/qds'

dotenv.config()

const app = express()
const PORT = parseInt(process.env.PORT || '3005', 10)

const allowedOrigins = [
  'http://localhost:3002',
  process.env.FRONTEND_URL || '',
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true)
    else callback(new Error('Not allowed by CORS'))
  },
}))

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'docente-qds',
    version: 'do_qds_v1.5',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  })
})

app.use('/api/v1/do-qds', qdsRouter)

app.listen(PORT, () => {
  console.log(`docente-qds running on port ${PORT}`)
})
```

### A11 — Test the service

```bash
npm run dev
```

Health check:
```bash
curl http://localhost:3005/health
```

Full submission test:
```bash
curl -X POST http://localhost:3005/api/v1/do-qds/submit \
  -H "Content-Type: application/json" \
  -d '{
    "version": "do_qds_v1.5",
    "submission_id": "550e8400-e29b-41d4-a716-446655440000",
    "submitted_at": "2026-03-31T12:00:00Z",
    "payload": {
      "expertise_domain": "Paid media strategy for DTC brands",
      "target_audience": "Independent consultants who want to productize their expertise",
      "offer_or_idea": "A program that teaches consultants how to package a repeatable service",
      "transformation_outcome": "Students go from inconsistent custom work to a structured premium offer",
      "proof_of_demand": "12 people responded positively to a waitlist post",
      "expertise_strength": "clear_validated",
      "audience_clarity": "clear_moderate",
      "outcome_strength": "meaningful_outcome",
      "demand_evidence": "moderate_evidence",
      "content_readiness": "partial_materials",
      "preferred_delivery_format": "cohort_program",
      "audience_size": 1200,
      "prior_teaching_experience": true
    }
  }'
```

Expected: `routing_decision: "ITERATE"`, `viability_score: ~72`

---

## PART B — `docente-frontend`

### B1 — Add QDS types to types/docente.ts

Append:

```typescript
export type RoutingDecision = 'BUILD_NOW' | 'ITERATE' | 'NEEDS_CLARITY' | 'NOT_READY'
export type ConfidenceBand = 'high' | 'medium' | 'low' | 'very_low'

export interface QDSResult {
  viability_score: number
  confidence_band: ConfidenceBand
  routing_decision: RoutingDecision
  next_step: string
  recommended_product_shape: string
  notes: string[]
}

export interface QDSDiagnostics {
  dimension_scores: {
    expertise_strength: number
    audience_clarity: number
    outcome_strength: number
    demand_evidence: number
    content_readiness_score: number
    delivery_fit: number
  }
  route_reason: string
}

export interface QDSResponse {
  status: string
  version: string
  submission_id: string
  processed_at: string
  result: QDSResult
  diagnostics: QDSDiagnostics
}
```

### B2 — Create app/qualify/page.tsx

```typescript
'use client'

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { QDSResponse, RoutingDecision } from '../../types/docente'

type QDSStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 'result'

interface QDSPayload {
  expertise_domain: string
  expertise_strength: string
  target_audience: string
  audience_clarity: string
  offer_or_idea: string
  transformation_outcome: string
  outcome_strength: string
  proof_of_demand: string
  demand_evidence: string
  content_readiness: string
  preferred_delivery_format: string
  audience_size?: number
  prior_teaching_experience?: boolean
}

const ROUTING_CONFIG: Record<RoutingDecision, {
  label: string
  color: string
  bg: string
  border: string
  icon: string
}> = {
  BUILD_NOW: { label: 'Build Now', color: '#155724', bg: '#d4edda', border: '#00a651', icon: '🚀' },
  ITERATE: { label: 'Iterate First', color: '#856404', bg: '#fff3cd', border: '#f59e0b', icon: '🔄' },
  NEEDS_CLARITY: { label: 'Needs Clarity', color: '#0c5460', bg: '#d1ecf1', border: '#0066ff', icon: '🔍' },
  NOT_READY: { label: 'Not Ready Yet', color: '#721c24', bg: '#f8d7da', border: '#cc0000', icon: '⚠️' },
}

export default function QualifyPage() {
  const [step, setStep] = useState<QDSStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<QDSResponse | null>(null)
  const [payload, setPayload] = useState<Partial<QDSPayload>>({})

  const updatePayload = (updates: Partial<QDSPayload>) => {
    setPayload((prev) => ({ ...prev, ...updates }))
  }

  const totalSteps = 7
  const currentStep = step === 'result' ? totalSteps : (step as number)
  const progress = (currentStep / totalSteps) * 100

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_QDS_URL}/api/v1/do-qds/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: 'do_qds_v1.5',
            submission_id: uuidv4(),
            submitted_at: new Date().toISOString(),
            payload,
          }),
        }
      )
      if (!res.ok) throw new Error('Submission failed')
      const data = await res.json()
      setResult(data)
      setStep('result')
    } catch (err) {
      setError('Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const SelectOption = ({
    value, label, desc, selected, onClick
  }: { value: string; label: string; desc?: string; selected: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '14px 16px',
        marginBottom: '8px',
        borderRadius: '8px',
        border: `2px solid ${selected ? '#0066ff' : '#eee'}`,
        background: selected ? '#e8f0ff' : 'white',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: 700, color: selected ? '#0066ff' : '#333' }}>
        {selected ? '● ' : '○ '}{label}
      </div>
      {desc && (
        <div style={{ fontSize: '12px', color: '#999', marginTop: '3px' }}>{desc}</div>
      )}
    </button>
  )

  const StepHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>
        Step {currentStep} of {totalSteps}
      </div>
      <div style={{ height: '4px', background: '#eee', borderRadius: '2px', marginBottom: '20px' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: '#0066ff', borderRadius: '2px', transition: 'width 0.3s ease' }} />
      </div>
      <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1a1a1a', marginBottom: '6px' }}>{title}</h2>
      <p style={{ fontSize: '14px', color: '#666' }}>{subtitle}</p>
    </div>
  )

  const NavButtons = ({
    onNext, nextDisabled, isLast
  }: { onNext: () => void; nextDisabled: boolean; isLast?: boolean }) => (
    <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
      {currentStep > 1 && (
        <button
          onClick={() => setStep((s) => (typeof s === 'number' ? (s - 1) as QDSStep : s))}
          className="btn-secondary"
        >
          Back
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled || loading}
        className="btn-primary"
      >
        {isLast ? (loading ? 'Analysing...' : 'Get My Results') : 'Continue →'}
      </button>
    </div>
  )

  return (
    <main className="container" style={{ maxWidth: '640px' }}>
      {step !== 'result' && (
        <div className="header">
          <h1>Program Viability Diagnostic</h1>
          <p>7 questions · 3 minutes · Instant result</p>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', padding: '32px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

        {/* STEP 1 — Expertise Domain + Strength */}
        {step === 1 && (
          <>
            <StepHeader
              title="What are you deeply knowledgeable in?"
              subtitle="Describe your core expertise area."
            />
            <div className="form-group">
              <textarea
                placeholder="e.g. Paid media strategy for DTC brands, Leadership coaching for first-time managers..."
                value={payload.expertise_domain || ''}
                onChange={(e) => updatePayload({ expertise_domain: e.target.value })}
                style={{ minHeight: '100px', width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                How would you describe this expertise?
              </label>
              {[
                { value: 'highly_specific', label: 'Highly specific and credible', desc: 'Deep domain expert with proven, differentiated results' },
                { value: 'clear_validated', label: 'Clear and validated', desc: 'Strong expertise, moderately validated by results' },
                { value: 'broad_general', label: 'Broad or general', desc: 'Good knowledge but less differentiated' },
                { value: 'vague_weak', label: 'Still developing', desc: 'Expertise needs more depth or specificity' },
              ].map((opt) => (
                <SelectOption
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  desc={opt.desc}
                  selected={payload.expertise_strength === opt.value}
                  onClick={() => updatePayload({ expertise_strength: opt.value })}
                />
              ))}
            </div>
            <NavButtons
              onNext={() => setStep(2)}
              nextDisabled={!payload.expertise_domain?.trim() || !payload.expertise_strength}
            />
          </>
        )}

        {/* STEP 2 — Target Audience + Clarity */}
        {step === 2 && (
          <>
            <StepHeader
              title="Who is this program for?"
              subtitle="Describe your ideal learner."
            />
            <div className="form-group">
              <textarea
                placeholder="e.g. Independent consultants who want to productize their expertise..."
                value={payload.target_audience || ''}
                onChange={(e) => updatePayload({ target_audience: e.target.value })}
                style={{ minHeight: '80px', width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                How clearly defined is your audience?
              </label>
              {[
                { value: 'narrow_specific', label: 'Narrow and specific', desc: 'I can describe them in one precise sentence' },
                { value: 'clear_moderate', label: 'Clear but moderate', desc: 'Good category, some ambiguity on specifics' },
                { value: 'broad_ambiguous', label: 'Broad or ambiguous', desc: 'General audience, not tightly defined' },
                { value: 'vague_undefined', label: 'Vague or undefined', desc: 'Still figuring out who this is for' },
              ].map((opt) => (
                <SelectOption
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  desc={opt.desc}
                  selected={payload.audience_clarity === opt.value}
                  onClick={() => updatePayload({ audience_clarity: opt.value })}
                />
              ))}
            </div>
            <NavButtons
              onNext={() => setStep(3)}
              nextDisabled={!payload.target_audience?.trim() || !payload.audience_clarity}
            />
          </>
        )}

        {/* STEP 3 — Offer + Outcome Strength */}
        {step === 3 && (
          <>
            <StepHeader
              title="What outcome will learners achieve?"
              subtitle="Describe the transformation — the before and after."
            />
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Your offer or program idea</label>
              <textarea
                placeholder="e.g. A cohort program that teaches consultants how to package a repeatable service..."
                value={payload.offer_or_idea || ''}
                onChange={(e) => updatePayload({ offer_or_idea: e.target.value })}
                style={{ minHeight: '80px', width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>The transformation outcome</label>
              <textarea
                placeholder="e.g. Students go from inconsistent custom work to a structured premium offer..."
                value={payload.transformation_outcome || ''}
                onChange={(e) => updatePayload({ transformation_outcome: e.target.value })}
                style={{ minHeight: '80px', width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginTop: '8px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                How strong is the transformation promise?
              </label>
              {[
                { value: 'concrete_transformation', label: 'Concrete and compelling', desc: 'Clear, specific, measurable outcome learners can visualise' },
                { value: 'meaningful_outcome', label: 'Meaningful but not sharp', desc: 'Real value but the framing could be stronger' },
                { value: 'generic_benefit', label: 'Generic benefit', desc: 'Broadly positive but not specific enough' },
                { value: 'unclear_value', label: 'Unclear value', desc: 'Still working out what the outcome actually is' },
              ].map((opt) => (
                <SelectOption
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  desc={opt.desc}
                  selected={payload.outcome_strength === opt.value}
                  onClick={() => updatePayload({ outcome_strength: opt.value })}
                />
              ))}
            </div>
            <NavButtons
              onNext={() => setStep(4)}
              nextDisabled={!payload.offer_or_idea?.trim() || !payload.transformation_outcome?.trim() || !payload.outcome_strength}
            />
          </>
        )}

        {/* STEP 4 — Demand Evidence */}
        {step === 4 && (
          <>
            <StepHeader
              title="What evidence suggests people want this?"
              subtitle="Describe any signals of demand you have seen."
            />
            <div className="form-group">
              <textarea
                placeholder="e.g. 12 people responded positively to a waitlist post, 3 clients have asked me to teach this..."
                value={payload.proof_of_demand || ''}
                onChange={(e) => updatePayload({ proof_of_demand: e.target.value })}
                style={{ minHeight: '100px', width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', outline: 'none', resize: 'vertical' }}
              />
            </div>
            <div style={{ marginTop: '20px' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                How strong is your demand evidence?
              </label>
              {[
                { value: 'strong_proof', label: 'Strong proof', desc: 'Buyers, waitlist sign-ups, repeated asks, or prior sales' },
                { value: 'moderate_evidence', label: 'Moderate evidence', desc: 'Audience engagement, interest expressed, light proof' },
                { value: 'anecdotal_weak', label: 'Anecdotal or weak', desc: 'A few conversations or gut feel' },
                { value: 'no_proof', label: 'No proof yet', desc: 'Assuming demand but have not validated' },
              ].map((opt) => (
                <SelectOption
                  key={opt.value}
                  value={opt.value}
                  label={opt.label}
                  desc={opt.desc}
                  selected={payload.demand_evidence === opt.value}
                  onClick={() => updatePayload({ demand_evidence: opt.value })}
                />
              ))}
            </div>
            <NavButtons
              onNext={() => setStep(5)}
              nextDisabled={!payload.proof_of_demand?.trim() || !payload.demand_evidence}
            />
          </>
        )}

        {/* STEP 5 — Content Readiness */}
        {step === 5 && (
          <>
            <StepHeader
              title="How much of the content already exists?"
              subtitle="Select the option that best describes your current state."
            />
            {[
              { value: 'launch_ready', label: 'Launch ready', desc: 'Content is complete and ready to package' },
              { value: 'substantial_materials', label: 'Substantial materials', desc: 'Most content exists, needs structuring' },
              { value: 'partial_materials', label: 'Partial materials', desc: 'Some content exists, more needed' },
              { value: 'outline_only', label: 'Outline only', desc: 'Structure exists but content needs to be created' },
              { value: 'none', label: 'Starting from scratch', desc: 'No content exists yet' },
            ].map((opt) => (
              <SelectOption
                key={opt.value}
                value={opt.value}
                label={opt.label}
                desc={opt.desc}
                selected={payload.content_readiness === opt.value}
                onClick={() => updatePayload({ content_readiness: opt.value })}
              />
            ))}
            <NavButtons
              onNext={() => setStep(6)}
              nextDisabled={!payload.content_readiness}
            />
          </>
        )}

        {/* STEP 6 — Delivery Format */}
        {step === 6 && (
          <>
            <StepHeader
              title="How do you want to deliver this?"
              subtitle="Choose the format that feels most natural for your expertise."
            />
            {[
              { value: 'cohort_program', label: 'Cohort program', desc: 'Group learning with a defined start/end date' },
              { value: 'self_paced_course', label: 'Self-paced course', desc: 'Learners progress at their own pace' },
              { value: 'workshop', label: 'Workshop', desc: 'Intensive single or multi-day live session' },
              { value: 'coaching', label: '1:1 Coaching program', desc: 'Individual sessions with structured curriculum' },
              { value: 'community', label: 'Community + curriculum', desc: 'Ongoing membership with learning content' },
              { value: 'hybrid', label: 'Hybrid', desc: 'Combination of formats' },
            ].map((opt) => (
              <SelectOption
                key={opt.value}
                value={opt.value}
                label={opt.label}
                desc={opt.desc}
                selected={payload.preferred_delivery_format === opt.value}
                onClick={() => updatePayload({ preferred_delivery_format: opt.value })}
              />
            ))}
            <NavButtons
              onNext={() => setStep(7)}
              nextDisabled={!payload.preferred_delivery_format}
            />
          </>
        )}

        {/* STEP 7 — Optional enrichment + submit */}
        {step === 7 && (
          <>
            <StepHeader
              title="Two final questions"
              subtitle="Optional — helps us give you more precise guidance."
            />
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                Approximate audience size <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="number"
                placeholder="e.g. 1200"
                value={payload.audience_size || ''}
                onChange={(e) => updatePayload({ audience_size: parseInt(e.target.value) || undefined })}
                style={{ width: '100%', padding: '12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '14px', fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
            <div className="form-group">
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                Have you taught or coached before? <span style={{ color: '#999', fontWeight: 400 }}>(optional)</span>
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {[{ v: true, l: 'Yes' }, { v: false, l: 'No' }].map(({ v, l }) => (
                  <button
                    key={l}
                    onClick={() => updatePayload({ prior_teaching_experience: v })}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${payload.prior_teaching_experience === v ? '#0066ff' : '#eee'}`,
                      background: payload.prior_teaching_experience === v ? '#e8f0ff' : 'white',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: payload.prior_teaching_experience === v ? '#0066ff' : '#333',
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <NavButtons
              onNext={handleSubmit}
              nextDisabled={loading}
              isLast
            />
          </>
        )}

        {/* RESULT SCREEN */}
        {step === 'result' && result && (() => {
          const routing = result.result.routing_decision
          const config = ROUTING_CONFIG[routing]
          const score = result.result.viability_score

          return (
            <>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>{config.icon}</div>
                <div style={{
                  display: 'inline-block',
                  padding: '8px 20px',
                  borderRadius: '20px',
                  background: config.bg,
                  color: config.color,
                  fontSize: '16px',
                  fontWeight: 800,
                  marginBottom: '12px',
                }}>
                  {config.label}
                </div>
                <div style={{ fontSize: '48px', fontWeight: 900, color: '#1a1a1a', lineHeight: 1 }}>
                  {score}
                </div>
                <div style={{ fontSize: '14px', color: '#999' }}>Viability Score / 100</div>
              </div>

              <div style={{
                padding: '16px',
                background: config.bg,
                borderLeft: `4px solid ${config.border}`,
                borderRadius: '8px',
                marginBottom: '20px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: config.color, marginBottom: '6px' }}>
                  Recommended Next Step
                </div>
                <div style={{ fontSize: '15px', color: '#1a1a1a', lineHeight: 1.5 }}>
                  {result.result.next_step}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', marginBottom: '12px' }}>
                  Recommended Format
                </div>
                <div style={{
                  padding: '12px 16px',
                  background: '#f8f9fa',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#333',
                  textTransform: 'capitalize',
                }}>
                  {result.result.recommended_product_shape.replace(/_/g, ' ')}
                </div>
              </div>

              {result.result.notes.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', marginBottom: '12px' }}>
                    Diagnostic Notes
                  </div>
                  {result.result.notes.map((note, i) => (
                    <div key={i} style={{
                      padding: '8px 12px',
                      marginBottom: '6px',
                      background: '#f8f9fa',
                      borderRadius: '4px',
                      fontSize: '13px',
                      color: '#333',
                    }}>
                      → {note}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                {(routing === 'BUILD_NOW' || routing === 'ITERATE') && (
                  <a href="/" style={{
                    flex: 1,
                    display: 'block',
                    padding: '14px',
                    background: '#0066ff',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'white',
                    textDecoration: 'none',
                    textAlign: 'center',
                  }}>
                    Build Your Program →
                  </a>
                )}
                <button
                  onClick={() => { setStep(1); setPayload({}); setResult(null) }}
                  className="btn-secondary"
                  style={{ flex: routing === 'BUILD_NOW' || routing === 'ITERATE' ? '0 0 auto' : 1 }}
                >
                  Start Over
                </button>
              </div>
            </>
          )
        })()}
      </div>
    </main>
  )
}
```

### B3 — Add QDS env var to .env.local

```
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_ANALYTICS_URL=http://localhost:3003
NEXT_PUBLIC_COMPANION_URL=http://localhost:3004
NEXT_PUBLIC_QDS_URL=http://localhost:3005
```

### B4 — Add QDS link to persistent navigation in app/layout.tsx

Find the nav links and add:

```typescript
<Link href="/qualify" style={{
  padding: '7px 16px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#333',
  textDecoration: 'none',
  background: '#f5f5f5',
}}>
  Qualify My Idea
</Link>
```

### B5 — Install uuid in frontend

```bash
npm install uuid
npm install -D @types/uuid
```

### B6 — Restart frontend

```bash
PORT=3002 npm run dev
```

---

## PART C — Add docente-qds to pm2 ecosystem

Add to ~/docente-build/docente-ecosystem.config.js:

```javascript
{
  name: 'docente-qds',
  cwd: '/Users/Jason/docente-build/docente-qds',
  script: 'src/index.ts',
  interpreter: '/Users/Jason/docente-build/docente-qds/node_modules/.bin/ts-node',
  env: {
    PORT: '3005',
    NODE_ENV: 'development',
    ANALYTICS_SERVICE_URL: 'http://localhost:3003',
  },
  watch: false,
  autorestart: true,
},
```

---

## GATE 12 VALIDATION

**Test 1 — Deterministic scoring:**
```bash
# Run same payload twice — must return identical result
curl -X POST http://localhost:3005/api/v1/do-qds/submit \
  -H "Content-Type: application/json" \
  -d '{
    "version": "do_qds_v1.5",
    "submission_id": "550e8400-e29b-41d4-a716-446655440000",
    "submitted_at": "2026-03-31T12:00:00Z",
    "payload": {
      "expertise_domain": "Test",
      "target_audience": "Test audience",
      "offer_or_idea": "Test offer",
      "transformation_outcome": "Test outcome",
      "proof_of_demand": "Test demand",
      "expertise_strength": "highly_specific",
      "audience_clarity": "narrow_specific",
      "outcome_strength": "concrete_transformation",
      "demand_evidence": "strong_proof",
      "content_readiness": "substantial_materials",
      "preferred_delivery_format": "cohort_program"
    }
  }'
```
Expected: `routing_decision: "BUILD_NOW"`, score ~90. Run twice — identical output.

**Test 2 — All four routing states:**
- expertise_strength: highly_specific + all others high → BUILD_NOW
- expertise_strength: clear_validated + mixed → ITERATE
- expertise_strength: broad_general + weak demand → NEEDS_CLARITY
- All weak → NOT_READY

**Test 3 — Browser flow:**
1. Open `http://localhost:3002/qualify`
2. Complete all 7 steps
3. Confirm result screen shows score, routing, next step, notes
4. If BUILD_NOW or ITERATE — confirm Build Your Program button links to `/`

**Test 4 — Analytics capture:**
```bash
curl http://localhost:3003/events | python3 -c "
import sys, json
events = json.load(sys.stdin)
qds = [e for e in events if e.get('event_type') == 'qds_submitted']
print(f'QDS submissions captured: {len(qds)}')
"
```

---

## GATE 12 COMPLETE WHEN

- [ ] `docente-qds` running on port 3005
- [ ] GET /health returns ok with version do_qds_v1.5
- [ ] POST /submit returns correct routing for all four states
- [ ] Same input returns identical output (deterministic confirmed)
- [ ] All 7 steps render correctly in browser
- [ ] Progress bar advances correctly
- [ ] Back navigation works across all steps
- [ ] Result screen shows score + routing + next step + notes
- [ ] BUILD_NOW/ITERATE shows Build Your Program CTA
- [ ] QDS events captured in docente-analytics
- [ ] Qualify My Idea link visible in nav bar

**Report curl outputs and browser flow to DTC.**
