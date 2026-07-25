import { WebSocket } from 'ws';
import zlib from 'zlib';

// F1's live timing feed: the same SignalR (SignalR Core / ASP.NET Core) stream
// that powers the timing widget at formula1.com/en/timing/f1-live. No F1
// account or credentials are required — negotiate only hands back an AWS
// load-balancer cookie, not an auth token.
const BASE = 'https://livetiming.formula1.com/signalrcore';
const WS_BASE = 'wss://livetiming.formula1.com/signalrcore';
const RECORD_SEP = '\x1e';

// Topics mirror what FastF1's SignalRClient subscribes to. ".z"-suffixed
// topics are base64 + raw-deflate compressed and need inflating below.
const TOPICS = [
  'Heartbeat', 'DriverList', 'ExtrapolatedClock', 'RaceControlMessages',
  'SessionInfo', 'SessionStatus', 'TeamRadio', 'TimingAppData',
  'TimingStats', 'TrackStatus', 'WeatherData', 'Position.z', 'CarData.z',
  'SessionData', 'TimingData', 'TopThree', 'LapCount',
];

function inflate(base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  return JSON.parse(zlib.inflateRawSync(buf).toString('utf8'));
}

async function negotiate() {
  const res = await fetch(`${BASE}/negotiate?negotiateVersion=1`, { method: 'POST' });
  if (!res.ok) throw new Error(`negotiate failed: ${res.status}`);
  const cookies = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const { connectionToken } = await res.json();
  return { connectionToken, cookies };
}

// Opens a single connection. Resolves once the socket has closed (or
// rejects if it never managed to open), so the caller can decide whether
// to reconnect.
async function connectOnce({ topics, onSnapshot, onUpdate, quiet }) {
  const { connectionToken, cookies } = await negotiate();
  const ws = new WebSocket(`${WS_BASE}?id=${connectionToken}`, {
    headers: { Cookie: cookies },
  });

  let buffered = '';
  let handshakeDone = false;

  ws.on('open', () => {
    if (!quiet) console.log('[ws] open, sending handshake');
    ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + RECORD_SEP);
  });

  ws.on('message', (raw) => {
    buffered += raw.toString('utf8');
    const parts = buffered.split(RECORD_SEP);
    buffered = parts.pop(); // last part is incomplete (or empty)

    for (const part of parts) {
      if (!part) continue;
      const msg = JSON.parse(part);

      if (!handshakeDone) {
        handshakeDone = true;
        if (msg.error) throw new Error(`handshake error: ${msg.error}`);
        if (!quiet) console.log('[ws] handshake ok, subscribing to', topics.length, 'topics');
        ws.send(JSON.stringify({ type: 1, target: 'Subscribe', arguments: [topics], invocationId: '1' }) + RECORD_SEP);
        continue;
      }

      if (msg.type === 6) continue; // ping keepalive
      if (msg.type === 1 && msg.target === 'feed') {
        const [topic, data, timestamp] = msg.arguments;
        const payload = topic.endsWith('.z') ? inflate(data) : data;
        onUpdate?.(topic, payload, timestamp);
        continue;
      }
      if (msg.type === 3) {
        for (const [topic, data] of Object.entries(msg.result ?? {})) {
          const payload = topic.endsWith('.z') && typeof data === 'string' ? inflate(data) : data;
          onSnapshot?.(topic, payload);
        }
      }
    }
  });

  await new Promise((resolve, reject) => {
    ws.on('close', (code, reason) => {
      if (!quiet) console.log('[ws] closed', code, reason.toString());
      resolve();
    });
    ws.on('error', (err) => {
      console.error('[ws] error', err.message);
      reject(err);
    });
  });
}

// topics:    which topics to subscribe to (defaults to everything)
// onSnapshot(topic, data): fired once per topic with its full current state,
//   taken from the Subscribe completion message — needed because every
//   later update is a partial patch, not a full replacement. Also re-fired
//   in full after any reconnect, since a fresh Subscribe means a fresh
//   authoritative snapshot.
// onUpdate(topic, patch, timestamp): fired for each incremental patch after that.
// onStatusChange('connected' | 'reconnecting', info): connection lifecycle,
//   e.g. to show a staleness indicator — nothing else here proves the feed
//   is still alive, since incoming data can legitimately go quiet for
//   minutes (red flags, session breaks) without that meaning it's dead.
//
// The feed can drop a long-lived connection (idle load balancer timeouts,
// network blips) with no warning; without reconnecting, the caller's state
// just freezes silently at whatever it last received. This loops forever
// with capped exponential backoff until stop() is called.
export function connect({ topics = TOPICS, onSnapshot, onUpdate, onStatusChange, quiet = false } = {}) {
  let stopped = false;
  let attempt = 0;

  const donePromise = (async () => {
    while (!stopped) {
      try {
        onStatusChange?.('connected');
        attempt = 0;
        await connectOnce({ topics, onSnapshot, onUpdate, quiet });
      } catch (err) {
        if (!quiet) console.error('[ws] connection failed:', err.message);
      }
      if (stopped) break;
      attempt++;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 30000);
      onStatusChange?.('reconnecting', { attempt, delay });
      await new Promise((r) => setTimeout(r, delay));
    }
  })();

  return { stop: () => { stopped = true; }, done: donePromise };
}

// CLI entry point: connect and print a preview of everything received.
if (import.meta.url === `file://${process.argv[1]}`) {
  connect({
    onUpdate(topic, payload) {
      const preview = JSON.stringify(payload).slice(0, 200);
      console.log(`[${new Date().toISOString()}] ${topic}: ${preview}`);
    },
  });
}
