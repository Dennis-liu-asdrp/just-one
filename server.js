import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const words = [
  'Apple','Bridge','Candle','Dragon','Elephant','Forest','Galaxy','Harmony','Island','Jungle',
  'Knight','Lantern','Mountain','Nebula','Ocean','Pyramid','Quartz','Rainbow','Saturn','Treasure',
  'Umbrella','Violin','Whisper','Xylophone','Yacht','Zephyr','Anchor','Beacon','Compass','Diamond',
  'Emerald','Feather','Glacier','Harbor','Igloo','Jewel','Lagoon','Meteor','Nectar','Oracle',
  'Palette','Quiver','Riddle','Starlight','Temple','Universe','Voyage','Waterfall','Yonder','Zodiac',
  'Alpaca','Blizzard','Cactus','Dolphin','Enigma','Fjord','Geyser','Harpoon','Inferno','Jigsaw',
  'Kernel','Labyrinth','Meadow','Nimbus','Obsidian','Paradox','Quasar','Runway','Saffron','Tornado',
  'Utopia','Vortex','Wavelength','Yodel','Zucchini','Atlas','Bonsai','Chimera','Dynamo','Epoch',
  'Fable','Glimmer','Harlem','Inkling','Juggler','Keepsake','Lighthouse','Monsoon','Nomad','Overture',
  'Pinnacle','Quest','Reverie','Serenade','Timber','Udon','Verdict','Wingman','Yearbook','Zenith'
];

const state = {
  players: [],
  round: null,
  score: { success: 0, failure: 0 }
};

const playerStats = new Map();

const sseClients = new Set();

const HEARTBEAT_INTERVAL = 10000;
setInterval(() => {
  const tick = `:heartbeat ${Date.now()}\n\n`;
  for (const client of Array.from(sseClients)) {
    try {
      client.write(tick);
    } catch (err) {
      sseClients.delete(client);
      try {
        client.end();
      } catch (_) {}
    }
  }
}, HEARTBEAT_INTERVAL).unref();

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = requestUrl;

  if (pathname === '/healthz' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (pathname === '/events' && req.method === 'GET') {
    handleSse(req, res);
    return;
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(serializeState()));
    return;
  }

  if (pathname === '/api/join' && req.method === 'POST') {
    await handleJoin(req, res);
    return;
  }

  if (pathname === '/api/player/leave' && req.method === 'POST') {
    await handleLeave(req, res);
    return;
  }

  if (pathname === '/api/round/start' && req.method === 'POST') {
    await handleStartRound(req, res);
    return;
  }

  if (pathname === '/api/hints' && req.method === 'POST') {
    await handleSubmitHint(req, res);
    return;
  }

  if (pathname === '/api/round/begin-review' && req.method === 'POST') {
    await handleBeginReview(req, res);
    return;
  }

  if (pathname === '/api/round/reveal' && req.method === 'POST') {
    await handleReveal(req, res);
    return;
  }

  if (pathname === '/api/round/guess' && req.method === 'POST') {
    await handleGuess(req, res);
    return;
  }

  if (pathname.startsWith('/api/hints/') && pathname.endsWith('/mark') && req.method === 'POST') {
    await handleMarkHint(req, res, pathname.split('/')[3]);
    return;
  }

  if (pathname === '/api/round/word' && req.method === 'GET') {
    await handleGetWord(req, res, requestUrl.searchParams);
    return;
  }

  await serveStatic(pathname, res);
});

function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no'
  });

  res.write(':connected\n\n');
  res.write(`data: ${JSON.stringify(serializeState())}\n\n`);
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });

  req.on('error', () => {
    sseClients.delete(res);
  });
}

function broadcastState() {
  const payload = `data: ${JSON.stringify(serializeState())}\n\n`;
  for (const client of Array.from(sseClients)) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
      try {
        client.end();
      } catch (_) {}
    }
  }
}

