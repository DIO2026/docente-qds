# CC DIRECTIVE — SPRINT 12
**Repos:** `docente-frontend` + `docente-ai-service` + `docente-qds`
**Mission:** Creator Diagnostic (full UX) + Soft Gate + Groq routing architecture
**Gate:** GATE 14 — creator completes diagnostic before platform access, companion and scrub route to Groq

---

## RULES
- SD Design Sequence: Clarity → Flow → Delight → Conviction
- Every question must explain why it is being asked
- No question should make the creator feel inadequate
- Soft gate = diagnostic completion required, not score-gated
- Groq routing is additive — Claude remains for curriculum generation
- Do not break any existing flows

---

## OVERVIEW

Three builds:

1. **Creator Diagnostic** — full UX redesign of `/qualify` following SD design sequence
2. **Soft Gate** — creator must complete diagnostic before accessing program creation
3. **Groq Routing** — companion chat and silent scrub route to Groq/Llama

---

## PART A — `docente-qds` — Creator Diagnostic UX Redesign

### A1 — Update the QDS question architecture

The current 7-step flow needs two additions and one replacement:

**Replace Step 7 (optional enrichment) with six new questions split across two new steps:**

**New Step 7 — Creator Stage + Business Goals:**
- Creator stage: First-time / Established (1-3 products) / Scaling (3+ products) / Migrating from another platform
- Primary business goal in next 90 days: First revenue / Grow existing revenue / Migrate content library / Build audience first

**New Step 8 — Platform Priorities (stack rank):**
Creator ranks these in order of importance:
- Speed to launch
- Content quality
- Distribution reach
- Learner analytics
- Monetization tools
- Ease of use

**Keep existing Step 7 optional fields** (audience size, prior teaching) but move them into Step 6 as optional enrichment within the delivery format step.

### A2 — Add audience sizing to Step 4 (demand evidence)

Replace the free `audience_size` number input with structured ranges:

```typescript
const AUDIENCE_RANGES = [
  { value: 'none', label: 'No audience yet', desc: 'Starting from scratch — building as I go', score: 10 },
  { value: 'micro', label: 'Under 500', desc: 'Small but engaged — newsletter, community, or client base', score: 35 },
  { value: 'small', label: '500 – 2,000', desc: 'Growing audience with some engagement', score: 55 },
  { value: 'medium', label: '2,000 – 10,000', desc: 'Established audience with proven reach', score: 75 },
  { value: 'large', label: '10,000+', desc: 'Large audience with strong distribution', score: 90 },
]
```

Add audience type selector alongside size:

```typescript
const AUDIENCE_TYPES = [
  { value: 'cold', label: 'Cold market only', desc: 'No existing relationship — building from zero' },
  { value: 'social', label: 'Social followers', desc: 'Instagram, LinkedIn, Twitter/X, YouTube' },
  { value: 'email', label: 'Email subscribers', desc: 'Newsletter or mailing list' },
  { value: 'community', label: 'Active community', desc: 'Discord, Slack, Circle, or similar' },
  { value: 'clients', label: 'Existing clients', desc: 'People who have already paid for your work' },
  { value: 'subscribers', label: 'Paid subscribers', desc: 'Substack, Patreon, or membership' },
]
```

Add context label above the audience section:
```
"Your audience directly impacts your launch strategy and 
conversion path. There is no wrong answer here."
```

### A3 — Add Delight micro-insights at Step 4

After the creator selects their demand evidence level — show a contextual micro-insight:

```typescript
const DEMAND_INSIGHTS: Record<string, string> = {
  strong_proof: "Strong demand signal detected. You have validation most creators spend months trying to get.",
  moderate_evidence: "Moderate signal — enough to build with confidence. Your instinct is supported.",
  anecdotal_weak: "Early stage signal. You are exactly where a first diagnostic should catch you.",
  no_proof: "No proof yet — and that is honest. This diagnostic will tell you exactly what to validate first.",
}
```

Display as a subtle highlighted note after the option is selected — before the Next button.

### A4 — Add Why This Matters context to each step

Add a small muted context line below each step subtitle explaining why Docente asks this question:

