import { useEffect, useMemo, useState } from 'react'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
  useRoomContext,
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

function LeaveConfirmInterceptor({ onLeaveIntent, onRoomReady }) {
  const room = useRoomContext()

  useEffect(() => {
    if (room) onRoomReady(room)
  }, [room, onRoomReady])

  useEffect(() => {
    const container = document.querySelector('.livekit-room')
    if (!container) return undefined

    const onClickCapture = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const leaveButton = target.closest('.lk-disconnect-button')
      if (!leaveButton) return

      event.preventDefault()
      event.stopPropagation()
      if (typeof event.stopImmediatePropagation === 'function') {
        event.stopImmediatePropagation()
      }

      onLeaveIntent()
    }

    container.addEventListener('click', onClickCapture, true)
    return () => {
      container.removeEventListener('click', onClickCapture, true)
    }
  }, [onLeaveIntent])

  return null
}

function ControlBarActionLogger() {
  useEffect(() => {
    const container = document.querySelector('.livekit-room')
    if (!container) return undefined

    const onClickCapture = (event) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const controlButton = target.closest(
        '.lk-control-bar .lk-button, .lk-control-bar .lk-chat-toggle, .lk-control-bar .lk-disconnect-button, .lk-agent-control-bar .lk-button, .lk-agent-control-bar .lk-disconnect-button',
      )
      if (!controlButton) return

      const action =
        controlButton.getAttribute('data-lk-source') ||
        controlButton.getAttribute('aria-label') ||
        controlButton.textContent?.trim() ||
        'unknown-action'

      console.log('[Meeting Bottom Bar Click]', action)
    }

    container.addEventListener('click', onClickCapture, true)
    return () => {
      container.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  return null
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
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [roomInstance, setRoomInstance] = useState(null)

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
    console.log('[Meeting Left]', { role, roomName, participantName })
    if (hasConnectedOnce) {
      navigate('/', { replace: false })
      return
    }

    setError(
      'Could not join room. Check your .env values (URL, API key/secret) and token server.',
    )
    navigate('/', { replace: false })
  }

  const handleLeaveIntent = () => {
    console.log('[Leave Clicked] Showing confirmation modal')
    setShowLeaveModal(true)
  }

  const handleCancelLeave = () => {
    setShowLeaveModal(false)
  }

  const handleConfirmLeave = async () => {
    console.log('[Leave Confirmed] Disconnecting from meeting')
    setShowLeaveModal(false)
    try {
      if (roomInstance) {
        await roomInstance.disconnect()
      }
    } finally {
      navigate('/', { replace: false })
    }
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
        onConnected={() => {
          console.log('[Meeting Joined]', { role, roomName, participantName })
          setHasConnectedOnce(true)
        }}
        onError={handleRoomError}
        onDisconnected={handleRoomDisconnected}
        data-lk-theme="default"
        className={`livekit-room role-${normalizeRole(role)}`}
      >
        <ControlBarActionLogger />
        <LeaveConfirmInterceptor
          onLeaveIntent={handleLeaveIntent}
          onRoomReady={setRoomInstance}
        />
        <div className="room-layout">
          <section className="video-section">
            <VideoConference />
          </section>
        </div>
        <RoomAudioRenderer />
      </LiveKitRoom>
      {showLeaveModal && (
        <div className="leave-modal-backdrop" role="presentation">
          <div
            className="leave-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-modal-title"
          >
            <h2 id="leave-modal-title">Leave meeting?</h2>
            <p>
              Your call will end and you will return to the join screen.
            </p>
            <div className="leave-modal-actions">
              <button
                type="button"
                className="leave-modal-btn secondary"
                onClick={handleCancelLeave}
              >
                Cancel
              </button>
              <button
                type="button"
                className="leave-modal-btn danger"
                onClick={handleConfirmLeave}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
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
