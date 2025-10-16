const joinSection = document.getElementById('join-section');
const joinForm = document.getElementById('join-form');
const nameInput = document.getElementById('name-input');
const roleSelect = document.getElementById('role-select');
const gameSection = document.getElementById('game-section');
const playerInfo = document.getElementById('player-info');
const stageIndicator = document.getElementById('stage-indicator');
const scoreboardEl = document.getElementById('scoreboard');
const playersEl = document.getElementById('players');
const controlsEl = document.getElementById('controls');
const roundEl = document.getElementById('round');
const messagesEl = document.getElementById('messages');
const sharePanel = document.getElementById('share-panel');
const shareLinkInput = document.getElementById('share-link');
const copyShareButton = document.getElementById('copy-share');
const shareHint = document.getElementById('share-hint');
const joinAvatarSelect = document.getElementById('join-avatar-select');
const joinAvatarPreview = document.getElementById('join-avatar-preview');
const joinChangeAvatarButton = document.getElementById('join-change-avatar');
const avatarModal = document.getElementById('avatar-modal');
const avatarGrid = document.getElementById('avatar-grid');
const avatarModalClose = document.getElementById('avatar-modal-close');
const avatarModalBackdrop = document.getElementById('avatar-modal-backdrop');

const AVATAR_OPTIONS = [
  { id: 'default', label: 'Classic', emoji: '👤', background: 'linear-gradient(135deg, #444b5a, #242b38)' },
  { id: 'astronaut', label: 'Astronaut', emoji: '👩‍🚀', background: 'linear-gradient(135deg, #4338ca, #1f2937)' },
  { id: 'aurora', label: 'Aurora', emoji: '🌌', background: 'linear-gradient(135deg, #22d3ee, #6366f1)' },
  { id: 'basketball', label: 'Hoops', emoji: '🏀', background: 'linear-gradient(135deg, #f97316, #1f2937)' },
  { id: 'beach', label: 'Beach Day', emoji: '🏖️', background: 'linear-gradient(135deg, #facc15, #38bdf8)' },
  { id: 'bot', label: 'Buddy Bot', emoji: '🤖', background: 'linear-gradient(135deg, #71717a, #0f172a)' },
  { id: 'cactus', label: 'Cactus', emoji: '🌵', background: 'linear-gradient(135deg, #22c55e, #14532d)' },
  { id: 'camera', label: 'Snapshot', emoji: '📸', background: 'linear-gradient(135deg, #fbbf24, #1f2937)' },
  { id: 'chef', label: 'Chef', emoji: '👩‍🍳', background: 'linear-gradient(135deg, #fb7185, #be123c)' },
  { id: 'cloud', label: 'Cloud', emoji: '☁️', background: 'linear-gradient(135deg, #38bdf8, #1d4ed8)' },
  { id: 'compass', label: 'Navigator', emoji: '🧭', background: 'linear-gradient(135deg, #fbbf24, #1e293b)' },
  { id: 'comet', label: 'Comet', emoji: '☄️', background: 'linear-gradient(135deg, #f97316, #7c3aed)' },
  { id: 'controller', label: 'Player 1', emoji: '🎮', background: 'linear-gradient(135deg, #6366f1, #1f2937)' },
  { id: 'crystal', label: 'Crystal', emoji: '🔮', background: 'linear-gradient(135deg, #a855f7, #581c87)' },
  { id: 'dino', label: 'Dino', emoji: '🦕', background: 'linear-gradient(135deg, #2dd4bf, #064e3b)' },
  { id: 'fox', label: 'Fox', emoji: '🦊', background: 'linear-gradient(135deg, #f97316, #7f1d1d)' },
  { id: 'galaxy', label: 'Galaxy', emoji: '🪐', background: 'linear-gradient(135deg, #7c3aed, #1e1b4b)' },
  { id: 'guitar', label: 'Guitar', emoji: '🎸', background: 'linear-gradient(135deg, #f97316, #7c3aed)' },
  { id: 'koala', label: 'Koala', emoji: '🐨', background: 'linear-gradient(135deg, #94a3b8, #1f2937)' },
  { id: 'lantern', label: 'Lantern', emoji: '🏮', background: 'linear-gradient(135deg, #fb7185, #7f1d1d)' },
  { id: 'leaf', label: 'Leaf', emoji: '🍃', background: 'linear-gradient(135deg, #4ade80, #166534)' },
  { id: 'meteor', label: 'Meteor', emoji: '🛰️', background: 'linear-gradient(135deg, #38bdf8, #0f172a)' },
  { id: 'mountain', label: 'Summit', emoji: '🏔️', background: 'linear-gradient(135deg, #38bdf8, #0f172a)' },
  { id: 'music', label: 'Melody', emoji: '🎵', background: 'linear-gradient(135deg, #a855f7, #2563eb)' },
  { id: 'owl', label: 'Night Owl', emoji: '🦉', background: 'linear-gradient(135deg, #6366f1, #111827)' },
  { id: 'palette', label: 'Artist', emoji: '🎨', background: 'linear-gradient(135deg, #f59e0b, #ec4899)' },
  { id: 'panda', label: 'Panda', emoji: '🐼', background: 'linear-gradient(135deg, #475569, #111827)' },
  { id: 'pizza', label: 'Slice', emoji: '🍕', background: 'linear-gradient(135deg, #f97316, #7f1d1d)' },
  { id: 'rocket', label: 'Rocket', emoji: '🚀', background: 'linear-gradient(135deg, #38bdf8, #1d4ed8)' },
  { id: 'sakura', label: 'Sakura', emoji: '🌸', background: 'linear-gradient(135deg, #f472b6, #a855f7)' },
  { id: 'sailboat', label: 'Sailor', emoji: '⛵', background: 'linear-gradient(135deg, #38bdf8, #1e293b)' },
  { id: 'shuttle', label: 'Shuttle', emoji: '🛸', background: 'linear-gradient(135deg, #7c3aed, #0f172a)' },
  { id: 'sloth', label: 'Sloth', emoji: '🦥', background: 'linear-gradient(135deg, #94a3b8, #1f2937)' },
  { id: 'snow', label: 'Snow', emoji: '❄️', background: 'linear-gradient(135deg, #38bdf8, #1e293b)' },
  { id: 'spacesuit', label: 'Suit Up', emoji: '👨‍🚀', background: 'linear-gradient(135deg, #4c1d95, #0f172a)' },
  { id: 'sunset', label: 'Sunset', emoji: '🌅', background: 'linear-gradient(135deg, #f97316, #f43f5e)' },
  { id: 'surf', label: 'Surf', emoji: '🏄', background: 'linear-gradient(135deg, #38bdf8, #0ea5e9)' },
  { id: 'telescope', label: 'Observer', emoji: '🔭', background: 'linear-gradient(135deg, #38bdf8, #312e81)' },
  { id: 'tropical', label: 'Tropical', emoji: '🌴', background: 'linear-gradient(135deg, #34d399, #065f46)' }
];

