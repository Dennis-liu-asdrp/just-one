import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import words from './words.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const MAX_TOTAL_ROUNDS = 20;
const DEFAULT_TOTAL_ROUNDS = 10;
const allowedAvatars = Object.freeze([
  '🦊','🐼','🐸','🦄','🐝','🐢','🐧','🦁','🐙','🐨',
  '🐰','🐯','🐶','🐱','🐭','🐹','🐻','🐷','🐮','🐔',
  '🐤','🦉','🦋','🐞','🐬','🐳','🐠','🦈','🐲','🦖'
]);
const defaultAvatar = '🙂';
const MAX_CHAT_HISTORY = 200;
const MAX_CHAT_LENGTH = 280;

function normalizeAvatar(value) {
  if (typeof value !== 'string') return defaultAvatar;
  if (value === defaultAvatar) return defaultAvatar;
  return allowedAvatars.includes(value) ? value : defaultAvatar;
}

const state = {
  players: [],
  round: null,
  score: { success: 0, failure: 0 },
  wordDeck: shuffle([...words]),
  lastWord: null,
  gameConfig: {
    totalRounds: DEFAULT_TOTAL_ROUNDS
  },
  settings: {
    difficulty: 'easy'
  },
  roundsCompleted: 0,
  gameOver: false,
  gameOverReason: null,
  endGameVotes: new Set(),
};

