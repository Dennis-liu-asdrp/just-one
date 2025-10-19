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
}

function renderSharePanel() {
  if (!sharePanel) return;
  const inviteButton = document.getElementById('invite-btn');

  if (!player) {
    sharePanel.classList.add('hidden');
    if (inviteButton) {
      inviteButton.disabled = true;
    }
    return;
  }

  const origin = window.location.origin;
  shareLinkInput.value = origin;

  if (/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    shareHint.textContent = 'Friends must replace "localhost" with your computer\'s IP address before joining.';
  } else {
    shareHint.textContent = 'Share this address with friends so they can join the same table.';
  }

  if (sharePanel) {
    sharePanel.classList.add('hidden');
  }
  if (inviteButton) {
    inviteButton.disabled = false;
    if (!inviteButton.dataset.boundCopy) {
      inviteButton.addEventListener('click', handleCopyShareLink);
      inviteButton.dataset.boundCopy = 'true';
    }
  }
}

function renderPlayerInfo() {
  playerInfo.innerHTML = '';

  if (!player) {
    const intro = document.createElement('div');
    intro.className = 'player-info-empty';
    intro.textContent = 'Enter a name and choose a role to join the table.';
    playerInfo.appendChild(intro);
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'player-summary';
  summary.innerHTML = `<strong>${escapeHtml(player.name)}</strong> — ${player.role === 'guesser' ? 'Guesser' : 'Hint giver'}`;
  playerInfo.appendChild(summary);

  if (!serverState?.round) {
    const prompt = document.createElement('div');
    prompt.className = 'player-prompt';
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
}

function renderPlayers() {
  if (!playersEl) return;

  playersEl.innerHTML = `
    <div class="players-title">Hint Givers</div>
    <div id="players-hintgivers" class="pill-grid"></div>
    <div class="guesser-line">Guesser: <span id="players-guesser" class="pill"></span></div>
  `;

  const hintContainer = document.getElementById('players-hintgivers');
  const guesserPill = document.getElementById('players-guesser');

  if (!serverState || !hintContainer || !guesserPill) {
    if (guesserPill) {
      guesserPill.classList.add('empty');
      guesserPill.textContent = '(none)';
    }
    return;
  }

  hintContainer.innerHTML = '';
  const hints = serverState.players.filter(p => p.role === 'hint');
  const guessers = serverState.players.filter(p => p.role === 'guesser');

  if (hints.length) {
    hints.forEach(playerRecord => {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = playerRecord.name;
      hintContainer.appendChild(pill);
    });
  } else {
    const empty = document.createElement('span');
    empty.className = 'pill empty';
    empty.textContent = '(none)';
    hintContainer.appendChild(empty);
  }

  const guesser = guessers[0];
  guesserPill.textContent = guesser ? guesser.name : '(none)';
  if (!guesser) {
    guesserPill.classList.add('empty');
  } else {
    guesserPill.classList.remove('empty');
  }
}

function renderPlayerBadge(playerRecord) {
  return `<span>${escapeHtml(playerRecord.name)}</span>`;
}

function renderScore() {
  const stageLine = document.getElementById('stage-indicator');
  const scoreLine = document.getElementById('scoreboard');

  if (!stageLine || !scoreLine) return;

  if (!serverState) {
    stageLine.textContent = '';
    scoreLine.textContent = '';
    return;
  }

  const round = serverState.round;
  let message = 'Waiting to start';

  if (round) {
    switch (round.stage) {
      case 'collecting_hints':
        message = 'Hints are being prepared.';
        break;
      case 'reviewing_hints':
        message = 'Collisions are being reviewed.';
        break;
      case 'awaiting_guess':
        message = player?.role === 'guesser' ? 'Make your guess!' : 'Guesser is guessing';
        break;
      case 'round_result':
        message = 'Round complete.';
        break;
      default:
        message = 'Waiting to start';
    }
  }

  stageLine.textContent = message;
  const { success, failure } = serverState.score;
  scoreLine.textContent = `Score: ${success} correct · ${failure} misses`;
}

function renderControls() {
  controlsEl.innerHTML = '';
  const inlineControls = document.getElementById('controls-inline');
  const leaveButton = document.getElementById('leave-btn');
  const endButton = document.getElementById('end-btn');

  if (inlineControls) {
    inlineControls.innerHTML = '';
  }

  if (leaveButton) {
    const hasPlayer = Boolean(player);
    leaveButton.disabled = !hasPlayer;
    leaveButton.classList.toggle('hidden', !hasPlayer);
    if (player && !leaveButton.dataset.boundLeave) {
      leaveButton.addEventListener('click', handleLeaveTable);
      leaveButton.dataset.boundLeave = 'true';
    }
  }

  if (endButton) {
    endButton.disabled = true;
    endButton.classList.toggle('hidden', !player);
  }

  if (!player || !serverState || !inlineControls) {
    return;
  }

  const addInlineButton = (label, handler, disabled = false) => {
    const btn = buildButton(label, handler, disabled);
    btn.classList.add('btn', 'btn-primary');
    inlineControls.appendChild(btn);
    return btn;
  };

  const round = serverState.round;
  if (!round) {
    if (player.role === 'hint') {
      addInlineButton('Start new round', () => startRound());
    }
    return;
  }

  switch (round.stage) {
    case 'collecting_hints':
      if (player.role === 'hint') {
        const readyList = Array.isArray(round.readyHintGivers) ? round.readyHintGivers : [];
        const alreadyReady = readyList.includes(player.id);
        const myHint = round.hints.find(h => h.playerId === player.id);
        const hasHint = Boolean(myHint?.text?.trim());
        const buttonLabel = alreadyReady ? 'Waiting for others…' : 'Review collisions';
        const btn = addInlineButton(buttonLabel, () => beginReview(), !hasHint || alreadyReady);
        if (!hasHint) {
          btn.title = 'Submit your hint before reviewing collisions.';
        } else if (alreadyReady) {
          btn.title = 'Your hint is locked. Waiting for other hint givers.';
        }
      }
      break;
    case 'reviewing_hints':
      if (player.role === 'hint') {
        addInlineButton('Reveal valid clues to guesser', () => revealClues());
      }
      break;
    case 'round_result':
      if (player.role === 'hint') {
        addInlineButton('Start next round', () => startRound());
      }
      break;
    default:
      break;
  }
}

function renderRound() {
  roundEl.innerHTML = '';

  if (!player || !serverState) {
    roundEl.appendChild(buildBigCard());
    return;
  }

  const round = serverState.round;
  if (!round) {
    roundEl.appendChild(buildBigCard('Waiting for the next round.'));
    return;
  }

  const stage = round.stage;

  if (stage === 'collecting_hints') {
    if (player.role === 'hint') {
      renderCollectingForHint(round);
    } else {
      roundEl.appendChild(buildBigCard('Hints are being prepared.'));
    }
    return;
  }

  if (stage === 'reviewing_hints') {
    if (player.role === 'hint') {
      renderReviewForHint(round);
    } else {
      roundEl.appendChild(buildBigCard('Collisions are being reviewed.'));
    }
    return;
  }

  if (stage === 'awaiting_guess') {
    renderAwaitingGuess(round);
    return;
  }

  if (stage === 'round_result') {
    renderRoundResult(round);
    return;
  }

  roundEl.appendChild(buildBigCard());

  function renderCollectingForHint(activeRound) {
    const layout = document.createElement('div');
    layout.className = 'round-stack';

    const readyList = Array.isArray(activeRound.readyHintGivers) ? activeRound.readyHintGivers : [];
    const isReady = readyList.includes(player.id);

    if (currentWord) {
      const card = document.createElement('div');
      card.className = 'word-card';
      card.textContent = currentWord;
      layout.appendChild(card);
    }

    const form = document.createElement('form');
    form.className = 'clue-form';
    const existing = activeRound.hints.find(h => h.playerId === player.id);
    form.innerHTML = `
      <label>
        <span>Your clue</span>
        <textarea name="clue" maxlength="32" placeholder="Single word"></textarea>
      </label>
      <button type="submit" class="btn btn-primary">Submit clue</button>
    `;
    const textarea = form.querySelector('textarea');
    if (existing) {
      textarea.value = existing.text;
    }
    textarea.readOnly = isReady;
    textarea.classList.toggle('locked', isReady);
    const submitBtn = form.querySelector('button');
    submitBtn.disabled = isReady;
    form.addEventListener('submit', async evt => {
      evt.preventDefault();
      if (isReady) {
        showMessage('Your hint is locked for review.', 'error');
        return;
      }
      const value = textarea.value.trim();
      if (!value) {
        showMessage('Clue cannot be empty.', 'error');
        return;
      }
      await submitHint(value);
    });

    layout.appendChild(form);

    const note = document.createElement('div');
    note.className = 'hint-note';
    note.textContent = isReady
      ? 'Waiting for every hint giver to click "Review collisions."'
      : 'Hints are being prepared.';
    layout.appendChild(note);

    if (activeRound.hints.length > 0) {
      const list = document.createElement('div');
      list.className = 'hint-column';
      activeRound.hints.forEach(hint => {
        const pill = document.createElement('div');
        pill.className = 'hint-pill';
        const text = hint.playerId === player.id ? escapeHtml(hint.text) : 'Submitted';
        pill.innerHTML = `<span>${text}</span><span class="hint-author">${escapeHtml(hint.author)}</span>`;
        list.appendChild(pill);
      });
      layout.appendChild(list);
    }

    roundEl.appendChild(layout);
    roundEl.appendChild(buildBigCard());
  }

  function renderReviewForHint(activeRound) {
    const stack = document.createElement('div');
    stack.className = 'hint-column';

    if (!activeRound.hints.length) {
      const empty = document.createElement('div');
      empty.className = 'hint-pill empty';
      empty.textContent = '(no hints yet)';
      stack.appendChild(empty);
    }

    activeRound.hints.forEach(hint => {
      const pill = document.createElement('div');
      pill.className = 'hint-pill';
      if (hint.invalid) {
        pill.classList.add('invalid');
      }
      const label = document.createElement('span');
      label.textContent = `${hint.author}'s guess: ${hint.text}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = hint.invalid ? 'Restore' : '×';
      remove.addEventListener('click', () => toggleHint(hint));
      pill.appendChild(label);
      pill.appendChild(remove);
      stack.appendChild(pill);
    });

    roundEl.appendChild(stack);

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'btn btn-primary btn-block';
    approve.textContent = 'Approve Collisions';
    approve.addEventListener('click', () => revealClues());
    roundEl.appendChild(approve);
  }

  function renderAwaitingGuess(activeRound) {
    const validHints = activeRound.hints.filter(h => !h.invalid);
    const columns = document.createElement('div');
    columns.className = 'round-columns';

    const othersColumn = document.createElement('div');
    othersColumn.className = 'hint-column';
    const mineColumn = document.createElement('div');
    mineColumn.className = 'hint-column';

    const othersTitle = document.createElement('div');
    othersTitle.className = 'column-title';
    othersTitle.textContent = 'Other hints';
    const mineTitle = document.createElement('div');
    mineTitle.className = 'column-title';
    mineTitle.textContent = 'My guess';

    othersColumn.appendChild(othersTitle);
    mineColumn.appendChild(mineTitle);

    validHints.forEach(hint => {
      const pill = document.createElement('div');
      pill.className = 'hint-pill';
      pill.textContent = hint.text;
      if (hint.playerId === player?.id && player.role === 'hint') {
        mineColumn.appendChild(pill);
      } else {
        othersColumn.appendChild(pill);
      }
    });

    if (player.role !== 'hint') {
      const guessText = activeRound.guess?.text;
      if (guessText) {
        const guessPill = document.createElement('div');
        guessPill.className = 'hint-pill';
        guessPill.textContent = guessText;
        mineColumn.appendChild(guessPill);
      }
    }

    if (othersColumn.children.length === 1) {
      const empty = document.createElement('div');
      empty.className = 'hint-pill empty';
      empty.textContent = '(none yet)';
      othersColumn.appendChild(empty);
    }

    if (mineColumn.children.length === 1) {
      const empty = document.createElement('div');
      empty.className = 'hint-pill empty';
      empty.textContent = '(none yet)';
      mineColumn.appendChild(empty);
    }

    columns.appendChild(othersColumn);
    columns.appendChild(mineColumn);
    roundEl.appendChild(columns);

    if (player.role === 'guesser') {
      const guessArea = document.createElement('div');
      guessArea.className = 'guess-area';
      const callout = document.createElement('div');
      callout.textContent = 'Make your guess!';
      guessArea.appendChild(callout);

      const form = document.createElement('form');
      form.innerHTML = `
        <input type="text" name="guess" placeholder="Your guess" autocomplete="off" required />
        <button type="submit" class="btn btn-primary">Submit guess</button>
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

      guessArea.appendChild(form);
      roundEl.appendChild(guessArea);
    }
  }

  function renderRoundResult(activeRound) {
    const summary = document.createElement('div');
    summary.className = 'round-summary';
    const guessText = activeRound.guess?.text ?? '(no guess)';
    const outcome = activeRound.guess?.correct ? 'Correct!' : 'Missed';
    const word = activeRound.word ?? currentWord ?? 'Unknown';
    summary.innerHTML = `
      <h3>Round summary</h3>
      <p>Word: <strong>${escapeHtml(word)}</strong></p>
      <p>Guess: <strong>${escapeHtml(guessText)}</strong> — ${outcome}</p>
    `;
    roundEl.appendChild(summary);

    const validHints = activeRound.hints.filter(h => !h.invalid);
    if (validHints.length) {
      const list = document.createElement('div');
      list.className = 'hint-column';
      validHints.forEach(hint => {
        const pill = document.createElement('div');
        pill.className = 'hint-pill';
        pill.textContent = `${hint.author}: ${hint.text}`;
        list.appendChild(pill);
      });
      roundEl.appendChild(list);
    }

    roundEl.appendChild(buildBigCard());
  }

  function buildBigCard(text) {
    const card = document.createElement('div');
    card.className = 'big-card';
    if (text) {
      card.classList.add('big-card-center');
      card.textContent = text;
    }
    return card;
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
    showMessage('Hint locked. Waiting for other hint givers.');
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

function escapeHtml(value) {
  const str = String(value ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
