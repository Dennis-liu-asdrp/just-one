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
const gameColumns = document.getElementById('game-columns');
const leaderboardPanel = document.getElementById('leaderboard-panel');
const leaderboardList = document.getElementById('leaderboard-list');
const personalStatsSection = document.getElementById('personal-stats');
const leaderboardTabs = leaderboardPanel ? Array.from(leaderboardPanel.querySelectorAll('.leaderboard-tab')) : [];

let leaderboardView = 'room';

let player = null;
let serverState = null;
let eventSource = null;
let fetchWordInFlight = false;
let lastKnownRoundId = null;
let lastKnownStage = null;
let currentWord = null;

init();

function init() {
  joinForm.addEventListener('submit', handleJoinSubmit);
  copyShareButton.addEventListener('click', handleCopyShareLink);
  window.addEventListener('beforeunload', handleBeforeUnload);
  leaderboardTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view === 'global' ? 'global' : 'room';
      if (view === leaderboardView) return;
      leaderboardView = view;
      leaderboardTabs.forEach(btn => btn.classList.toggle('active', btn === tab));
      renderLeaderboard();
    });
  });
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
    updateLayout();
    return;
  }

  nameInput.value = stored.name;
  roleSelect.value = stored.role;

  try {
    const { player: refreshed } = await silentlyRejoin(stored);
    player = refreshed;
    localStorage.setItem('just-one-player', JSON.stringify(refreshed));
  } catch (err) {
    console.warn('Failed to restore session', err);
    localStorage.removeItem('just-one-player');
    player = null;
  }

  updateLayout();
}