const COMPOUND_PREFIXES = ['after','air','auto','earth','fire','grand','hand','home','inner','light','moon','north','outer','over','rain','shadow','snow','south','space','star','sun','super','under','water','west','wind'];
const COMPOUND_SUFFIXES = ['craft','field','fire','house','land','light','maker','ship','song','space','sphere','stone','storm','time','town','walk','ward','work'];
const COMMON_WORD_PARTS = new Set([
  'ball','book','cloud','dream','forest','gold','heart','light','night','river','road','sky','space','spring','storm','table','watch','wood','world'
]);

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

  if (pathname === '/api/settings' && req.method === 'POST') {
    await handleUpdateSettings(req, res);
    return;
  }

  if (pathname === '/api/game/end-vote' && req.method === 'POST') {
    await handleToggleEndVote(req, res);
    return;
  }

  if (pathname === '/api/game/reset' && req.method === 'POST') {
    await handleResetGame(req, res);
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

  if (pathname === '/api/round/chat' && req.method === 'POST') {
    await handlePostChat(req, res);
    return;
  }

  if (pathname === '/api/hints/typing' && req.method === 'POST') {
    await handleTypingHint(req, res);
    return;
  }

  if (pathname === '/api/guess/typing' && req.method === 'POST') {
    await handleGuessTyping(req, res);
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
    const avatar = normalizeAvatar(body.avatar);

    if (!name) {
      respond(res, 400, { error: 'Name is required' });
      return;
    }

    let player = playerId ? state.players.find(p => p.id === playerId) : null;

    if (player) {
      const roleChangeRequested = role !== player.role;
      if (roleChangeRequested && isRoleChangeLocked()) {
        respond(res, 409, { error: 'Roles are locked during an active round' });
        return;
      }
      if (role === 'guesser' && roleIsTaken('guesser', player.id)) {
        respond(res, 409, { error: 'Another guesser is already active' });
        return;
      }
      player.name = name;
      player.role = role;
      player.avatar = avatar;
      player.lastSeenAt = Date.now();
      applyAvatarToHints(player.id, player.avatar);
    } else {
      if (role === 'guesser' && roleIsTaken('guesser')) {
        respond(res, 409, { error: 'A guesser is already active' });
        return;
      }
      player = {
        id: randomUUID(),
        name,
        role,
        avatar,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      };
      state.players.push(player);
    }

    syncPlayerStats(player.id, player.name);
    state.endGameVotes.delete(player.id);
    recomputeHintConsensus();

    respond(res, 200, { player });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

function roleIsTaken(role, ignoreId = null) {
  return state.players.some(p => p.role === role && p.id !== ignoreId);
}

function isRoleChangeLocked() {
  if (!state.round) return false;
  const lockedStages = ['collecting_hints', 'reviewing_hints', 'awaiting_guess'];
  return lockedStages.includes(state.round.stage);
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

    if (state.gameOver) {
      respond(res, 409, { error: 'Game already finished. Update settings to start a new game.' });
      return;
    }

    if (state.roundsCompleted >= state.gameConfig.totalRounds) {
      endGame('completed');
      respond(res, 409, { error: 'Game already finished. Update settings to start a new game.' });
      return;
    }

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

    state.endGameVotes.clear();

    const word = drawWord();
    state.round = {
      id: randomUUID(),
      word,
      stage: 'collecting_hints',
      createdAt: Date.now(),
      startedBy: player.id,
      hints: [],
      chatMessages: [],
      guess: null,
      revealedAt: null,
      finishedAt: null,
      statsApplied: false,
      number: state.roundsCompleted + 1,
      reviewLocks: new Set(),
      typingHints: new Set(),
      guesserTyping: new Set()
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

    const reviewLocks = getRoundReviewLockSet();
    if (reviewLocks.has(player.id)) {
      respond(res, 423, { error: 'Your hint is locked for review' });
      return;
    }

    const text = (body.text || '').trim();
    if (!text) {
      respond(res, 400, { error: 'Hint text is required' });
      return;
    }

    if (state.settings?.difficulty === 'hard') {
      const validationError = validateHardModeHint(text);
      if (validationError) {
        respond(res, 400, { error: validationError });
        return;
      }
    }

    const existing = state.round.hints.find(h => h.playerId === player.id);
    if (existing) {
      const textChanged = existing.text !== text;
      existing.text = text;
      existing.author = player.name;
      existing.avatar = player.avatar || defaultAvatar;
      existing.updatedAt = Date.now();
      ensureHintVoteSet(existing);
      if (textChanged) {
        existing.eliminationVotes.clear();
        existing.invalid = false;
      }
    } else {
      state.round.hints.push({
        id: randomUUID(),
        playerId: player.id,
        author: player.name,
        text,
        invalid: false,
        avatar: player.avatar || defaultAvatar,
        eliminationVotes: new Set(),
        submittedAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    recomputeHintConsensus();
    const typingHints = getRoundTypingSet();
    typingHints.delete(player.id);

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

    if (state.round.hints.length === 0) {
      respond(res, 400, { error: 'Submit at least one hint before review' });
      return;
    }

    const playerHint = state.round.hints.find(h => h.playerId === player.id);
    if (!playerHint) {
      respond(res, 400, { error: 'Submit a hint before reviewing collisions' });
      return;
    }

    const reviewLocks = getRoundReviewLockSet();
    const alreadyLocked = reviewLocks.has(player.id);
    if (!alreadyLocked) {
      reviewLocks.add(player.id);
    }

    getRoundTypingSet().delete(player.id);

    const reviewStageChanged = maybeEnterReviewStage();
    const readyToReview = state.round.stage === 'reviewing_hints' || reviewStageChanged;

    respond(res, 200, { success: true, readyToReview, alreadyLocked });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleTypingHint(req, res) {
  try {
    if (!state.round) {
      respond(res, 409, { error: 'No active round' });
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
      respond(res, 403, { error: 'Only hint-givers can set typing status' });
      return;
    }

    const typing = Boolean(body.typing);
    const typingHints = getRoundTypingSet();
    const reviewLocks = getRoundReviewLockSet(false);

    if (state.round.stage !== 'collecting_hints' || (reviewLocks && reviewLocks.has(player.id))) {
      typingHints.delete(player.id);
      respond(res, 200, { success: true, typing: false });
      broadcastState();
      return;
    }

    if (typing) {
      typingHints.add(player.id);
    } else {
      typingHints.delete(player.id);
    }

    respond(res, 200, { success: true, typing: typingHints.has(player.id) });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleGuessTyping(req, res) {
  try {
    if (!state.round) {
      respond(res, 409, { error: 'No active round' });
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
      respond(res, 403, { error: 'Only the guesser can set typing status' });
      return;
    }

    const typing = Boolean(body.typing);
    const typingSet = getRoundGuesserTypingSet();

    if (state.round.stage !== 'awaiting_guess') {
      typingSet.delete(player.id);
      respond(res, 200, { success: true, typing: false });
      broadcastState();
      return;
    }

    if (typing) {
      typingSet.add(player.id);
    } else {
      typingSet.delete(player.id);
    }

    respond(res, 200, { success: true, typing: typingSet.has(player.id) });
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
    getRoundTypingSet().clear();
    getRoundGuesserTypingSet().clear();

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

    getRoundGuesserTypingSet().delete(player.id);

    const correct = text.toLowerCase() === state.round.word.toLowerCase();
    state.round.stage = 'round_result';
    state.round.guess = {
      playerId: player.id,
      playerName: player.name,
      avatar: player.avatar || defaultAvatar,
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

    const wantsEliminate = Boolean(body.invalid);
    ensureHintVoteSet(hint);
    if (wantsEliminate) {
      hint.eliminationVotes.add(player.id);
    } else {
      hint.eliminationVotes.delete(player.id);
    }

    recomputeHintConsensus();

    respond(res, 200, {
      success: true,
      votes: hint.eliminationVotes.size
    });
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
    const ended = removePlayer(playerId);
    if (state.players.length === 0) {
      resetGameStateToDefaults();
    }
    respond(res, 200, { success: true });
    if (!ended) {
      broadcastState();
    }
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleUpdateSettings(req, res) {
  try {
    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);

    if (state.round) {
      respond(res, 409, { error: 'Wait for the current round to finish before updating settings' });
      return;
    }

    const hasTotalRounds = Object.prototype.hasOwnProperty.call(body, 'totalRounds');
    const hasDifficulty = Object.prototype.hasOwnProperty.call(body, 'difficulty');

    if (!hasTotalRounds && !hasDifficulty) {
      respond(res, 200, {
        totalRounds: state.gameConfig.totalRounds,
        difficulty: state.settings.difficulty
      });
      return;
    }

    let nextTotal = state.gameConfig.totalRounds;
    if (hasTotalRounds) {
      const normalized = normalizeTotalRounds(body.totalRounds);
      if (normalized === null) {
        respond(res, 400, { error: `Total rounds must be between 1 and ${MAX_TOTAL_ROUNDS}` });
        return;
      }
      nextTotal = normalized;
    }

    let nextDifficulty = state.settings?.difficulty || 'easy';
    if (hasDifficulty) {
      const difficultyRaw = typeof body.difficulty === 'string' ? body.difficulty.toLowerCase() : '';
      if (difficultyRaw === 'hard' || difficultyRaw === 'easy') {
        nextDifficulty = difficultyRaw;
      } else {
        respond(res, 400, { error: 'Difficulty must be "easy" or "hard"' });
        return;
      }
    }

    const totalChanged = nextTotal !== state.gameConfig.totalRounds;
    const difficultyChanged = nextDifficulty !== (state.settings?.difficulty || 'easy');

    if (totalChanged) {
      state.gameConfig.totalRounds = nextTotal;
      resetGameProgress();
    }

    if (!state.settings) {
      state.settings = { difficulty: nextDifficulty };
    } else if (difficultyChanged) {
      state.settings.difficulty = nextDifficulty;
    }

    respond(res, 200, {
      totalRounds: state.gameConfig.totalRounds,
      difficulty: state.settings.difficulty
    });

    if (totalChanged || difficultyChanged) {
      broadcastState();
    }
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleToggleEndVote(req, res) {
  try {
    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);

    if (state.gameOver) {
      respond(res, 409, { error: 'Game already ended' });
      return;
    }

    const vote = Boolean(body.vote);
    if (vote) {
      state.endGameVotes.add(player.id);
    } else {
      state.endGameVotes.delete(player.id);
    }

    const ended = evaluateEndGameVotes();
    respond(res, 200, {
      votes: state.endGameVotes.size,
      required: state.players.length,
      ended
    });
    if (!ended) {
      broadcastState();
    }
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

async function handleResetGame(req, res) {
  try {
    const body = await readBody(req);
    const player = findPlayer(body.playerId);
    if (!player) {
      respond(res, 401, { error: 'Unknown player' });
      return;
    }
    touchPlayer(player);

    if (state.round && !state.gameOver) {
      respond(res, 409, { error: 'Wait for the current round to finish before resetting' });
      return;
    }

    resetGameProgress();
    state.wordDeck = shuffle([...words]);
    state.lastWord = null;
    state.score = { success: 0, failure: 0 };
    if (!state.settings) {
      state.settings = { difficulty: 'easy' };
    } else if (!state.settings.difficulty) {
      state.settings.difficulty = 'easy';
    }
    broadcastState();
    respond(res, 200, { success: true });
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

function normalizeTotalRounds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > MAX_TOTAL_ROUNDS) return null;
  return rounded;
}

function resetGameProgress() {
  state.roundsCompleted = 0;
  state.gameOver = false;
  state.gameOverReason = null;
  state.endGameVotes.clear();
  state.round = null;
  state.score = { success: 0, failure: 0 };
}

function evaluateEndGameVotes() {
  if (state.gameOver) return false;
  const required = state.players.length;
  if (required > 0 && state.endGameVotes.size >= required) {
    endGame('votes');
    return true;
  }
  return false;
}

function endGame(reason, { preserveRound = false, broadcast = true } = {}) {
  if (state.gameOver && reason !== 'reset') {
    return false;
  }
  state.gameOver = true;
  state.gameOverReason = reason;
  state.endGameVotes.clear();
  if (!preserveRound) {
    state.round = null;
  } else if (state.round) {
    state.round.finishedAt = state.round.finishedAt || Date.now();
  }
  if (broadcast) {
    broadcastState();
  }
  return true;
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
  state.endGameVotes.delete(playerId);
  if (state.round) {
    state.round.hints = state.round.hints.filter(h => h.playerId !== playerId);
    const locks = getRoundReviewLockSet();
    locks.delete(playerId);
    maybeEnterReviewStage();
    getRoundGuesserTypingSet().delete(playerId);
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
  recomputeHintConsensus();
  return evaluateEndGameVotes();
}

function resetGameStateToDefaults() {
  state.round = null;
  state.score = { success: 0, failure: 0 };
  state.wordDeck = shuffle([...words]);
  state.lastWord = null;
  state.settings.difficulty = 'easy';
}

function touchPlayer(player) {
  if (player) {
    player.lastSeenAt = Date.now();
  }
}

function applyAvatarToHints(playerId, avatar) {
  if (!state.round || !state.round.hints) return;
  for (const hint of state.round.hints) {
    if (hint.playerId === playerId) {
      hint.avatar = avatar;
    }
  }
}

function getPlayerAvatar(playerId) {
  const player = findPlayer(playerId);
  return player?.avatar || defaultAvatar;
}

function getRoundReviewLockSet(createIfMissing = true) {
  if (!state.round) return new Set();
  const current = state.round.reviewLocks;
  if (current instanceof Set) {
    return current;
  }
  if (Array.isArray(current)) {
    const set = new Set(current);
    if (createIfMissing) {
      state.round.reviewLocks = set;
    }
    return set;
  }
  if (!current) {
    if (createIfMissing) {
      const set = new Set();
      state.round.reviewLocks = set;
      return set;
    }
    return new Set();
  }
  const set = new Set(Array.from(current));
  if (createIfMissing) {
    state.round.reviewLocks = set;
  }
  return set;
}

function maybeEnterReviewStage() {
  if (!state.round || state.round.stage !== 'collecting_hints') {
    return false;
  }

  const hintGiverIds = getHintGiverIds();
  if (hintGiverIds.length === 0) {
    return false;
  }

  const reviewLocks = getRoundReviewLockSet();
  const everyoneLocked = hintGiverIds.every(id => reviewLocks.has(id));
  if (!everyoneLocked) {
    return false;
  }

  const hintOwners = new Set(
    state.round.hints
      .filter(hint => hint && typeof hint.playerId === 'string')
      .map(hint => hint.playerId)
  );
  const allSubmittedHints = hintGiverIds.every(id => hintOwners.has(id));
  if (!allSubmittedHints) {
    return false;
  }

  state.round.stage = 'reviewing_hints';
  getRoundTypingSet().clear();
  return true;
}

function getRoundTypingSet(createIfMissing = true) {
  if (!state.round) return new Set();
  const current = state.round.typingHints;
  if (current instanceof Set) {
    return current;
  }
  if (Array.isArray(current)) {
    const set = new Set(current);
    if (createIfMissing) {
      state.round.typingHints = set;
    }
    return set;
  }
  if (!current) {
    if (createIfMissing) {
      const set = new Set();
      state.round.typingHints = set;
      return set;
    }
    return new Set();
  }
  const set = new Set(Array.from(current));
  if (createIfMissing) {
    state.round.typingHints = set;
  }
  return set;
}

function getRoundGuesserTypingSet(createIfMissing = true) {
  if (!state.round) return new Set();
  const current = state.round.guesserTyping;
  if (current instanceof Set) {
    return current;
  }
  if (Array.isArray(current)) {
    const set = new Set(current);
    if (createIfMissing) {
      state.round.guesserTyping = set;
    }
    return set;
  }
  if (!current) {
    if (createIfMissing) {
      const set = new Set();
      state.round.guesserTyping = set;
      return set;
    }
    return new Set();
  }
  const set = new Set(Array.from(current));
  if (createIfMissing) {
    state.round.guesserTyping = set;
  }
  return set;
}



function shuffle(list) {
  const array = [...list];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function drawWord() {
  refreshWordDeck();
  const nextWord = state.wordDeck.shift();
  state.lastWord = nextWord;
  return nextWord;
}

function refreshWordDeck() {
  if (!state.wordDeck || state.wordDeck.length === 0) {
    state.wordDeck = shuffle([...words]);
    // Avoid giving the same word twice in a row if possible.
    if (state.lastWord && state.wordDeck.length > 1 && state.wordDeck[0] === state.lastWord) {
      const swapIndex = state.wordDeck.findIndex(word => word !== state.lastWord);
      if (swapIndex > 0) {
        [state.wordDeck[0], state.wordDeck[swapIndex]] = [state.wordDeck[swapIndex], state.wordDeck[0]];
      }
    }
  }
}

function serializeState() {
  const hintGiverIds = state.players.filter(p => p.role === 'hint').map(p => p.id);
  const round = state.round
    ? {
        id: state.round.id,
        stage: state.round.stage,
        number: state.round.number ?? state.roundsCompleted + 1,
        hints: state.round.hints.map(hint => ({
          id: hint.id,
          playerId: hint.playerId,
          author: hint.author,
          text: hint.text,
          invalid: hint.invalid,
          avatar: hint.avatar || getPlayerAvatar(hint.playerId),
          eliminationVotes: Array.from(hint.eliminationVotes instanceof Set ? hint.eliminationVotes : Array.isArray(hint.eliminationVotes) ? new Set(hint.eliminationVotes) : new Set())
        })),
        reviewLocks: Array.from(getRoundReviewLockSet(false)),
        typingHints: Array.from(getRoundTypingSet(false)),
        guesserTyping: Array.from(getRoundGuesserTypingSet(false)),
        guess: state.round.guess
          ? {
              playerId: state.round.guess.playerId,
              playerName: state.round.guess.playerName,
              avatar: state.round.guess.avatar || getPlayerAvatar(state.round.guess.playerId),
              text: state.round.guess.text,
              correct: state.round.guess.correct
            }
          : null,
        revealedAt: state.round.revealedAt,
        finishedAt: state.round.finishedAt,
        wordRevealed: state.round.stage === 'round_result',
        chatMessages: Array.isArray(state.round.chatMessages)
          ? state.round.chatMessages.map(message => ({
              id: message.id,
              playerId: message.playerId,
              name: message.name,
              avatar: message.avatar || getPlayerAvatar(message.playerId),
              text: message.text,
              createdAt: message.createdAt
            }))
          : []
      }
    : null;

  if (round && round.wordRevealed) {
    round.word = state.round.word;
  }

  return {
    players: state.players.map(player => ({
      id: player.id,
      name: player.name,
      role: player.role,
      votedToEnd: state.endGameVotes.has(player.id),
      avatar: player.avatar || defaultAvatar
    })),
    round,
    score: state.score,
    leaderboard: buildLeaderboard(),
    game: {
      totalRounds: state.gameConfig.totalRounds,
      maxRounds: MAX_TOTAL_ROUNDS,
      roundsCompleted: state.roundsCompleted,
      gameOver: state.gameOver,
      gameOverReason: state.gameOverReason,
      endGameVotes: {
        voters: Array.from(state.endGameVotes),
        count: state.endGameVotes.size,
        required: state.players.length
      }
    },
    settings: {
      difficulty: state.settings?.difficulty || 'easy'
    },
    availableAvatars: allowedAvatars,
    hintGiverCount: hintGiverIds.length
  };
}

function validateHardModeHint(text) {
  const trimmed = text.trim();
  if (!trimmed) return 'Hint text is required';
  if (containsMultipleWords(trimmed)) return 'Hint cannot contain more than one word';
  if (isProperNounWord(trimmed)) return 'Proper nouns are not allowed';
  return null;
}

async function handlePostChat(req, res) {
  try {
    if (!state.round) {
      respond(res, 409, { error: 'No active round' });
      return;
    }
    const stage = state.round.stage;
    if (!['collecting_hints', 'reviewing_hints'].includes(stage)) {
      respond(res, 409, { error: 'Chat is only available while preparing clues' });
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
      respond(res, 403, { error: 'Only hint-givers can chat here' });
      return;
    }

    const rawText = typeof body.text === 'string' ? body.text : String(body.text ?? '');
    const text = rawText.trim();
    if (!text) {
      respond(res, 400, { error: 'Message cannot be empty' });
      return;
    }
    const limited = text.length > MAX_CHAT_LENGTH ? text.slice(0, MAX_CHAT_LENGTH).trim() : text;

    if (!Array.isArray(state.round.chatMessages)) {
      state.round.chatMessages = [];
    }

    state.round.chatMessages.push({
      id: randomUUID(),
      playerId: player.id,
      name: player.name,
      avatar: player.avatar || defaultAvatar,
      text: limited,
      createdAt: Date.now()
    });

    if (state.round.chatMessages.length > MAX_CHAT_HISTORY) {
      state.round.chatMessages.splice(0, state.round.chatMessages.length - MAX_CHAT_HISTORY);
    }

    respond(res, 200, { success: true });
    broadcastState();
  } catch (err) {
    respond(res, 400, { error: err.message });
  }
}

function ensureHintVoteSet(hint) {
  if (!hint) return;
  if (hint.eliminationVotes instanceof Set) return;
  if (Array.isArray(hint.eliminationVotes)) {
    hint.eliminationVotes = new Set(hint.eliminationVotes);
    return;
  }
  if (hint.eliminationVotes && typeof hint.eliminationVotes === 'object') {
    hint.eliminationVotes = new Set(Object.values(hint.eliminationVotes));
    return;
  }
  hint.eliminationVotes = new Set();
}

function getHintGiverIds() {
  return state.players.filter(p => p.role === 'hint').map(p => p.id);
}

function recomputeHintConsensus() {
  if (!state.round || !Array.isArray(state.round.hints)) return;
  const hintGiverIds = getHintGiverIds();
  const required = hintGiverIds.length;
  state.round.hints.forEach(hint => {
    ensureHintVoteSet(hint);
    for (const voter of Array.from(hint.eliminationVotes)) {
      if (!hintGiverIds.includes(voter)) {
        hint.eliminationVotes.delete(voter);
      }
    }
    hint.invalid = required > 0 && hintGiverIds.every(id => hint.eliminationVotes.has(id));
  });
}

function containsMultipleWords(text) {
  if (/\s/.test(text)) return true;
  if (/[\-_/]/.test(text)) return true;
  if (/[a-z][A-Z]/.test(text)) return true;
  const alphaOnly = text.replace(/[^A-Za-z]/g, '');
  if (!alphaOnly) return false;
  if (alphaOnly.length >= 6 && looksLikeCompoundWord(alphaOnly.toLowerCase())) return true;
  return false;
}

function isProperNounWord(word) {
  const parts = word.split(/[^A-Za-z]+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some(part => {
    if (part.length <= 1) return false;
    if (/^[A-Z][a-z]+$/.test(part)) return true;
    if (/^[A-Z]{2,}$/.test(part)) return true;
    return false;
  });
}

function looksLikeCompoundWord(word) {
  for (const prefix of COMPOUND_PREFIXES) {
    if (word.startsWith(prefix) && word.length - prefix.length >= 3) {
      const suffix = word.slice(prefix.length);
      if (COMPOUND_SUFFIXES.includes(suffix) || COMPOUND_PREFIXES.includes(suffix) || COMMON_WORD_PARTS.has(suffix)) {
        return true;
      }
    }
  }
  return false;
}

function syncPlayerStats(playerId, name) {
  const stats = getPlayerStats(playerId, name);
  stats.name = name;
  stats.avatar = getPlayerAvatar(playerId);
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
      avatar: defaultAvatar,
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
  state.roundsCompleted += 1;
  if (state.roundsCompleted >= state.gameConfig.totalRounds) {
    endGame('completed', { preserveRound: true, broadcast: false });
  }
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

    stats.avatar = hint.avatar || getPlayerAvatar(hint.playerId);

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
      byPlayer: {},
      updatedAt: Date.now()
    };
  }

  const entries = allStats.map(stats => {
    const metrics = calculateMetrics(stats);
    return {
      playerId: stats.playerId,
      name: stats.name,
      avatar: stats.avatar || defaultAvatar,
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

  const byPlayer = {};
  for (const entry of entries) {
    byPlayer[entry.playerId] = entry;
  }

  return {
    global,
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