```typescript
const STEP_CONTEXT: Record<number, string> = {
  1: "Your expertise depth determines which curriculum format and assessment persona Docente applies to your program.",
  2: "Audience specificity is the single highest predictor of course conversion rate.",
  3: "The transformation outcome becomes your course promise — Docente uses it to structure your curriculum.",
  4: "Demand evidence determines your launch path — JIT validation or direct build.",
  5: "Content readiness sets your production timeline and generation sequence.",
  6: "Format fit affects pricing strategy, learner commitment, and completion rates.",
  7: "Your stage and goals personalise your Docente experience from day one.",
  8: "Your priority stack determines which platform features Docente surfaces first for you.",
}
```

Display below the step subtitle in 12px muted grey.

### A5 — Update result screen for Conviction

The result screen must feel earned and specific — not generic.

Replace the current generic routing message with a personalised summary that references their inputs:

```typescript
const generatePersonalisedMessage = (routing: RoutingDecision, payload: any): string => {
  const stage = payload.creator_stage || 'creator'
  const format = payload.preferred_delivery_format?.replace(/_/g, ' ') || 'program'
  
  const messages: Record<RoutingDecision, string> = {
    BUILD_NOW: `Your expertise is validated, your audience is ready, and your idea has demand signal. Build the ${format} now — Docente will structure it for you.`,
    ITERATE: `Strong foundations. Your expertise and outcome are clear. Sharpen your audience definition and validate demand with 5-10 target learners before building.`,
    NEEDS_CLARITY: `You have knowledge worth sharing. Before building, clarify exactly who this is for and what transformation they will experience. Run the diagnostic again with sharper inputs.`,
    NOT_READY: `Not yet — and knowing that now saves you months of wasted effort. Focus on the gap areas below. Docente will be here when you are ready.`,
  }
  return messages[routing]
}
```

### A6 — Add creator_stage and priorities to QDS schema

In src/schemas/qds.ts add to payload:

```typescript
creator_stage: z.enum([
  'first_time',
  'established',
  'scaling', 
  'migrating',
]).optional(),

business_goal: z.enum([
  'first_revenue',
  'grow_revenue',
  'migrate_library',
  'build_audience',
]).optional(),

platform_priorities: z.array(z.string()).optional(),

audience_range: z.enum([
  'none', 'micro', 'small', 'medium', 'large'
]).optional(),

audience_type: z.enum([
  'cold', 'social', 'email', 'community', 'clients', 'subscribers'
]).optional(),
```

### A7 — Update scoring to include audience_range

In src/engine/scoring.ts add audience range scoring:

```typescript
const AUDIENCE_RANGE_SCORES: Record<string, number> = {
  none: 10,
  micro: 35,
  small: 55,
  medium: 75,
  large: 90,
}
```

Replace `audience_size` number scoring with `audience_range` enum scoring in the weighted calculation. Keep weight at 0 (informational only for v1.5 — influences notes not score).

### A8 — Update result notes to reference audience type

In src/engine/routing.ts update generateNotes to include audience context:

```typescript
if (payload.audience_type === 'clients') {
  notes.push('Existing client base is your highest-converting launch audience — offer them first access.')
}
if (payload.audience_type === 'subscribers') {
  notes.push('Paid subscribers signal strong willingness to pay — price your program accordingly.')
}
if (payload.audience_type === 'cold' || payload.audience_range === 'none') {
  notes.push('No existing audience — JIT validation model recommended before full production.')
}
```

### A9 — Restart docente-qds

```bash
npm run dev
```

---

## PART B — `docente-frontend` — Soft Gate

### B1 — Add gate check to app/page.tsx

The ingest form (INGEST state) should check if the creator has completed the QDS diagnostic before allowing program creation.

Add state: `const [gateCleared, setGateCleared] = useState(false)`

On component mount check localStorage:

```typescript
useEffect(() => {
  const cleared = localStorage.getItem('docente_gate_cleared')
  if (cleared === 'true') setGateCleared(true)
}, [])
```

### B2 — Add gate screen to INGEST state

If `!gateCleared` show gate screen instead of the ingest form:

```typescript
if (appState === 'INGEST' && !gateCleared) {
  return (
    <main className="container" style={{ maxWidth: '640px' }}>
      <div className="header">
        <h1>Welcome to Docente</h1>
        <p>The intelligence platform for knowledge creators.</p>
      </div>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '40px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎯</div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px' }}>
          Qualify your idea first
        </h2>
        <p style={{ fontSize: '14px', color: '#666', lineHeight: 1.7, marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
          Docente is built for creators who are serious about 
          monetising their expertise. Complete the 4-minute 
          diagnostic to find out if your idea is ready to build 
          — and to unlock the platform.
        </p>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
          marginBottom: '24px',
        }}>
          {[
            '✓ Instant viability score',
            '✓ Personalised next step',
            '✓ Unlock full platform access',
          ].map((item, i) => (
            <div key={i} style={{ fontSize: '14px', color: '#333', fontWeight: 600 }}>
              {item}
            </div>
          ))}
        </div>
        <a
          href="/qualify"
          style={{
            display: 'inline-block',
            padding: '14px 32px',
            background: '#0066ff',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 700,
            color: 'white',
            textDecoration: 'none',
          }}
        >
          Start Diagnostic →
        </a>
        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => {
              localStorage.setItem('docente_gate_cleared', 'true')
              setGateCleared(true)
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '12px',
              color: '#999',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            I have already completed the diagnostic
          </button>
        </div>
      </div>
    </main>
  )
}
```

### B3 — Set gate cleared on QDS completion

In app/qualify/page.tsx in the handleSubmit function after setting result:

```typescript
// Mark gate as cleared on successful diagnostic completion
localStorage.setItem('docente_gate_cleared', 'true')
localStorage.setItem('docente_qds_routing', data.result.routing_decision)
localStorage.setItem('docente_qds_score', String(data.result.viability_score))
```

### B4 — Update Build Your Program CTA in QDS result

The "Build Your Program →" CTA in the QDS result now passes the creator back to the platform with gate cleared. This already works via localStorage — confirm the link to "/" lands on the ingest form not the gate screen.

### B5 — Add early access flag for BUILD_NOW routing

If routing is BUILD_NOW — show early access badge on result screen:

```typescript
{result.result.routing_decision === 'BUILD_NOW' && (
  <div style={{
    padding: '12px 16px',
    background: '#e8f5e9',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '13px',
    color: '#155724',
    fontWeight: 600,
    textAlign: 'center',
    border: '1px solid #00a651',
  }}>
    ⭐ You qualify for Early Access — priority platform onboarding
  </div>
)}
```

### B6 — Restart frontend

```bash
PORT=3002 npm run dev
```

---

## PART C — `docente-ai-service` — Groq Routing

### C1 — Install Groq SDK

```bash
npm install groq-sdk
```

### C2 — Add GROQ_API_KEY to .env

```
GROQ_API_KEY=your_groq_api_key_here
```

Sign up at https://console.groq.com — free tier includes 14,400 requests/day on Llama 3.1 70B.

### C3 — Create src/lib/router.ts

```typescript
import Anthropic from '@anthropic-ai/sdk'
import Groq from 'groq-sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export type TaskType =
  | 'curriculum_generation'
  | 'assessment'
  | 'competency_map'
  | 'diagnostic_questions'
  | 'companion_chat'
  | 'silent_scrub'
  | 'remaster'

// Tasks that route to Groq (Llama 3.1 70B) — fast, cheap, high volume
const GROQ_TASKS: TaskType[] = ['companion_chat', 'silent_scrub']

// Tasks that always use Claude — precision required
const CLAUDE_TASKS: TaskType[] = [
  'curriculum_generation',
  'assessment',
  'competency_map',
  'diagnostic_questions',
  'remaster',
]

export function getProvider(task: TaskType): 'groq' | 'anthropic' {
  if (GROQ_TASKS.includes(task)) return 'groq'
  return 'anthropic'
}

interface CompletionParams {
  task: TaskType
  system: string
  prompt: string
  maxTokens?: number
  temperature?: number
}

export async function complete(params: CompletionParams): Promise<string> {
  const { task, system, prompt, maxTokens = 1024, temperature = 0 } = params
  const provider = getProvider(task)

  if (provider === 'groq') {
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    })
    return response.choices[0]?.message?.content || ''
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    temperature,
    system,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type')
  return content.text
}
```