async function silentlyRejoin(existing) {
  return apiPost('/api/join', {
    playerId: existing.id,
    name: existing.name,
    role: existing.role
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
  const round = serverState?.round;
  const roundId = round?.id ?? null;
  const stage = round?.stage ?? null;

  if (player && serverState && !serverState.players.some(p => p.id === player.id)) {
    player = null;
    localStorage.removeItem('just-one-player');
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
  const payload = { name, role };
  if (player?.id) {
    payload.playerId = player.id;
  }

  try {
    const { player: joined } = await apiPost('/api/join', payload);
    player = joined;
    localStorage.setItem('just-one-player', JSON.stringify(joined));
    roleSelect.value = joined.role;
    updateLayout();
    showMessage(`Joined as ${joined.name}`);
  } catch (err) {
    // error already surfaced by apiPost
  }
}

function updateLayout() {
  if (!player) {
    joinSection.classList.remove('hidden');
    gameSection.classList.add('hidden');
    playerInfo.innerHTML = '';
    stageIndicator.textContent = '';
    scoreboardEl.textContent = '';
    playersEl.innerHTML = '';
    controlsEl.innerHTML = '';
    roundEl.innerHTML = '';
    renderSharePanel();
    renderLeaderboard();
    return;
  }

  joinSection.classList.add('hidden');
  gameSection.classList.remove('hidden');

  renderPlayerInfo();
  renderSharePanel();
  renderPlayers();
  renderScore();
  renderControls();
  renderRound();
  renderLeaderboard();
}

function renderSharePanel() {
  if (!sharePanel) return;
  if (!player) {
    sharePanel.classList.add('hidden');
    return;
  }

  sharePanel.classList.remove('hidden');
  const origin = window.location.origin;
  shareLinkInput.value = origin;

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

  const summary = document.createElement('div');
  summary.innerHTML = `<strong>${escapeHtml(player.name)}</strong> — ${player.role === 'guesser' ? 'Guesser' : 'Hint giver'}`;
  playerInfo.appendChild(summary);

  if (!serverState?.round) {
    const prompt = document.createElement('div');
    prompt.textContent = 'Start a round to begin the fun.';
    playerInfo.appendChild(prompt);
  }

  const form = document.createElement('form');
  form.className = 'identity-form';
  form.innerHTML = `
    <div class="form-field">
      <label>
        <span>Name</span>
        <input type="text" name="name" maxlength="24" autocomplete="off" value="${escapeHtml(player.name)}" required />
      </label>
    </div>
    <div class="form-field">
      <label>
        <span>Role</span>
        <select name="role">
          <option value="guesser"${player.role === 'guesser' ? ' selected' : ''}>Guesser</option>
          <option value="hint"${player.role === 'hint' ? ' selected' : ''}>Hint giver</option>
        </select>
      </label>
    </div>
    <button type="submit">Update</button>
  `;
  form.addEventListener('submit', handleIdentitySubmit);
  playerInfo.appendChild(form);

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
  return `<span>${escapeHtml(playerRecord.name)}</span>`;
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

function renderLeaderboard() {
  if (!leaderboardPanel || !leaderboardList || !gameColumns) return;
  const board = serverState?.leaderboard ?? null;

  if (!player || !board) {
    if (!player) {
      leaderboardView = 'room';
      if (leaderboardTabs.length) {
        leaderboardTabs.forEach(tab => {
          tab.classList.toggle('active', tab.dataset.view === leaderboardView);
        });
      }
    }
    leaderboardPanel.classList.add('hidden');
    gameColumns.classList.add('single-column');
    leaderboardList.innerHTML = '';
    if (personalStatsSection) {
      personalStatsSection.innerHTML = '';
    }
    return;
  }

  leaderboardPanel.classList.remove('hidden');
  gameColumns.classList.remove('single-column');

  if (leaderboardTabs.length) {
    leaderboardTabs.forEach(tab => {
      const isActive = tab.dataset.view === leaderboardView;
      tab.classList.toggle('active', isActive);
    });
  }

  const viewKey = leaderboardView === 'global' ? 'global' : 'room';
  const entries = Array.isArray(board[viewKey]) ? board[viewKey] : [];
  leaderboardList.innerHTML = '';

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'leaderboard-empty';
    li.textContent = viewKey === 'room'
      ? 'No hint data in this room yet — keep those clues coming.'
      : 'No global hint history yet.';
    leaderboardList.appendChild(li);
  } else {
    entries.slice(0, 10).forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row';
      if (player && entry.playerId === player.id) {
        li.classList.add('is-self');
      }
      const metrics = entry.metrics || {};
      const scoreValue = formatMetricValue(metrics.playerScore ?? entry.playerScore);
      li.innerHTML = `
        <div class="leaderboard-rank">#${index + 1}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">${escapeHtml(entry.name)}</div>
          <div class="leaderboard-metrics">
            ${renderLeaderboardMetric('🥇', 'Clue Usefulness Score', metrics.cus)}
            ${renderLeaderboardMetric('💡', 'Hint Survival Rate', metrics.hsr)}
            ${renderLeaderboardMetric('🎯', 'Guess Assist Rate', metrics.gar)}
            ${renderLeaderboardMetric('🔁', 'Elimination Frequency', metrics.ef)}
          </div>
        </div>
        <div class="leaderboard-score">${scoreValue}<span>PlayerScore</span></div>
      `;
      leaderboardList.appendChild(li);
    });
  }

  if (!personalStatsSection) return;

  const personalEntry = board.byPlayer?.[player.id];
  if (!personalEntry || (personalEntry.totals?.hintsGiven ?? 0) === 0) {
    const emptyMessage = player.role === 'hint'
      ? 'Give your first hint to start building your profile.'
      : 'Switch to a hint-giver role to start building your profile.';
    personalStatsSection.innerHTML = `
      <h4>Your Stats</h4>
      <p class="personal-empty">${emptyMessage}</p>
    `;
    return;
  }

  const metrics = personalEntry.metrics || {};
  const totals = personalEntry.totals || {};
  const bestHints = Array.isArray(personalEntry.bestHints) ? personalEntry.bestHints : [];

  const summaryHtml = `
    <div class="personal-summary">
      ${buildStatChip('Clue Usefulness', `${formatMetricValue(metrics.cus)}%`)}
      ${buildStatChip('Hint Survival Rate', `${formatMetricValue(metrics.hsr)}%`)}
      ${buildStatChip('Guess Assist Rate', `${formatMetricValue(metrics.gar)}%`)}
      ${buildStatChip('Elimination Frequency', `${formatMetricValue(metrics.ef)}%`)}
    </div>
  `;

  const volumeHtml = `
    <div class="personal-volume">
      <span><strong>${totals.hintsGiven ?? 0}</strong> hints given</span>
      <span><strong>${totals.hintsKept ?? 0}</strong> survived</span>
      <span><strong>${totals.hintsEliminated ?? 0}</strong> eliminated</span>
      <span><strong>${totals.successfulRounds ?? 0}</strong> winning rounds</span>
    </div>
  `;

  const hintsHtml = bestHints.length
    ? `<div class="personal-hints">
         <h5>Top hints</h5>
         <ul>
           ${bestHints.map(renderPersonalHint).join('')}
         </ul>
       </div>`
    : `<div class="personal-hints">
         <h5>Top hints</h5>
         <p class="personal-empty">Keep the streak going to showcase your best three hints.</p>
       </div>`;

  personalStatsSection.innerHTML = `
    <h4>Your Stats</h4>
    ${summaryHtml}
    ${volumeHtml}
    ${hintsHtml}
  `;
}

function renderControls() {
  controlsEl.innerHTML = '';
  if (!player || !serverState) return;

  const round = serverState.round;
  if (!round) {
    const prompt = document.createElement('div');
    prompt.textContent = 'Ready to play? Anyone can kick off the first round.';
    controlsEl.appendChild(prompt);
    controlsEl.appendChild(buildButton('Start new round', () => startRound()));
    return;
  }

  switch (round.stage) {
    case 'collecting_hints':
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Review collisions', () => beginReview(), round.hints.length === 0));
      } else {
        controlsEl.textContent = 'Hints are being prepared.';
      }
      break;
    case 'reviewing_hints':
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Reveal valid clues to guesser', () => revealClues()));
      } else {
        controlsEl.textContent = 'Hint givers are resolving collisions.';
      }
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
      } else {
        controlsEl.textContent = 'Waiting for the guesser to decide.';
      }
      break;
    case 'round_result': {
      const prompt = document.createElement('div');
      prompt.textContent = 'Review the result, then start the next round when ready.';
      controlsEl.appendChild(prompt);
      controlsEl.appendChild(buildButton('Start next round', () => startRound()));
      break;
    }
    default:
      controlsEl.textContent = '';
  }
}