const avatarLookup = new Map(AVATAR_OPTIONS.map(option => [option.id, option]));

let player = null;
let serverState = null;
let eventSource = null;
let fetchWordInFlight = false;
let lastKnownRoundId = null;
let lastKnownStage = null;
let currentWord = null;
let buttonFeedbackInitialized = false;
let audioContext = null;
let pendingAvatarId = 'default';

init();

function init() {
  joinForm.addEventListener('submit', handleJoinSubmit);
  copyShareButton.addEventListener('click', handleCopyShareLink);
  joinChangeAvatarButton.addEventListener('click', openAvatarModal);
  avatarModalClose.addEventListener('click', closeAvatarModal);
  avatarModalBackdrop.addEventListener('click', closeAvatarModal);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !avatarModal.classList.contains('hidden')) {
      closeAvatarModal();
    }
  });
  window.addEventListener('beforeunload', handleBeforeUnload);

  updateJoinAvatarPreview();
  renderAvatarGrid(pendingAvatarId);
  setupButtonFeedback();

  restorePlayer().catch(err => {
    console.warn('Failed to restore player', err);
  });
  openEventStream();
}

async function restorePlayer() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem('just-one-player'));
  } catch (err) {
    console.warn('Failed to read cached player', err);
  }

  if (!stored || !stored.id || !stored.name || !stored.role) {
    player = null;
    pendingAvatarId = sanitizeAvatarId(null);
    updateJoinAvatarPreview();
    updateLayout();
    return;
  }

  nameInput.value = stored.name;
  roleSelect.value = stored.role;
  pendingAvatarId = sanitizeAvatarId(stored.avatar);
  updateJoinAvatarPreview();

  try {
    const { player: refreshed } = await silentlyRejoin(stored);
    player = refreshed;
    localStorage.setItem('just-one-player', JSON.stringify(refreshed));
    pendingAvatarId = sanitizeAvatarId(refreshed.avatar);
  } catch (err) {
    console.warn('Failed to restore session', err);
    localStorage.removeItem('just-one-player');
    player = null;
    pendingAvatarId = sanitizeAvatarId(null);
  }

  updateJoinAvatarPreview();
  updateLayout();
}