### C4 — Update companion endpoint to use router

In src/routes/generate.ts find the companion or chat endpoint.

Replace the direct Anthropic client call with:

```typescript
import { complete } from '../lib/router'

// In companion endpoint:
const rawText = await complete({
  task: 'companion_chat',
  system: COMPANION_SYSTEM_PROMPT,
  prompt: userMessage,
  maxTokens: 512,
  temperature: 0.7,
})
```

### C5 — Add silent scrub endpoint

```typescript
router.post('/scrub', async (req: Request, res: Response) => {
  const { content } = req.body

  if (!content) {
    res.status(400).json({ error: 'content is required' })
    return
  }

  try {
    const rawText = await complete({
      task: 'silent_scrub',
      system: `You are a content editor. Fix mechanical issues only.
Fix: spelling errors, inconsistent capitalisation, duplicate sentences, 
     basic formatting, acronym consistency.
Do NOT change: meaning, structure, voice, or content.
Return ONLY the corrected content — no commentary, no explanation.`,
      prompt: content,
      maxTokens: 4096,
      temperature: 0,
    })

    res.status(200).json({ scrubbed_content: rawText })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
```

### C6 — Add routing metadata to health check

In src/index.ts update the health check response:

```typescript
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'docente-ai-service',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    routing: {
      claude_tasks: ['curriculum_generation', 'assessment', 'competency_map', 'diagnostic_questions', 'remaster'],
      groq_tasks: ['companion_chat', 'silent_scrub'],
    },
  })
})
```

### C7 — Restart and test routing

```bash
npm run dev
```

Test health check shows routing config:
```bash
curl http://localhost:3001/health | python3 -m json.tool
```

Test silent scrub routes to Groq:
```bash
curl -X POST http://localhost:3001/generate/scrub \
  -H "Content-Type: application/json" \
  -d '{
    "content": "this is a test sentance with speling erors and    extra spaces. this is a test sentance with speling erors."
  }'
```

Confirm scrubbed_content returns with fixes applied.

---

## GATE 14 VALIDATION

**Test 1 — Soft gate:**
```
http://localhost:3002
```
Clear localStorage first:
```javascript
// In browser console:
localStorage.removeItem('docente_gate_cleared')
```
Refresh. Confirm gate screen appears — not ingest form.
Click Start Diagnostic — confirm redirects to /qualify.
Complete diagnostic — confirm redirects back and ingest form loads.

**Test 2 — Creator Diagnostic UX:**
```
http://localhost:3002/qualify
```
Confirm:
- Step context line visible on each step
- Audience range selector (not number input) on step 4
- Audience type selector present
- Delight micro-insight appears after demand evidence selection
- Step 7 shows creator stage + business goal
- Step 8 shows priority stack ranking
- Result screen shows personalised message
- BUILD_NOW shows early access badge
- ITERATE shows "Refine Your Idea →" CTA

**Test 3 — Groq routing:**
```bash
curl http://localhost:3001/health | python3 -m json.tool
```
Confirm routing config visible in health check.

```bash
curl -X POST http://localhost:3001/generate/scrub \
  -H "Content-Type: application/json" \
  -d '{"content": "this is a test sentance with speling erors."}'
```
Confirm scrubbed content returns correctly.

**Test 4 — Early access flag:**
Complete diagnostic with all highest options.
Confirm BUILD_NOW routing shows early access badge on result screen.

---

## GATE 14 COMPLETE WHEN

- [ ] Soft gate appears for new creators — clears on diagnostic completion
- [ ] Gate bypass available for returning creators
- [ ] QDS stores routing decision and score in localStorage
- [ ] Creator stage + business goal captured in Step 7
- [ ] Priority stack captured in Step 8
- [ ] Audience range selector replaces number input
- [ ] Audience type selector present
- [ ] Delight micro-insight appears after demand evidence selection
- [ ] Step context lines visible on each step
- [ ] Personalised result message references creator inputs
- [ ] Early access badge shows for BUILD_NOW routing
- [ ] Groq routing active — health check shows routing config
- [ ] Silent scrub endpoint live and routing to Groq
- [ ] All existing flows unbroken

**Report browser flow and curl outputs to DTC.**
