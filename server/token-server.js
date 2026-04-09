import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { AccessToken } from 'livekit-server-sdk'

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

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canPublishSources:
      normalizedRole === 'doctor'
        ? ['camera', 'microphone', 'screen_share', 'screen_share_audio']
        : ['camera', 'microphone'],
  })

  const token = await at.toJwt()

  return res.json({ token })
})

app.listen(port, () => {
  console.log(`Token server listening on http://localhost:${port}`)
})