async function silentlyRejoin(existing) {
  return apiPost('/api/join', {
    playerId: existing.id,
    name: existing.name,
    role: existing.role,
    avatar: existing.avatar
  }, { silent: true });
}

function openEventStream() {
  eventSource = new EventSource('/events');
  eventSource.onmessage = event => {
    try {
      const parsed = JSON.parse(event.data);
      serverState = parsed;
      onStateChange();
    } catch (err) {
      console.error('Failed to parse SSE payload', err);
    }
  };
  eventSource.onerror = () => {
    showMessage('Connection lost. Retrying…', 'error');
  };
}

function onStateChange() {
  if (player && serverState) {
    const match = serverState.players?.find(p => p.id === player.id);
    if (match) {
      player = { ...player, ...match };
      pendingAvatarId = sanitizeAvatarId(match.avatar);
      updateJoinAvatarPreview();
      localStorage.setItem('just-one-player', JSON.stringify(player));
    }
  }

  const round = serverState?.round;
  const roundId = round?.id ?? null;
  const stage = round?.stage ?? null;

  if (player && serverState && !serverState.players.some(p => p.id === player.id)) {
    player = null;
    localStorage.removeItem('just-one-player');
    pendingAvatarId = sanitizeAvatarId(null);
    updateJoinAvatarPreview();
    lastKnownRoundId = roundId;
    lastKnownStage = stage;
    updateLayout();
    return;
  }

  if (!round) {
    currentWord = null;
  }

  if (player && round && roundId !== lastKnownRoundId) {
    currentWord = null;
  }

  if (player && round && stage !== lastKnownStage) {
    if (player.role === 'hint') {
      fetchWordForHint();
    }
    if (round.stage === 'round_result' && round.word) {
      currentWord = round.word;
    }
  }

  if (player && round && !['collecting_hints', 'reviewing_hints', 'round_result'].includes(round.stage)) {
    if (round.stage !== 'round_result') {
      currentWord = null;
    }
  }

  lastKnownRoundId = roundId;
  lastKnownStage = stage;
  updateLayout();
}

async function fetchWordForHint() {
  const round = serverState?.round;
  if (!round) {
    currentWord = null;
    updateLayout();
    return;
  }
  const allowedStages = ['collecting_hints', 'reviewing_hints'];
  if (!allowedStages.includes(round.stage)) {
    if (round.stage === 'round_result' && round.word) {
      currentWord = round.word;
    } else {
      currentWord = null;
    }
    updateLayout();
    return;
  }
  if (fetchWordInFlight) return;
  if (!player) return;
  fetchWordInFlight = true;
  try {
    const response = await fetch(`/api/round/word?playerId=${encodeURIComponent(player.id)}`);
    if (response.ok) {
      const data = await response.json();
      currentWord = data.word;
      updateLayout();
    }
  } catch (err) {
    console.error('Failed to fetch word', err);
  } finally {
    fetchWordInFlight = false;
  }
}

async function handleJoinSubmit(event) {
  event.preventDefault();
  const name = nameInput.value.trim();
  const role = roleSelect.value;
  if (!name) {
    showMessage('Pick a name first!', 'error');
    return;
  }
  if (!role) {
    showMessage('Choose a role before joining.', 'error');
    return;
  }
  const payload = { name, role, avatar: pendingAvatarId };
  if (player?.id) {
    payload.playerId = player.id;
  }

  try {
    const { player: joined } = await apiPost('/api/join', payload);
    player = joined;
    pendingAvatarId = sanitizeAvatarId(joined.avatar);
    localStorage.setItem('just-one-player', JSON.stringify(joined));
    roleSelect.value = joined.role;
    updateJoinAvatarPreview();
    updateLayout();
    showMessage(`Joined as ${joined.name}`);
    closeAvatarModal();
  } catch (err) {
    // error already surfaced by apiPost
  }
}

