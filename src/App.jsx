import { useEffect, useMemo, useState } from 'react'
import {
  Chat,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react'
import '@livekit/components-styles'
import { Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import './App.css'

const SERVER_URL =
  import.meta.env.VITE_LIVEKIT_URL || 'wss://your-livekit-url.livekit.cloud'
const TOKEN_ENDPOINT =
  import.meta.env.VITE_TOKEN_ENDPOINT || 'http://localhost:3001/getToken'

async function requestToken({ roomName, participantName, role }) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, participantName, role }),
  })

  if (!response.ok) {
    throw new Error('Unable to get a LiveKit token from backend.')
  }

  const data = await response.json()
  if (!data?.token) {
    throw new Error('Token endpoint response does not include token.')
  }

  return data.token
}

function randomLetters(count) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let out = ''
  for (let i = 0; i < count; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function randomLettersLower(count) {
  return randomLetters(count).toLowerCase()
}

function randomDigits(count) {
  let out = ''
  for (let i = 0; i < count; i += 1) {
    out += String(Math.floor(Math.random() * 10))
  }
  return out
}

function generateRoomName() {
  return `${randomLettersLower(3)}-${randomDigits(3)}-${randomLettersLower(3)}`
}

function normalizeRole(role) {
  return role.trim().toLowerCase()
}

function JoinPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    participantName: '',
    roomName: generateRoomName(),
    role: 'doctor',
  }))
  const [error, setError] = useState('')

  const canJoin = useMemo(() => {
    return form.participantName.trim() && form.role.trim()
  }, [form.participantName, form.role])

  const handleChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
  }

  const handleRoleChange = (event) => {
    const nextRole = event.target.value
    setForm((prev) => {
      const next = { ...prev, role: nextRole }

      if (normalizeRole(nextRole) === 'patient') {
        next.roomName = ''
        return next
      }

      if (normalizeRole(nextRole) === 'doctor' && !next.roomName.trim()) {
        next.roomName = generateRoomName()
      }

      return next
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    setError('')

    try {
      const participantName = form.participantName.trim()
      const role = normalizeRole(form.role)
      const roomName = form.roomName.trim() ? form.roomName.trim() : generateRoomName()

      // persist name for refresh/back navigation
      sessionStorage.setItem('participantName', participantName)

      const path = `/${encodeURIComponent(role)}/${encodeURIComponent(roomName)}`
      navigate(`${path}?name=${encodeURIComponent(participantName)}`, { replace: false })
    } catch (submitError) {
      setError(submitError?.message || 'Failed to submit form.')
    }
  }

  return (
    <main className="join-page">
      <section className="join-card">
        <h1>LiveKit Meet</h1>
        <p>Enter your name, optional room name, and a role to continue.</p>

        <form onSubmit={handleSubmit} className="join-form">
          <label>
            Name
            <input
              value={form.participantName}
              onChange={handleChange('participantName')}
              placeholder="Your name"
              required
            />
          </label>

          <label>
            Role
            <select value={form.role} onChange={handleRoleChange} required>
              <option value="doctor">Doctor</option>
              <option value="patient">Patient</option>
            </select>
          </label>

          <label>
            Room Name
            <input
              value={form.roomName}
              onChange={handleChange('roomName')}
              placeholder="ABC-123-XYZ"
            />
          </label>

          <button type="submit" disabled={!canJoin}>
            {normalizeRole(form.role) === 'doctor' ? 'Host' : 'Join'}
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}

function RoomPage() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()

  const role = params?.role || ''
  const roomName = params?.roomName || ''

  const participantName =
    (searchParams.get('name') || '').trim() ||
    (sessionStorage.getItem('participantName') || '').trim()

  const [token, setToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!participantName || !roomName || !role) return

      setError('')
      setIsLoading(true)
      try {
        const roomToken = await requestToken({
          roomName: roomName.trim(),
          participantName,
          role,
        })
        if (!cancelled) setToken(roomToken)
      } catch (joinError) {
        if (!cancelled) setError(joinError?.message || 'Failed to join room.')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [participantName, roomName, role])

  const handleRoomError = (roomError) => {
    setError(
      roomError?.message ||
        'Unable to connect to room. Please verify LiveKit URL and API keys.',
    )
  }

  const handleRoomDisconnected = () => {
    if (hasConnectedOnce) {
      navigate('/', { replace: false })
      return
    }

    setError(
      'Could not join room. Check your .env values (URL, API key/secret) and token server.',
    )
    navigate('/', { replace: false })
  }

  if (!participantName || !roomName || !role) {
    return (
      <main className="join-page">
        <section className="join-card">
          <h1>Missing details</h1>
          <p>Please go back and enter your name, role, and room.</p>
          <button type="button" onClick={() => navigate('/')}>
            Back to Join
          </button>
        </section>
      </main>
    )
  }

  if (isLoading && !token) {
    return (
      <main className="join-page">
        <section className="join-card">
          <h1>Joining…</h1>
          <p>Connecting to <code>{roomName}</code> as <code>{role}</code>.</p>
        </section>
      </main>
    )
  }

  if (error && !token) {
    return (
      <main className="join-page">
        <section className="join-card">
          <h1>Unable to join</h1>
          <p className="error">{error}</p>
          <button type="button" onClick={() => navigate('/')}>
            Back to Join
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="room-page">
      <LiveKitRoom
        token={token}
        serverUrl={SERVER_URL}
        connect
        video
        audio
        onConnected={() => setHasConnectedOnce(true)}
        onError={handleRoomError}
        onDisconnected={handleRoomDisconnected}
        data-lk-theme="default"
        className="livekit-room"
      >
        <div className="room-layout">
          <section className="video-section">
            <VideoConference />
          </section>
          <aside className="chat-section">
            <h2>Room Chat</h2>
            <Chat />
          </aside>
        </div>
        <RoomAudioRenderer />
      </LiveKitRoom>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />
      <Route path="/:role/:roomName" element={<RoomPage />} />
    </Routes>
  )
}
