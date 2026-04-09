import { useMemo, useState } from 'react'
import {
  Chat,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from '@livekit/components-react'
import '@livekit/components-styles'
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

function App() {
  const [form, setForm] = useState({
    participantName: '',
    roomName: 'doctor-patient-room',
    role: 'doctor',
  })
  const [token, setToken] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false)

  const canJoin = useMemo(() => {
    return form.participantName.trim() && form.roomName.trim()
  }, [form.participantName, form.roomName])

  const handleChange = (key) => (event) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }))
  }

  const handleJoin = async (event) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const roomToken = await requestToken({
        roomName: form.roomName.trim(),
        participantName: form.participantName.trim(),
        role: form.role,
      })
      setToken(roomToken)
    } catch (joinError) {
      setError(joinError.message || 'Failed to join room.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRoomError = (roomError) => {
    setError(
      roomError?.message ||
        'Unable to connect to room. Please verify LiveKit URL and API keys.',
    )
  }

  const handleRoomDisconnected = () => {
    // If connection was successful and user leaves/disconnects, return to join form.
    if (hasConnectedOnce) {
      setToken('')
      setHasConnectedOnce(false)
      return
    }

    // If we disconnect before first successful connect, show error and return to form.
    setError(
      'Could not join room. Check your .env values (URL, API key/secret) and token server.',
    )
    setToken('')
  }

  if (!token) {
    return (
      <main className="join-page">
        <section className="join-card">
          <h1>Doctor-Patient LiveKit Meet</h1>
          <p>
            Create or join a secure consultation room with video call and chat.
          </p>

          <form onSubmit={handleJoin} className="join-form">
            <label>
              Your Name
              <input
                value={form.participantName}
                onChange={handleChange('participantName')}
                placeholder="Dr. Smith or Patient Name"
                required
              />
            </label>

            <label>
              Room Name
              <input
                value={form.roomName}
                onChange={handleChange('roomName')}
                placeholder="consultation-123"
                required
              />
            </label>

            <label>
              Role
              <select value={form.role} onChange={handleChange('role')}>
                <option value="doctor">Doctor Host</option>
                <option value="patient">Patient</option>
              </select>
            </label>

            <button type="submit" disabled={!canJoin || isLoading}>
              {isLoading ? 'Joining...' : 'Join Consultation Room'}
            </button>
          </form>

        
          {error && <p className="error">{error}</p>}
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

export default App