function updateLayout() {
  if (!player) {
    joinSection.classList.remove('hidden');
    gameSection.classList.add('hidden');
    joinAvatarSelect.classList.remove('hidden');
    playerInfo.innerHTML = '';
    stageIndicator.textContent = '';
    scoreboardEl.textContent = '';
    playersEl.innerHTML = '';
    controlsEl.innerHTML = '';
    roundEl.innerHTML = '';
    renderSharePanel();
    return;
  }

  joinSection.classList.add('hidden');
  gameSection.classList.remove('hidden');
  joinAvatarSelect.classList.add('hidden');

  renderPlayerInfo();
  renderSharePanel();
  renderPlayers();
  renderScore();
  renderControls();
  renderRound();
}

function renderSharePanel() {
  if (!sharePanel) return;
  if (!player) {
    sharePanel.classList.add('hidden');
    return;
  }

  sharePanel.classList.remove('hidden');
  shareLinkInput.value = window.location.origin;

  if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    shareHint.textContent = 'Friends must replace "localhost" with your computer\'s IP address before joining.';
  } else {
    shareHint.textContent = 'Share this address with friends so they can join the same table.';
  }
}

function renderPlayerInfo() {
  playerInfo.innerHTML = '';

  if (!player) {
    playerInfo.textContent = 'Enter a name and choose a role to join the table.';
    return;
  }

  const identity = document.createElement('div');
  identity.className = 'player-identity';

  const avatarEl = document.createElement('div');
  avatarEl.className = 'avatar';
  applyAvatarVisual(avatarEl, player.avatar);
  identity.appendChild(avatarEl);

  const summary = document.createElement('div');
  summary.className = 'identity-summary';
  summary.innerHTML = `<strong>${escapeHtml(player.name)}</strong> — ${player.role === 'guesser' ? 'Guesser' : 'Hint giver'}`;
  identity.appendChild(summary);

  playerInfo.appendChild(identity);

  const round = serverState?.round;

  if (!round) {
    const prompt = document.createElement('div');
    prompt.className = 'info-card subtle';
    prompt.textContent = 'Start a round to begin the fun.';
    playerInfo.appendChild(prompt);
  } else if (round.stage === 'round_result') {
    const prompt = document.createElement('div');
    prompt.className = 'info-card subtle';
    prompt.textContent = 'Round complete! Adjust your avatar before the next word if you like.';
    playerInfo.appendChild(prompt);
  } else {
    const notice = document.createElement('div');
    notice.className = 'roles-locked';
    notice.textContent = 'Roles and avatars are locked until this round is complete.';
    playerInfo.appendChild(notice);
  }

  const actions = document.createElement('div');
  actions.className = 'player-actions';
  const leaveButton = document.createElement('button');
  leaveButton.type = 'button';
  leaveButton.textContent = 'Leave table';
  leaveButton.addEventListener('click', handleLeaveTable);
  actions.appendChild(leaveButton);
  playerInfo.appendChild(actions);
}

function renderPlayers() {
  if (!serverState) {
    playersEl.innerHTML = '';
    return;
  }
  const guessers = serverState.players.filter(p => p.role === 'guesser');
  const hints = serverState.players.filter(p => p.role === 'hint');

  playersEl.innerHTML = `
    <div class="player-list">
      <strong>Guesser:</strong>
      ${guessers.length ? guessers.map(renderPlayerBadge).join('') : '<span class="empty">(none)</span>'}
    </div>
    <div class="player-list">
      <strong>Hint givers:</strong>
      ${hints.length ? hints.map(renderPlayerBadge).join('') : '<span class="empty">(none)</span>'}
    </div>
  `;
}

function renderPlayerBadge(playerRecord) {
  const avatar = getAvatarOption(playerRecord.avatar);
  const emoji = avatar.emoji;
  const background = avatar.background;
  const title = avatar.label;
  return `<span><span class="chip-avatar" style="background:${background}" title="${escapeHtml(title)}">${emoji}</span>${escapeHtml(playerRecord.name)}</span>`;
}