async function serveStatic(requestPath, res) {
  try {
    const rawPath = requestPath === '/' ? '/index.html' : requestPath;
    let normalized;
    try {
      normalized = path.normalize(decodeURIComponent(rawPath));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }
    const relativePath = normalized.replace(/^\/+/, '');
    const filePath = path.join(publicDir, relativePath);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    const fileBuffer = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(fileBuffer);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'text/plain; charset=utf-8';
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function handleJoin(req, res) {
  try {
    const body = await readBody(req);
    const playerId = body.playerId || null;
    const name = (body.name || '').trim();
    const role = body.role === 'guesser' ? 'guesser' : 'hint';

    if (!name) {
      respond(res, 400, { error: 'Name is required' });
      return;
    }

    let player = playerId ? state.players.find(p => p.id === playerId) : null;

    if (player) {
      if (role === 'guesser' && roleIsTaken('guesser', player.id)) {
        respond(res, 409, { error: 'Another guesser is already active' });
        return;
      }
      player.name = name;
      player.role = role;
      player.lastSeenAt = Date.now();
    } else {
      if (role === 'guesser' && roleIsTaken('guesser')) {
        respond(res, 409, { error: 'A guesser is already active' });
        return;
      }
      player = {
        id: randomUUID(),
        name,
        role,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      };
      state.players.push(player);
    }

    syncPlayerStats(player.id, player.name);

    respond(res, 200, { player });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

function roleIsTaken(role, ignoreId = null) {
  return state.players.some(p => p.role === role && p.id !== ignoreId);
}

async function handleStartRound(req, res) {
  try {
    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);

    if (!state.players.some(p => p.role === 'guesser')) {
      respond(res, 400, { error: 'Add a guesser before starting' });
      return;
    }

    if (!state.players.some(p => p.role === 'hint')) {
      respond(res, 400, { error: 'At least one hint-giver is required' });
      return;
    }

    if (state.round && ['collecting_hints', 'reviewing_hints', 'awaiting_guess'].includes(state.round.stage)) {
      respond(res, 409, { error: 'Finish the current round before starting a new one' });
      return;
    }

    const word = pickWord();
    state.round = {
      id: randomUUID(),
      word,
      stage: 'collecting_hints',
      createdAt: Date.now(),
      startedBy: player.id,
      hints: [],
      guess: null,
      revealedAt: null,
      finishedAt: null,
      statsApplied: false
    };

    respond(res, 200, { roundId: state.round.id, wordAvailable: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleSubmitHint(req, res) {
  try {
    if (!state.round || state.round.stage !== 'collecting_hints') {
      respond(res, 409, { error: 'Hints cannot be submitted right now' });
      return;
    }

    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);

    if (player.role !== 'hint') {
      respond(res, 403, { error: 'Only hint-givers can submit hints' });
      return;
    }

    const text = (body.text || '').trim();
    if (!text) {
      respond(res, 400, { error: 'Hint text is required' });
      return;
    }

    const existing = state.round.hints.find(h => h.playerId === player.id);
    if (existing) {
      existing.text = text;
      existing.updatedAt = Date.now();
    } else {
      state.round.hints.push({
        id: randomUUID(),
        playerId: player.id,
        author: player.name,
        text,
        invalid: false,
        submittedAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    respond(res, 200, { success: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleBeginReview(req, res) {
  try {
    if (!state.round || state.round.stage !== 'collecting_hints') {
      respond(res, 409, { error: 'Cannot move to review right now' });
      return;
    }

    if (state.round.hints.length === 0) {
      respond(res, 400, { error: 'Submit at least one hint before review' });
      return;
    }

    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);
    if (player.role !== 'hint') {
      respond(res, 403, { error: 'Only hint-givers can begin review' });
      return;
    }

    state.round.stage = 'reviewing_hints';
    state.round.reviewStartedAt = Date.now();
    respond(res, 200, { success: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleReveal(req, res) {
  try {
    if (!state.round || state.round.stage !== 'reviewing_hints') {
      respond(res, 409, { error: 'Cannot reveal clues yet' });
      return;
    }

    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);
    if (player.role !== 'hint') {
      respond(res, 403, { error: 'Only hint-givers can reveal clues' });
      return;
    }

    state.round.stage = 'awaiting_guess';
    state.round.revealedAt = Date.now();

    respond(res, 200, { success: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleGuess(req, res) {
  try {
    if (!state.round || state.round.stage !== 'awaiting_guess') {
      respond(res, 409, { error: 'Guesses are not allowed right now' });
      return;
    }

    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);
    if (player.role !== 'guesser') {
      respond(res, 403, { error: 'Only the guesser can submit guesses' });
      return;
    }

    const text = (body.text || '').trim();
    if (!text) {
      respond(res, 400, { error: 'Guess text is required' });
      return;
    }

    const correct = text.toLowerCase() === state.round.word.toLowerCase();
    state.round.stage = 'round_result';
    state.round.guess = {
      playerId: player.id,
      playerName: player.name,
      text,
      correct,
      submittedAt: Date.now()
    };
    state.round.finishedAt = Date.now();
    finalizeCurrentRoundStats();
    if (correct) {
      state.score.success += 1;
    } else {
      state.score.failure += 1;
    }

    respond(res, 200, { correct });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleMarkHint(req, res, hintId) {
  try {
    if (!state.round || state.round.stage !== 'reviewing_hints') {
      respond(res, 409, { error: 'Hints cannot be marked right now' });
      return;
    }

    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);
    if (player.role !== 'hint') {
      respond(res, 403, { error: 'Only hint-givers can mark hints' });
      return;
    }

    const hint = state.round.hints.find(h => h.id === hintId);
    if (!hint) {
      respond(res, 404, { error: 'Hint not found' });
      return;
    }
    hint.invalid = Boolean(body.invalid);
    hint.markedBy = player.id;
    hint.markedAt = Date.now();

    respond(res, 200, { success: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleGetWord(req, res, params) {
  try {
    if (!state.round) {
      respond(res, 404, { error: 'No active round' });
      return;
    }

    const playerId = params.get('playerId');
    const player = findPlayer(playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);
    if (player.role !== 'hint') {
      respond(res, 403, { error: 'Only hint-givers can view the word' });
      return;
    }

    respond(res, 200, { word: state.round.word });
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleLeave(req, res) {
  try {
    const body = await readBody(req);
    const playerId = body.playerId;
    if (!playerId) {
      respond(res, 400, { error: 'Player ID is required' });
      return;
    }
    const player = findPlayer(playerId);
    if (!player) {
      respond(res, 200, { success: true });
      return;
    }
    removePlayer(playerId);
    respond(res, 200, { success: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

function respond(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function findPlayer(playerId) {
  return state.players.find(p => p.id === playerId);
}

function removePlayer(playerId) {
  state.players = state.players.filter(p => p.id !== playerId);
  if (state.round) {
    state.round.hints = state.round.hints.filter(h => h.playerId !== playerId);
    if (state.round.guess && state.round.guess.playerId === playerId) {
      state.round.guess = null;
    }
    // If the sole guesser left during an active round, end the round early.
    if (state.round.stage !== 'round_result') {
      const hasGuesser = state.players.some(p => p.role === 'guesser');
      if (!hasGuesser) {
        state.round.stage = 'round_result';
        state.round.finishedAt = Date.now();
        state.round.guess = null;
        finalizeCurrentRoundStats();
      }
    }
  }
}

function touchPlayer(player) {
  if (player) {
    player.lastSeenAt = Date.now();
  }
}

function pickWord() {
  const index = Math.floor(Math.random() * words.length);
  return words[index];
}

function serializeState() {
  const round = state.round
    ? {
        id: state.round.id,
        stage: state.round.stage,
        hints: state.round.hints.map(hint => ({
          id: hint.id,
          playerId: hint.playerId,
          author: hint.author,
          text: hint.text,
          invalid: hint.invalid
        })),
        guess: state.round.guess
          ? {
              playerId: state.round.guess.playerId,
              playerName: state.round.guess.playerName,
              text: state.round.guess.text,
              correct: state.round.guess.correct
            }
          : null,
        revealedAt: state.round.revealedAt,
        finishedAt: state.round.finishedAt,
        wordRevealed: state.round.stage === 'round_result'
      }
    : null;

  if (round && round.wordRevealed) {
    round.word = state.round.word;
  }

  return {
    players: state.players.map(player => ({
      id: player.id,
      name: player.name,
      role: player.role
    })),
    round,
    score: state.score,
    leaderboard: buildLeaderboard()
  };
}

function syncPlayerStats(playerId, name) {
  const stats = getPlayerStats(playerId, name);
  stats.name = name;
  stats.lastUpdatedAt = Date.now();
}

function getPlayerStats(playerId, name = 'Unknown hint-giver') {
  let stats = playerStats.get(playerId);
  if (!stats) {
    stats = {
      playerId,
      name,
      hintsGiven: 0,
      hintsKept: 0,
      hintsEliminated: 0,
      usefulnessSum: 0,
      usefulnessEntries: 0,
      roundsParticipated: 0,
      successfulRounds: 0,
      bestHints: [],
      lastUpdatedAt: Date.now()
    };
    playerStats.set(playerId, stats);
  }
  return stats;
}

function finalizeCurrentRoundStats() {
  if (!state.round || state.round.stage !== 'round_result' || state.round.statsApplied) {
    return;
  }
  applyRoundToStats(state.round);
  state.round.statsApplied = true;
}

function applyRoundToStats(round) {
  const guessCorrect = Boolean(round.guess?.correct);
  const participants = new Set();
  const finishedAt = round.finishedAt || Date.now();
  const word = round.word || state.round?.word || null;

  for (const hint of round.hints) {
    const stats = getPlayerStats(hint.playerId, hint.author);
    participants.add(hint.playerId);

    stats.hintsGiven += 1;
    if (hint.invalid) {
      stats.hintsEliminated += 1;
    } else {
      stats.hintsKept += 1;
    }

    const usefulness = guessCorrect && !hint.invalid ? 1 : 0;
    stats.usefulnessSum += usefulness;
    stats.usefulnessEntries += 1;

    if (hint.text && usefulness > 0) {
      const entry = {
        text: hint.text,
        word,
        correct: guessCorrect,
        invalid: Boolean(hint.invalid),
        score: usefulness,
        recordedAt: finishedAt
      };
      stats.bestHints.push(entry);
      stats.bestHints.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.recordedAt - a.recordedAt;
      });
      if (stats.bestHints.length > 5) {
        stats.bestHints.length = 5;
      }
    }

    stats.lastUpdatedAt = finishedAt;
  }

  for (const playerId of participants) {
    const stats = getPlayerStats(playerId);
    stats.roundsParticipated += 1;
    if (guessCorrect) {
      stats.successfulRounds += 1;
    }
    stats.lastUpdatedAt = finishedAt;
  }
}

function buildLeaderboard() {
  const allStats = Array.from(playerStats.values());
  if (allStats.length === 0) {
    return {
      global: [],
      room: [],
      byPlayer: {},
      updatedAt: Date.now()
    };
  }

  const roomHintGiverIds = new Set(state.players.filter(p => p.role === 'hint').map(p => p.id));

  const entries = allStats.map(stats => {
    const metrics = calculateMetrics(stats);
    return {
      playerId: stats.playerId,
      name: stats.name,
      metrics,
      totals: {
        hintsGiven: stats.hintsGiven,
        hintsKept: stats.hintsKept,
        hintsEliminated: stats.hintsEliminated,
        roundsParticipated: stats.roundsParticipated,
        successfulRounds: stats.successfulRounds
      },
      playerScore: metrics.playerScore,
      bestHints: stats.bestHints.slice(0, 3),
      lastUpdatedAt: stats.lastUpdatedAt
    };
  });

  const sortEntries = list =>
    list.sort((a, b) => {
      if (b.playerScore !== a.playerScore) return b.playerScore - a.playerScore;
      if (b.metrics.cus !== a.metrics.cus) return b.metrics.cus - a.metrics.cus;
      return a.name.localeCompare(b.name);
    });

  const rankedEntries = entries.filter(entry => entry.totals.hintsGiven > 0);

  const global = sortEntries(rankedEntries.slice());
  const room = sortEntries(rankedEntries.filter(entry => roomHintGiverIds.has(entry.playerId)));

  const byPlayer = {};
  for (const entry of entries) {
    byPlayer[entry.playerId] = entry;
  }

  return {
    global,
    room,
    byPlayer,
    updatedAt: Date.now()
  };
}

function calculateMetrics(stats) {
  const cusRaw = stats.usefulnessEntries === 0 ? 0 : (stats.usefulnessSum / stats.usefulnessEntries) * 100;
  const hsrRaw = stats.hintsGiven === 0 ? 0 : (stats.hintsKept / stats.hintsGiven) * 100;
  const garRaw = stats.roundsParticipated === 0 ? 0 : (stats.successfulRounds / stats.roundsParticipated) * 100;
  const efRaw = 100 - hsrRaw;

  const playerScoreRaw = (cusRaw * 0.5) + (hsrRaw * 0.3) + (garRaw * 0.2);

  return {
    cus: Number(cusRaw.toFixed(1)),
    hsr: Number(hsrRaw.toFixed(1)),
    gar: Number(garRaw.toFixed(1)),
    ef: Number(efRaw.toFixed(1)),
    playerScore: Number(playerScoreRaw.toFixed(1))
  };
}

server.keepAliveTimeout = 75000;
server.headersTimeout = 80000;
server.requestTimeout = 0;

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Just One server running at http://localhost:${PORT}`);
});