function renderRound() {
  roundEl.innerHTML = '';
  if (!player || !serverState) return;

  const round = serverState.round;
  if (!round) {
    roundEl.innerHTML = '<p>No round in progress yet.</p>';
    return;
  }

  if (player.role === 'hint' && currentWord) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = currentWord;
    roundEl.appendChild(card);
  }

  if (round.hints.length > 0) {
    const list = document.createElement('ul');
    list.className = 'hint-list';

    const showTexts = round.stage !== 'collecting_hints' || player.role === 'hint';
    const hintsForDisplay = round.stage === 'awaiting_guess' ? round.hints.filter(h => !h.invalid) : round.hints;

    hintsForDisplay.forEach(hint => {
      const li = document.createElement('li');
      li.className = 'hint-item';
      if (hint.invalid) {
        li.classList.add('invalid');
      }

      const text = showTexts ? escapeHtml(hint.text) : hint.playerId === player.id ? escapeHtml(hint.text) : 'Submitted';
      const content = document.createElement('div');
      content.innerHTML = `<div>${text}</div>`;
      if (player.role === 'hint') {
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = hint.author;
        content.appendChild(meta);
      }

      li.appendChild(content);

      if (player.role === 'hint' && round.stage === 'reviewing_hints') {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = hint.invalid ? 'Restore' : 'Eliminate';
        toggle.addEventListener('click', () => toggleHint(hint));
        li.appendChild(toggle);
      }

      if (round.stage === 'awaiting_guess' && player.role === 'guesser') {
        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = 'Valid clue';
        li.appendChild(meta);
      }

      list.appendChild(li);
    });

    roundEl.appendChild(list);
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

async function handleIdentitySubmit(event) {
  event.preventDefault();
  if (!player) return;
  const form = event.currentTarget;
  const formData = new FormData(form);
  const name = (formData.get('name') || '').toString().trim();
  const role = formData.get('role');
  if (!name) {
    showMessage('Name cannot be empty.', 'error');
    return;
  }
  if (!role) {
    showMessage('Select a role.', 'error');
    return;
  }
  try {
    const { player: updated } = await apiPost('/api/join', {
      playerId: player.id,
      name,
      role
    });
    player = updated;
    localStorage.setItem('just-one-player', JSON.stringify(updated));
    nameInput.value = updated.name;
    roleSelect.value = updated.role;
    showMessage('Profile updated.');
    updateLayout();
  } catch (err) {
    // handled by apiPost
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

function renderLeaderboardMetric(icon, label, value) {
  const formatted = `${formatMetricValue(value)}%`;
  return `<span class="leaderboard-metric" title="${escapeHtml(label)}">${icon} <strong>${formatted}</strong></span>`;
}

function buildStatChip(label, value) {
  return `<div class="stat-chip"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderPersonalHint(hint) {
  const text = escapeHtml(hint?.text ?? '');
  const word = hint?.word ? escapeHtml(hint.word) : null;
  const outcome = hint?.correct ? 'Correct round' : 'Missed round';
  const status = hint?.invalid ? 'Eliminated' : 'Stayed on board';
  const metaParts = [];
  if (word) metaParts.push(`Word: ${word}`);
  metaParts.push(outcome);
  metaParts.push(status);
  return `<li><strong>&ldquo;${text}&rdquo;</strong><div class="hint-meta">${metaParts.join(' • ')}</div></li>`;
}

function formatMetricValue(raw) {
  const numeric = typeof raw === 'number' ? raw : Number(raw ?? 0);
  if (!Number.isFinite(numeric)) return '0';
  return numeric.toFixed(1).replace(/\.0$/, '');
}

function escapeHtml(value) {
  const str = String(value ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