function renderScore() {
  if (!serverState) {
    stageIndicator.textContent = '';
    scoreboardEl.textContent = '';
    return;
  }
  const stage = serverState.round?.stage ?? 'waiting';
  stageIndicator.textContent = formatStage(stage);
  const { success, failure } = serverState.score;
  scoreboardEl.textContent = `Score: ${success} correct · ${failure} misses`;
}

function renderControls() {
  controlsEl.innerHTML = '';
  if (!player || !serverState) return;

  const round = serverState.round;
  if (!round) {
    if (player.role === 'hint') {
      controlsEl.appendChild(buildButton('Start new round', () => startRound()));
    }
    setControlsMessage('Waiting for a hint giver to start the first round.');
    return;
  }

  switch (round.stage) {
    case 'collecting_hints':
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Review collisions', () => beginReview(), round.hints.length === 0));
      }
      setControlsMessage(player.role === 'hint' ? 'Gather clues then review collisions together.' : 'Hint givers are preparing their clues.');
      break;
    case 'reviewing_hints':
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Reveal valid clues to guesser', () => revealClues()));
      }
      setControlsMessage('Hint givers are resolving collisions.');
      break;
    case 'awaiting_guess':
      if (player.role === 'guesser') {
        const form = document.createElement('form');
        form.className = 'guess-form';
        form.innerHTML = `
          <label>
            <span>Your guess</span>
            <input type="text" name="guess" autocomplete="off" required />
          </label>
          <button type="submit">Submit guess</button>
        `;
        form.addEventListener('submit', async evt => {
          evt.preventDefault();
          const formData = new FormData(form);
          const guess = (formData.get('guess') || '').toString().trim();
          if (!guess) {
            showMessage('Enter a guess first.', 'error');
            return;
          }
          await submitGuess(guess);
          form.reset();
        });
        controlsEl.appendChild(form);
      }
      setControlsMessage(player.role === 'guesser' ? 'Take your time—make that single guess count.' : 'Waiting for the guesser to decide.');
      break;
    case 'round_result':
      setControlsMessage('Review the result, then start the next round when ready.');
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Start next round', () => startRound()));
      }
      break;
    default:
      controlsEl.innerHTML = '';
  }
}

function setControlsMessage(text) {
  const message = document.createElement('div');
  message.className = 'info-card subtle';
  message.textContent = text;
  controlsEl.appendChild(message);
}

