# Doctor-Patient LiveKit Meet (React)

This project is a React app for a simple telemedicine flow:
- doctor host and patient join the same room
- video/audio call in LiveKit
- in-room text chat

## 1) Setup

1. Install dependencies:
   - `npm install`
2. Copy env file:
   - `cp .env.example .env`
3. Fill real values in `.env`:
   - `VITE_LIVEKIT_URL`
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`

## 2) Run

Open two terminals:

1. Start token server:
   - `npm run token-server`
2. Start React app:
   - `npm run dev`

Now open the Vite URL, enter name + room, select role (doctor/patient), and join.

## 3) Token backend API

`POST /getToken`

Request body:

```json
{
  "roomName": "doctor-patient-room",
  "participantName": "Dr. Smith",
  "role": "doctor"
}
```

Response:

```json
{
  "token": "<livekit-jwt>"
}
```

## Notes

- Never expose `LIVEKIT_API_SECRET` in frontend code.
- Keep token generation in backend (`server/token-server.js`).
