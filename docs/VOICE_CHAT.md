# Online Voice Chat

**Scope: online rooms only.** The Local Network / Local Host feature is paused. This implementation has no local signaling adapter, no local-IP discovery and no local WebRTC networking, and it does not depend on the paused local-network branch. Local voice must not be built until it is explicitly authorised.

## What players get
The voice bar appears in three places:
- Puzzle Game rooms (`/play/:roomId`, lobby and game).
- Bakasa online rooms.
- Detective team rooms (the party lobby, and the investigation screen when the game is a party).

| Requirement | How it is met |
|---|---|
| Everyone in the room can talk | A full WebRTC mesh between everyone who has joined voice in that room. |
| Microphone OFF by default | Joining voice only lets you listen. `getUserMedia` is called only when the player taps "Turn mic on". |
| Explicit opt-in | The browser or Android permission prompt appears only after that tap. A denied or missing mic shows a clear message. |
| Open mic + push-to-talk | A mode toggle. In push-to-talk, holding the button (or Space/Enter) sends audio; releasing it stops. |
| No recording or storage | Audio goes directly between devices (or through a TURN relay, if one is configured). Supabase carries only SDP/ICE and small mic-state messages. Nothing is written to a database or to storage. |

## Architecture
```
VoiceBar (UI) ──> useVoiceChat (React: lifecycle, speaking meters, <audio> playback)
                       │
                       ▼
                 VoiceChat core ── SignalingAdapter (interface)
                 (src/voice/VoiceChat.ts)   └─ SupabaseSignalingAdapter (Realtime private channel)
                       │                     └─ [future] a local adapter: not implemented
                       ▼
                 createPeer() → RTCPeerConnection
```
- **Core** (`src/voice/VoiceChat.ts`). Transport-agnostic and fully unit-tested.
  - It builds one `RTCPeerConnection` per remote participant.
  - The participant with the smaller user id adds the single `audio` transceiver; the other side answers `sendrecv`.
  - Turning the mic on or off and push-to-talk never renegotiate: the track is swapped with `replaceTrack` and gated with `track.enabled`.
  - "Perfect negotiation" handles offer collisions: the larger id is *polite* and rolls back; the smaller id ignores the colliding offer.
  - ICE candidates that arrive early are queued.
  - On `failed`, the initiator calls `restartIce()`.
- **Signaling contract** (`src/voice/types.ts`):
  - `connect(selfId, { onMessage, onPeers, onError })`, `send(msg)`, `disconnect()`.
  - Messages: `description`, `ice`, `state` (micOn/transmitting) and `bye`.
- **Supabase adapter** (`src/voice/supabaseSignaling.ts`):
  - Uses a private channel `voice:<kind>:<id>`, where kind is `room`, `bakasa` or `detective`.
  - Broadcast event `signal` carries the messages; Presence keyed by user id carries membership.
- **ICE** (`src/voice/iceServers.ts`):
  - Google public STUN by default.
  - TURN is optional, set through `VITE_TURN_URL` (comma-separated), `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL`.

## Security
- **Migration `0028_voice_chat_realtime.sql`** adds `public.voice_topic_allowed(topic)` (security definer). It allows a topic only for the current user when they are:
  - `room`: an active member of the Puzzle Game room (`is_room_member`);
  - `bakasa`: an `ACTIVE` player (left or kicked players are denied);
  - `detective`: an `ACTIVE` party member.
- **Policies on `realtime.messages`:**
  - `voice_members_receive` (select) and `voice_members_send` (insert) apply to the `broadcast` and `presence` extensions on `voice:%` topics.
  - Non-members can neither read nor write the channel, and malformed topics are rejected.
  - The block is skipped when `realtime.messages` does not exist, as in the local SQL stub.
- **Existing channels are unaffected.** The app's other channels are public `postgres_changes` channels and are unaffected.
- **Peer identity.** Inside a room, a member could forge the `from` field of a broadcast. The worst case is a broken call with another member of the same room. No content or game data is exposed, because the channel never carries game data.

## Privacy notes
- WebRTC shares each device's network addresses (ICE candidates) with the other players in the voice chat. That is why joining voice is a separate, optional action.
- Speaking meters are computed locally from the audio stream and are never sent anywhere.
- Leaving voice, leaving the screen, or closing the tab closes all connections and stops the microphone.

## Android
- The APK now declares `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS`.
- Android still asks the user at runtime, and only when they turn their mic on.

## Tests
- `src/voice/VoiceChat.test.ts` (fake signaling bus + fake RTCPeerConnection) covers:
  - the mic stays off and is never requested on join;
  - mesh connection without a mic;
  - opt-in sends the track to every peer without renegotiation;
  - push-to-talk gating and remote state;
  - turning the mic off releases the device;
  - denied and missing microphone;
  - leaving cleans everything up and removes us from the others;
  - offer collision (the polite side rolls back);
  - addressed messages and early ICE.
- `src/voice/iceServers.test.ts`: STUN by default, TURN from the environment.
- `supabase/tests/voice_chat_policies.sql`, also run by `run_all.sh`, covers topic authorisation (member, kicked, stranger, anonymous, malformed or wrong-kind topic) and RLS on `realtime.messages`.
- **Real WebRTC check, done during development (Chromium with a fake microphone and an in-page signaling bus):**
  - 3 participants reach `connected` with every mic off.
  - After one enables the mic, the other two receive audio (`inbound-rtp` bytes > 0) and get a playable stream.
  - Push-to-talk disables the track.
  - A participant leaving is removed from the others.
  - This check caught and fixed a bug: a transceiver without a stream delivered a bare track, which is now wrapped in a `MediaStream`.
- **Manual check (not automated):**
  1. Open the same room on two devices.
  2. Join voice on both and turn the mic on.
  3. Talk in open mic, then switch to push-to-talk.
  4. Leave voice on one device and confirm the other sees it.

## Limitations
- Without TURN, some networks cannot connect peer to peer (symmetric NAT, many mobile carriers). The bar then shows a "could not reach a player" message. Production needs a TURN service for reliable mobile use.
- A full mesh suits rooms of up to roughly 6–8 active speakers; larger rooms would need an SFU.
- iOS Safari and in-app webviews may require one tap on the bar before remote audio plays; the bar resumes audio on touch.
- The migration must be applied to Supabase before voice works in production. Until then, joining voice shows "Could not connect to voice chat".