function renderRound() {
  roundEl.innerHTML = '';
  if (!player || !serverState) return;

  const round = serverState.round;
  if (!round) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No round in progress yet.';
    roundEl.appendChild(empty);
    return;
  }

  if (player.role === 'hint' && currentWord) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = currentWord;
    roundEl.appendChild(card);
  }

  const stage = round.stage;

  if (round.hints.length > 0) {
    const guesserWaiting = player.role === 'guesser' && !['awaiting_guess', 'round_result'].includes(stage);

    if (guesserWaiting) {
      const message = document.createElement('div');
      message.className = 'info-card subtle';
      message.textContent = stage === 'reviewing_hints'
        ? 'Hint givers are reviewing collisions. Hang tight!'
        : 'Hint givers are preparing their clues.';
      roundEl.appendChild(message);
    } else {
      const list = document.createElement('ul');
      list.className = 'hint-list';

      const canSeeText = player.role === 'hint'
        || stage === 'round_result'
        || (player.role === 'guesser' && stage === 'awaiting_guess');

      const hintsForDisplay = player.role === 'guesser' && stage === 'awaiting_guess'
        ? round.hints.filter(h => !h.invalid)
        : round.hints;

      hintsForDisplay.forEach(hint => {
        const li = document.createElement('li');
        li.className = 'hint-item';
        if (hint.invalid) {
          li.classList.add('invalid');
        }

        const text = canSeeText ? hint.text : hint.playerId === player.id ? hint.text : 'Submitted';
        const content = document.createElement('div');
        const textLine = document.createElement('div');
        textLine.textContent = text;
        content.appendChild(textLine);

        if (player.role === 'hint' || stage === 'round_result') {
          const meta = document.createElement('div');
          meta.className = 'meta meta-avatar';
          const chip = document.createElement('span');
          chip.className = 'chip-avatar';
          const author = findPlayerById(hint.playerId);
          applyAvatarVisual(chip, author?.avatar);
          meta.appendChild(chip);
          const name = document.createElement('span');
          name.textContent = hint.author;
          meta.appendChild(name);
          content.appendChild(meta);
        }

        li.appendChild(content);

        if (player.role === 'hint' && stage === 'reviewing_hints') {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.textContent = hint.invalid ? 'Restore' : 'Eliminate';
          toggle.addEventListener('click', () => toggleHint(hint));
          li.appendChild(toggle);
        }

        if (stage === 'awaiting_guess' && player.role === 'guesser') {
          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = 'Valid clue';
          li.appendChild(meta);
        }

        list.appendChild(li);
      });

      roundEl.appendChild(list);
    }
  } else if (player.role === 'guesser' && stage !== 'round_result') {
    const placeholder = document.createElement('div');
    placeholder.className = 'info-card subtle';
    placeholder.textContent = stage === 'reviewing_hints'
      ? 'Hint givers are reviewing clues before revealing them.'
      : 'Waiting for hint givers to submit their clues.';
    roundEl.appendChild(placeholder);
  }

  if (round.stage === 'collecting_hints' && player.role === 'hint') {
    const form = document.createElement('form');
    form.className = 'clue-form';
    const existing = round.hints.find(h => h.playerId === player.id);
    form.innerHTML = `
      <label>
        <span>Your clue</span>
        <textarea name="clue" maxlength="32" placeholder="Single word"></textarea>
      </label>
      <button type="submit">Submit clue</button>
    `;
    const textarea = form.querySelector('textarea');
    if (existing) {
      textarea.value = existing.text;
    }
    form.addEventListener('submit', async evt => {
      evt.preventDefault();
      const value = textarea.value.trim();
      if (!value) {
        showMessage('Clue cannot be empty.', 'error');
        return;
      }
      await submitHint(value);
    });
    roundEl.appendChild(form);
  }

  if (round.stage === 'round_result') {
    const summary = document.createElement('div');
    summary.className = 'round-summary';
    const guessText = round.guess?.text ?? '(no guess)';
    const outcome = round.guess?.correct ? 'Correct!' : 'Missed';
    const word = round.word ?? currentWord ?? 'Unknown';
    summary.innerHTML = `
      <h3>Round summary</h3>
      <p>Word: <strong>${escapeHtml(word)}</strong></p>
      <p>Guess: <strong>${escapeHtml(guessText)}</strong> — ${outcome}</p>
    `;
    roundEl.appendChild(summary);
  }
}

async function startRound() {
  if (!player) return;
  try {
    await apiPost('/api/round/start', { playerId: player.id });
    showMessage('New round starting…');
  } catch (err) {
    // message already shown
  }
}

async function beginReview() {
  if (!player) return;
  try {
    await apiPost('/api/round/begin-review', { playerId: player.id });
  } catch (err) {}
}

async function revealClues() {
  if (!player) return;
  try {
    await apiPost('/api/round/reveal', { playerId: player.id });
    showMessage('Clues revealed to guesser.');
  } catch (err) {}
}

async function submitGuess(guess) {
  if (!player) return;
  await apiPost('/api/round/guess', { playerId: player.id, text: guess });
}

async function submitHint(text) {
  if (!player) return;
  await apiPost('/api/hints', { playerId: player.id, text });
  showMessage('Hint submitted.');
}

async function toggleHint(hint) {
  if (!player) return;
  await apiPost(`/api/hints/${hint.id}/mark`, { playerId: player.id, invalid: !hint.invalid });
}

function buildButton(label, handler, disabled = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.disabled = Boolean(disabled);
  btn.addEventListener('click', handler);
  return btn;
}

function formatStage(stage) {
  switch (stage) {
    case 'collecting_hints':
      return 'Stage: Collecting hints';
    case 'reviewing_hints':
      return 'Stage: Reviewing collisions';
    case 'awaiting_guess':
      return 'Stage: Awaiting guess';
    case 'round_result':
      return 'Stage: Round result';
    default:
      return 'Waiting to start';
  }
}

async function apiPost(path, payload, { silent } = {}) {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.error || 'Request failed');
    }
    return await response.json();
  } catch (err) {
    if (!silent) {
      showMessage(err.message, 'error');
    }
    throw err;
  }
}

function showMessage(text, type = 'info') {
  const message = document.createElement('div');
  message.className = `toast ${type === 'error' ? 'error' : ''}`;
  message.textContent = text;
  messagesEl.appendChild(message);
  setTimeout(() => {
    message.remove();
  }, 3000);
}

