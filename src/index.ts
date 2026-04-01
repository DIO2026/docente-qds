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
