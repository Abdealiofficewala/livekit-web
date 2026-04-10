import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { AccessToken, TrackSource } from 'livekit-server-sdk'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)

const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

if (!apiKey || !apiSecret) {
  throw new Error(
    'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in your environment.',
  )
}

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/getToken', async (req, res) => {
  const { roomName, participantName, role } = req.body
  const normalizedRole = String(role || 'patient').trim().toLowerCase()

  if (!roomName || !participantName) {
    return res.status(400).json({
      error: 'roomName and participantName are required.',
    })
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    ttl: '1h',
    name: participantName,
    metadata: JSON.stringify({ role: normalizedRole }),
  })

  const doctorSources = [
    TrackSource.CAMERA,
    TrackSource.MICROPHONE,
    TrackSource.SCREEN_SHARE,
    TrackSource.SCREEN_SHARE_AUDIO,
  ]
  const patientSources = [TrackSource.CAMERA, TrackSource.MICROPHONE]

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublishData: true,
    // SDK requires TrackSource enums, not strings (strings throw in toJwt).
    canPublishSources:
      normalizedRole === 'doctor' ? doctorSources : patientSources,
  })

  const token = await at.toJwt()

  return res.json({ token })
})

app.listen(port, () => {
  console.log(`Token server listening on http://localhost:${port}`)
})