async function handleCopyShareLink() {
  const value = shareLinkInput.value;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      showMessage('Link copied to clipboard.');
    } else {
      shareLinkInput.focus();
      shareLinkInput.select();
      const ok = document.execCommand('copy');
      if (ok) {
        showMessage('Link copied to clipboard.');
      } else {
        throw new Error('Copy not supported');
      }
    }
  } catch (err) {
    showMessage('Copy failed. You can copy the link manually.', 'error');
  }
}

async function handleLeaveTable() {
  if (!player) return;
  const leavingId = player.id;
  try {
    await apiPost('/api/player/leave', { playerId: leavingId }, { silent: true });
  } catch (err) {
    console.warn('Failed to notify leave', err);
  }
  localStorage.removeItem('just-one-player');
  player = null;
  nameInput.value = '';
  roleSelect.value = '';
  pendingAvatarId = sanitizeAvatarId(null);
  updateJoinAvatarPreview();
  updateLayout();
  showMessage('You left the table.');
}

function handleBeforeUnload() {
  if (!player?.id || !navigator.sendBeacon) return;
  try {
    const payload = JSON.stringify({ playerId: player.id });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/player/leave', blob);
  } catch (err) {
    // ignore; page is closing
  }
}

function openAvatarModal() {
  renderAvatarGrid(pendingAvatarId);
  avatarModal.classList.remove('hidden');
}

function closeAvatarModal() {
  avatarModal.classList.add('hidden');
}

function renderAvatarGrid(selectedId) {
  if (!avatarGrid) return;
  avatarGrid.innerHTML = '';
  const current = sanitizeAvatarId(selectedId);
  AVATAR_OPTIONS.forEach(option => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'avatar-option';
    item.setAttribute('aria-label', option.label);
    item.title = option.label;
    if (option.id === current) {
      item.classList.add('selected');
    }

    const circle = document.createElement('div');
    circle.className = 'avatar-circle';
    circle.style.background = option.background;
    circle.textContent = option.emoji;
    item.appendChild(circle);

    const label = document.createElement('span');
    label.textContent = option.label;
    item.appendChild(label);

    item.addEventListener('click', () => handleAvatarSelection(option.id));
    avatarGrid.appendChild(item);
  });
}

function handleAvatarSelection(avatarId) {
  pendingAvatarId = sanitizeAvatarId(avatarId);
  updateJoinAvatarPreview();
  closeAvatarModal();
}

function updateJoinAvatarPreview() {
  if (!joinAvatarPreview) return;
  const option = getAvatarOption(pendingAvatarId);
  joinAvatarPreview.style.background = option.background;
  joinAvatarPreview.textContent = option.emoji;
  joinAvatarPreview.title = `Selected avatar: ${option.label}`;
}

function getAvatarOption(id) {
  const key = sanitizeAvatarId(id);
  return avatarLookup.get(key) ?? avatarLookup.get('default');
}

function sanitizeAvatarId(value) {
  if (!value || typeof value !== 'string') return 'default';
  const trimmed = value.trim().toLowerCase();
  return avatarLookup.has(trimmed) ? trimmed : 'default';
}

function applyAvatarVisual(element, avatarId) {
  if (!element) return;
  const option = getAvatarOption(avatarId);
  element.style.background = option.background;
  element.textContent = option.emoji;
  element.title = option.label;
}

function findPlayerById(playerId) {
  return serverState?.players?.find(p => p.id === playerId) ?? null;
}

function setupButtonFeedback() {
  if (buttonFeedbackInitialized) return;
  buttonFeedbackInitialized = true;
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    triggerButtonPulse(button);
    playClickSound();
  });
}

function triggerButtonPulse(button) {
  if (isMotionReduced()) return;
  button.classList.remove('pulse');
  void button.offsetWidth;
  button.classList.add('pulse');
  window.setTimeout(() => {
    button.classList.remove('pulse');
  }, 280);
}

function playClickSound() {
  if (isMotionReduced()) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(420, now);
    oscillator.frequency.exponentialRampToValueAtTime(640, now + 0.14);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  } catch (err) {
    // Autoplay restrictions etc. are safe to ignore.
  }
}

function isMotionReduced() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

function escapeHtml(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
