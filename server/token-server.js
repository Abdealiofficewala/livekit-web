import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'

dotenv.config()

const app = express()
const port = Number(process.env.PORT || 3001)

const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET

/** HTTPS API base for Room Service (same project as wss:// in VITE_LIVEKIT_URL). */
function getLivekitHttpUrl() {
  const explicit = process.env.LIVEKIT_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  const ws = process.env.VITE_LIVEKIT_URL?.trim()
  if (ws?.startsWith('wss://')) {
    return ws.replace(/^wss:\/\//, 'https://').replace(/\/$/, '')
  }
  if (ws?.startsWith('https://')) return ws.replace(/\/$/, '')
  return ''
}

const livekitHttpUrl = getLivekitHttpUrl()

if (!apiKey || !apiSecret) {
  throw new Error(
    'LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set in your environment.',
  )
}

if (!livekitHttpUrl) {
  throw new Error(
    'Set LIVEKIT_URL (https://...) or VITE_LIVEKIT_URL (wss://...) so the server can call LiveKit Room API.',
  )
}

const roomService = new RoomServiceClient(livekitHttpUrl, apiKey, apiSecret)

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

/**
 * Host (doctor) ends the meeting for everyone by deleting the LiveKit room.
 * All participants are disconnected by the server.
 */
app.post('/endRoom', async (req, res) => {
  const { roomName, role } = req.body
  const normalizedRole = String(role || '').trim().toLowerCase()

  if (normalizedRole !== 'doctor') {
    return res.status(403).json({
      error: 'Only the host can end the meeting for everyone.',
    })
  }

  if (!roomName || !String(roomName).trim()) {
    return res.status(400).json({ error: 'roomName is required.' })
  }

  const name = String(roomName).trim()

  try {
    await roomService.deleteRoom(name)
    return res.json({ ok: true })
  } catch (err) {
    console.error('[endRoom]', err)
    return res.status(500).json({
      error: err?.message || 'Failed to end room.',
    })
  }
})

app.listen(port, () => {
  console.log(`Token server listening on http://localhost:${port}`)
})
