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

function formatLocalDateTimeForInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  return `${y}-${m}-${d}T${hh}:${mm}`
}

function isScheduleOpen(startIso) {
  const startMs = Date.parse(startIso || '')
  if (Number.isNaN(startMs)) return true
  return Date.now() >= startMs
}

function getScheduleKey(roomName) {
  return `schedule:${roomName}`
}

function getMeetingsKey() {
  return 'scheduledMeetings:v1'
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function formatTimeUntil(startIso) {
  const startMs = Date.parse(startIso || '')
  if (Number.isNaN(startMs)) return ''
  const diffMs = Math.max(0, startMs - Date.now())
  const totalSeconds = Math.ceil(diffMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function secondsUntil(startIso) {
  const startMs = Date.parse(startIso || '')
  if (Number.isNaN(startMs)) return 0
  return Math.max(0, Math.ceil((startMs - Date.now()) / 1000))
}

function formatMeetingStart(startIso) {
  const startMs = Date.parse(startIso || '')
  if (Number.isNaN(startMs)) return ''

  const start = new Date(startMs)

  const dayLabel = start.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  })
  const timeLabel = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${dayLabel} • ${timeLabel}`
}

function JoinPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(() => ({
    participantName: '',
    roomName: generateRoomName(),
    role: 'doctor',
  }))
  const [roomType, setRoomType] = useState('instant') // 'instant' | 'scheduled'
  const [scheduledStart, setScheduledStart] = useState(() => {
    const date = new Date()
    return formatLocalDateTimeForInput(date)
  })
  const [error, setError] = useState('')
  const [toast, setToast] = useState({ isOpen: false, message: '', kind: 'info' })
  const [scheduledMeetings, setScheduledMeetings] = useState([])
  const [scheduleModal, setScheduleModal] = useState({
    isOpen: false,
    roomName: '',
    startIso: '',
  })
  const [meetingModal, setMeetingModal] = useState({
    isOpen: false,
    roomName: '',
    startIso: '',
  })
  const [meetingName, setMeetingName] = useState('')
  const [meetingCountdown, setMeetingCountdown] = useState('')
  const [listTick, setListTick] = useState(0)

  useEffect(() => {
    if (!toast.isOpen) return
    const timerId = window.setTimeout(
      () => setToast((t) => ({ ...t, isOpen: false })),
      3500,
    )
    return () => window.clearTimeout(timerId)
  }, [toast.isOpen])

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

    if (normalizeRole(nextRole) === 'patient') {
      setRoomType('scheduled')
    }
  }

  useEffect(() => {
    const raw = localStorage.getItem(getMeetingsKey())
    const parsed = raw ? safeJsonParse(raw) : null
    setScheduledMeetings(Array.isArray(parsed) ? parsed : [])
  }, [])

  useEffect(() => {
    if (!scheduledMeetings.length) return
    const intervalId = window.setInterval(() => setListTick((t) => t + 1), 1000)
    return () => window.clearInterval(intervalId)
  }, [scheduledMeetings.length])

  useEffect(() => {
    if (!meetingModal.isOpen) return
    const startIso = meetingModal.startIso

    const tick = () => {
      if (isScheduleOpen(startIso)) {
        setMeetingCountdown('')
        return
      }
      setMeetingCountdown(formatTimeUntil(startIso))
    }

    tick()
    const intervalId = window.setInterval(tick, 500)
    return () => window.clearInterval(intervalId)
  }, [meetingModal.isOpen, meetingModal.startIso])

  useEffect(() => {
    if (!meetingModal.isOpen) return
    if (!meetingModal.startIso) return
    if (!isScheduleOpen(meetingModal.startIso)) return

    const role = normalizeRole(form.role)
    const roomName = meetingModal.roomName
    const participantName =
      role === 'doctor' ? form.participantName.trim() : meetingName.trim()
    if (!participantName) return
    sessionStorage.setItem('participantName', participantName)
    const path = `/${encodeURIComponent(role)}/${encodeURIComponent(roomName)}`
    setMeetingModal({ isOpen: false, roomName: '', startIso: '' })
    navigate(`${path}?name=${encodeURIComponent(participantName)}`, { replace: false })
  }, [meetingModal.isOpen, meetingModal.roomName, meetingModal.startIso, meetingName, form.role, navigate])

  const handleSubmit = (event) => {
    event.preventDefault()
    setError('')
    setToast((t) => ({ ...t, isOpen: false }))

    try {
      const participantName = form.participantName.trim()
      const role = normalizeRole(form.role)
      const roomName = form.roomName.trim() ? form.roomName.trim() : generateRoomName()
      const scheduleStartIso =
        roomType === 'scheduled' && scheduledStart
          ? new Date(scheduledStart).toISOString()
          : ''

      if (roomType === 'scheduled') {
        if (role === 'doctor') {
          if (!form.roomName.trim()) {
            setForm((prev) => ({ ...prev, roomName }))
          }

          localStorage.setItem(
            getScheduleKey(roomName),
            JSON.stringify({
              startIso: scheduleStartIso,
              createdAtIso: new Date().toISOString(),
              hostName: participantName,
            }),
          )

          const raw = localStorage.getItem(getMeetingsKey())
          const parsed = raw ? safeJsonParse(raw) : null
          const current = Array.isArray(parsed) ? parsed : []
          const next = [
            ...current.filter((m) => m?.roomName !== roomName),
            {
              roomName,
              startIso: scheduleStartIso,
              createdAtIso: new Date().toISOString(),
              hostName: participantName,
            },
          ].sort((a, b) => Date.parse(a?.startIso || '') - Date.parse(b?.startIso || ''))
          localStorage.setItem(getMeetingsKey(), JSON.stringify(next))
          setScheduledMeetings(next)

          setToast({
            isOpen: true,
            kind: 'success',
            message: 'Scheduled meeting created. Share the room name with the patient.',
          })
          return
        } else if (role === 'patient') {
          const raw = localStorage.getItem(getScheduleKey(roomName))
          const parsed = raw ? safeJsonParse(raw) : null
          const startIso = parsed?.startIso || scheduleStartIso

          if (!startIso) {
            setError('No schedule found for this room. Please ask the doctor to schedule it first.')
            return
          }

          if (!isScheduleOpen(startIso)) {
            setScheduleModal({ isOpen: true, roomName, startIso })
            return
          }
        }
      }

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
      <div className="join-layout">
        <section className="join-card">
          <h1>LiveKit Meet</h1>
          <p>Choose a room type, then continue.</p>

          <form onSubmit={handleSubmit} className="join-form">
            {normalizeRole(form.role) === 'doctor' && (
              <label>
                Room Type
                <div className="segmented" role="radiogroup" aria-label="Room type">
                  <label className="segmented-option">
                    <input
                      type="radio"
                      name="roomType"
                      value="instant"
                      checked={roomType === 'instant'}
                      onChange={(e) => setRoomType(e.target.value)}
                    />
                    <span className="segmented-label">Start now</span>
                    <span className="segmented-sub">Go live immediately</span>
                  </label>
                  <label className="segmented-option">
                    <input
                      type="radio"
                      name="roomType"
                      value="scheduled"
                      checked={roomType === 'scheduled'}
                      onChange={(e) => setRoomType(e.target.value)}
                    />
                    <span className="segmented-label">Schedule</span>
                    <span className="segmented-sub">Join when it opens</span>
                  </label>
                </div>
              </label>
            )}

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

            {roomType === 'scheduled' && normalizeRole(form.role) === 'doctor' && (
              <label>
                Schedule time
                <input
                  type="datetime-local"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                  required
                />
              </label>
            )}

            <label>
              Room Name
              <input
                value={form.roomName}
                onChange={handleChange('roomName')}
                placeholder="ABC-123-XYZ"
              />
            </label>

            <button type="submit" className="btn btn-primary" disabled={!canJoin}>
              {roomType === 'scheduled' && normalizeRole(form.role) === 'doctor'
                ? 'Create'
                : normalizeRole(form.role) === 'doctor'
                  ? 'Host'
                  : 'Join'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}
        </section>

        {scheduledMeetings.length > 0 && (
          <section className="join-card meetings-card">
            <div className="meetings-header">
              <h2>Scheduled meetings</h2>
              <p className="meetings-subtitle">Tap a meeting to join when it opens.</p>
            </div>
            <ul className="meeting-list">
              {scheduledMeetings.map((m) => {
                const roomName = m?.roomName || ''
                const startIso = m?.startIso || ''
                const hostName = (m?.hostName || '').trim()
                const secondsLeft = secondsUntil(startIso)
                const isOpenNow = startIso ? isScheduleOpen(startIso) : true
                const showCountdown = Boolean(startIso) && !isOpenNow
                const isStartingSoon = showCountdown && secondsLeft <= 60
                const canQuickJoin = Boolean(startIso) && (isOpenNow || secondsLeft <= 60)
                const openMeetingCard = () => {
                  if (!roomName) return
                  setMeetingName('')
                  setMeetingModal({ isOpen: true, roomName, startIso })
                }
                return (
                  <li key={roomName || `${startIso}-${listTick}`}>
                    <div
                      role="button"
                      tabIndex={0}
                      className="meeting-item"
                      onClick={openMeetingCard}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openMeetingCard()
                        }
                      }}
                    >
                      <div className="meeting-row">
                        <div>
                          <div className="meeting-title">
                            <span className="meeting-room">
                              <code>{roomName}</code>
                            </span>
                          </div>
                          <div className="meeting-meta">
                            {startIso ? formatMeetingStart(startIso) : 'No time set'}
                          </div>
                          {hostName && (
                            <div className="meeting-submeta">
                              Host <span className="dot">•</span> <span className="host-name">{hostName}</span>
                            </div>
                          )}
                        </div>

                        {startIso && (
                          <div
                            className={[
                              'meeting-badge',
                              isOpenNow ? 'live' : '',
                              isStartingSoon ? 'soon' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            {!isOpenNow && <span>Starts in</span>}
                            <code>{isOpenNow ? 'LIVE' : formatTimeUntil(startIso)}</code>
                          </div>
                        )}
                      </div>

                      {canQuickJoin && (
                        <div className="meeting-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (!roomName) return
                              const role = normalizeRole(form.role)
                              const hostName = form.participantName.trim()

                              if (role === 'doctor' && isScheduleOpen(startIso) && hostName) {
                                sessionStorage.setItem('participantName', hostName)
                                const path = `/${encodeURIComponent(role)}/${encodeURIComponent(roomName)}`
                                navigate(`${path}?name=${encodeURIComponent(hostName)}`, {
                                  replace: false,
                                })
                                return
                              }

                              setMeetingName('')
                              setMeetingModal({ isOpen: true, roomName, startIso })
                            }}
                          >
                            {isOpenNow ? 'Join now' : 'Join'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              if (!roomName) return
                              navigator?.clipboard?.writeText?.(roomName)
                            }}
                          >
                            Copy ID
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      {scheduleModal.isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Room not open yet</h2>
            <p>
              This scheduled room <code>{scheduleModal.roomName}</code> opens at{' '}
              <code>{new Date(scheduleModal.startIso).toLocaleString()}</code>.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!isScheduleOpen(scheduleModal.startIso)) return

                  const participantName = form.participantName.trim()
                  const role = normalizeRole(form.role)
                  const roomName = scheduleModal.roomName
                  const path = `/${encodeURIComponent(role)}/${encodeURIComponent(roomName)}`
                  setScheduleModal({ isOpen: false, roomName: '', startIso: '' })
                  navigate(`${path}?name=${encodeURIComponent(participantName)}`, { replace: false })
                }}
              >
                Check & Join
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setScheduleModal({ isOpen: false, roomName: '', startIso: '' })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {meetingModal.isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>Join meeting</h2>
            <p>
              Room <code>{meetingModal.roomName}</code>
              {meetingModal.startIso ? (
                <>
                  {' '}
                  starts at <code>{new Date(meetingModal.startIso).toLocaleString()}</code>.
                </>
              ) : (
                '.'
              )}
            </p>

            {!isScheduleOpen(meetingModal.startIso) && meetingModal.startIso && (
              <div className="countdown">
                <div className="countdown-label">Meeting starts in</div>
                <div className="countdown-time">
                  <code>{meetingCountdown || formatTimeUntil(meetingModal.startIso)}</code>
                </div>
              </div>
            )}

            {normalizeRole(form.role) === 'patient' ? (
              <label className="modal-field">
                Your name
                <input
                  value={meetingName}
                  onChange={(e) => setMeetingName(e.target.value)}
                  placeholder="Enter your name"
                />
              </label>
            ) : (
              <p className="hint">
                Hosting as <code>{form.participantName.trim() || '—'}</code>
              </p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const role = normalizeRole(form.role)
                  const participantName =
                    role === 'doctor' ? form.participantName.trim() : meetingName.trim()
                  if (!participantName) return

                  if (meetingModal.startIso && !isScheduleOpen(meetingModal.startIso)) return

                  const roomName = meetingModal.roomName
                  sessionStorage.setItem('participantName', participantName)
                  const path = `/${encodeURIComponent(role)}/${encodeURIComponent(roomName)}`
                  setMeetingModal({ isOpen: false, roomName: '', startIso: '' })
                  navigate(`${path}?name=${encodeURIComponent(participantName)}`, { replace: false })
                }}
              >
                {normalizeRole(form.role) === 'doctor' ? 'Host' : 'Join'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMeetingModal({ isOpen: false, roomName: '', startIso: '' })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast.isOpen && (
        <div className={`toast ${toast.kind}`} role="status" aria-live="polite">
          <div className="toast-body">{toast.message}</div>
          <button
            type="button"
            className="toast-close"
            aria-label="Close notification"
            onClick={() => setToast((t) => ({ ...t, isOpen: false }))}
          >
            ×
          </button>
        </div>
      )}
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
  const [scheduledStartIso, setScheduledStartIso] = useState('')
  const [scheduledCountdown, setScheduledCountdown] = useState('')

  const scheduleIsBlocking = Boolean(scheduledStartIso) && !isScheduleOpen(scheduledStartIso)

  useEffect(() => {
    if (!roomName) return
    const raw = localStorage.getItem(getScheduleKey(roomName))
    const parsed = raw ? safeJsonParse(raw) : null
    const startIso = parsed?.startIso || ''
    setScheduledStartIso(startIso)
  }, [roomName])

  useEffect(() => {
    if (!scheduleIsBlocking) {
      setScheduledCountdown('')
      return
    }

    const tick = () => {
      setScheduledCountdown(formatTimeUntil(scheduledStartIso))
    }

    tick()
    const intervalId = window.setInterval(tick, 500)
    return () => window.clearInterval(intervalId)
  }, [scheduleIsBlocking, scheduledStartIso])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!participantName || !roomName || !role) return
      if (scheduleIsBlocking) return

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
  }, [participantName, roomName, role, scheduleIsBlocking])

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

  if (scheduleIsBlocking) {
    return (
      <main className="join-page">
        <section className="join-card">
          <h1>Meeting not open yet</h1>
          <p>
            This room opens at <code>{new Date(scheduledStartIso).toLocaleString()}</code>.
          </p>
          <div className="countdown">
            <div className="countdown-label">Starts in</div>
            <div className="countdown-time">
              <code>{scheduledCountdown || formatTimeUntil(scheduledStartIso)}</code>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
              Back
            </button>
          </div>
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
