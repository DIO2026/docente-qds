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
      field_errors: validated.error.issues.map((e: any) => ({
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
