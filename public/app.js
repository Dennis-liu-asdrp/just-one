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
const gameColumns = document.getElementById('game-columns');
const leaderboardPanel = document.getElementById('leaderboard-panel');
const leaderboardList = document.getElementById('leaderboard-list');
const personalStatsSection = document.getElementById('personal-stats');
const leaderboardTabs = leaderboardPanel ? Array.from(leaderboardPanel.querySelectorAll('.leaderboard-tab')) : [];
const avatarOptionsContainer = document.getElementById('avatar-options');
const avatarInput = document.getElementById('avatar-input');
const avatarPickerButton = document.getElementById('avatar-picker-button');
const avatarPickerCurrent = document.getElementById('avatar-picker-current');
const avatarModal = document.getElementById('avatar-modal');
const avatarModalClose = document.getElementById('avatar-modal-close');
const instructionsButton = document.getElementById('instructions-button');
const instructionsModal = document.getElementById('instructions-modal');
const instructionsModalClose = document.getElementById('instructions-modal-close');

let leaderboardView = 'room';

const fallbackAvatars = [
  '🦊','🐼','🐸','🦄','🐝','🐢','🐧','🦁','🐙','🐨',
  '🐰','🐯','🐶','🐱','🐭','🐹','🐻','🐷','🐮','🐔',
  '🐤','🦉','🦋','🐞','🐬','🐳','🐠','🦈','🐲','🦖'
];
const defaultAvatar = '🙂';
const INSTRUCTIONS_STORAGE_KEY = 'just-one-instructions-seen';

let player = null;
let serverState = null;
let eventSource = null;
let fetchWordInFlight = false;
let lastKnownRoundId = null;
let lastKnownStage = null;
let currentWord = null;
let buttonFeedbackInitialized = false;
let audioContext = null;
let availableAvatars = [...fallbackAvatars];
let selectedAvatar = defaultAvatar;
let avatarModalOpen = false;
let instructionsModalOpen = false;
let shouldAutoOpenInstructions = !hasSeenInstructionsBefore();

init();

function init() {
  joinForm.addEventListener('submit', handleJoinSubmit);
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
  setupAvatarPicker();
  setupInstructions();
  restorePlayer().catch(err => {
    console.warn('Failed to restore player', err);
  });
  openEventStream();
  setupButtonFeedback();
  maybeAutoOpenInstructions();
}

function setupAvatarPicker() {
  if (!avatarOptionsContainer) return;
  renderAvatarOptions();
  updateAvatarPickerButton();

  if (avatarPickerButton) {
    avatarPickerButton.addEventListener('click', () => {
      if (avatarModalOpen) {
        closeAvatarModal();
      } else {
        openAvatarModal();
      }
    });
  }

  if (avatarModal) {
    avatarModal.addEventListener('click', event => {
      const target = event.target;
      if (target instanceof HTMLElement && target.dataset.dismiss === 'avatar-modal') {
        closeAvatarModal();
      }
    });
  }

  if (avatarModalClose) {
    avatarModalClose.addEventListener('click', () => closeAvatarModal());
  }
}

function setupInstructions() {
  if (!instructionsButton || !instructionsModal) {
    shouldAutoOpenInstructions = false;
    return;
  }
  instructionsButton.title = 'How to play';
  instructionsButton.addEventListener('click', () => {
    if (instructionsModalOpen) {
      closeInstructionsModal();
    } else {
      openInstructionsModal();
    }
  });

  instructionsModal.addEventListener('click', event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.dismiss === 'instructions-modal') {
      closeInstructionsModal();
    }
  });

  if (instructionsModalClose) {
    instructionsModalClose.addEventListener('click', () => closeInstructionsModal());
  }
}

function getAvailableAvatars() {
  return Array.isArray(availableAvatars) && availableAvatars.length ? availableAvatars : fallbackAvatars;
}

function normalizeAvatarChoice(value) {
  const avatars = getAvailableAvatars();
  if (value === defaultAvatar) {
    return defaultAvatar;
  }
  if (typeof value === 'string' && avatars.includes(value)) {
    return value;
  }
  if (typeof value === 'string' && fallbackAvatars.includes(value)) {
    const fallbackMatch = fallbackAvatars.find(avatar => avatars.includes(avatar));
    if (fallbackMatch) return fallbackMatch;
  }
  return avatars[0] || fallbackAvatars[0] || defaultAvatar;
}

function renderAvatarOptions() {
  if (!avatarOptionsContainer) return;
  const avatars = getAvailableAvatars();
  if (!avatars.length) return;

  selectedAvatar = normalizeAvatarChoice(selectedAvatar);
  avatarOptionsContainer.innerHTML = '';

  avatars.forEach(avatar => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'avatar-option';
    button.dataset.avatar = avatar;
    button.textContent = avatar;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-label', `Select avatar ${avatar}`);
    button.setAttribute('aria-selected', avatar === selectedAvatar ? 'true' : 'false');
    button.addEventListener('click', () => {
      updateSelectedAvatar(avatar);
      closeAvatarModal();
    });
    avatarOptionsContainer.appendChild(button);
  });

  updateSelectedAvatar(selectedAvatar);
}

function updateSelectedAvatar(avatar) {
  selectedAvatar = normalizeAvatarChoice(avatar);
  if (avatarInput) {
    avatarInput.value = selectedAvatar;
  }
  highlightSelectedAvatar();
  updateAvatarPickerButton();
}

function highlightSelectedAvatar() {
  if (!avatarOptionsContainer) return;
  const buttons = avatarOptionsContainer.querySelectorAll('.avatar-option');
  buttons.forEach(button => {
    const isActive = button.dataset.avatar === selectedAvatar;
    button.classList.toggle('selected', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    button.tabIndex = isActive ? 0 : -1;
  });
}

function syncAvailableAvatarsFromServer() {
  if (!serverState) return;
  const serverList = Array.isArray(serverState.availableAvatars) ? serverState.availableAvatars : null;
  if (!serverList || serverList.length === 0) return;
  if (arraysEqual(serverList, availableAvatars)) return;
  availableAvatars = [...serverList];
  renderAvatarOptions();
}

function updateAvatarPickerButton() {
  if (!avatarPickerCurrent) return;
  const label = selectedAvatar === defaultAvatar
    ? `${defaultAvatar} Guest`
    : `${selectedAvatar} Avatar`;
  avatarPickerCurrent.textContent = label;
  if (avatarPickerButton) {
    avatarPickerButton.title = `Current avatar: ${label}`;
  }
}

function openAvatarModal() {
  if (!avatarModal) return;
  renderAvatarOptions();
  avatarModal.classList.remove('hidden');
  avatarModal.classList.add('is-visible');
  avatarModal.classList.remove('is-hiding');
  avatarModalOpen = true;
  if (avatarPickerButton) {
    avatarPickerButton.setAttribute('aria-expanded', 'true');
    avatarPickerButton.classList.add('is-open');
  }
  document.addEventListener('keydown', handleAvatarModalKeydown);
  window.setTimeout(() => {
    const active = avatarOptionsContainer?.querySelector('.avatar-option.selected')
      || avatarOptionsContainer?.querySelector('.avatar-option');
    if (active instanceof HTMLElement) {
      active.focus();
    }
  }, 20);
}

function closeAvatarModal() {
  if (!avatarModal || !avatarModalOpen) return;
  avatarModal.classList.remove('is-visible');
  avatarModal.classList.add('is-hiding');
  avatarModalOpen = false;
  if (avatarPickerButton) {
    avatarPickerButton.setAttribute('aria-expanded', 'false');
    avatarPickerButton.focus({ preventScroll: true });
    avatarPickerButton.classList.remove('is-open');
  }
  document.removeEventListener('keydown', handleAvatarModalKeydown);
  window.setTimeout(() => {
    if (!avatarModalOpen) {
      avatarModal.classList.add('hidden');
      avatarModal.classList.remove('is-hiding');
    }
  }, 260);
}

function handleAvatarModalKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAvatarModal();
  }
}

function openInstructionsModal() {
  if (!instructionsModal || instructionsModalOpen) return;
  instructionsModal.classList.remove('hidden');
  instructionsModal.classList.remove('is-hiding');
  window.requestAnimationFrame(() => {
    instructionsModal.classList.add('is-visible');
  });
  instructionsModalOpen = true;
  shouldAutoOpenInstructions = false;
  if (instructionsButton) {
    instructionsButton.setAttribute('aria-expanded', 'true');
  }
  document.addEventListener('keydown', handleInstructionsKeydown);
  if (instructionsModalClose) {
    instructionsModalClose.focus({ preventScroll: true });
  }
}

function closeInstructionsModal(force = false) {
  if (!instructionsModal) return;
  if (!instructionsModalOpen && !force) return;

  if (force && !instructionsModalOpen) {
    instructionsModal.classList.add('hidden');
    instructionsModal.classList.remove('is-visible');
    instructionsModal.classList.remove('is-hiding');
    return;
  }

  instructionsModal.classList.remove('is-visible');
  if (force) {
    instructionsModal.classList.add('hidden');
    instructionsModal.classList.remove('is-hiding');
  } else {
    instructionsModal.classList.add('is-hiding');
    window.setTimeout(() => {
      if (!instructionsModalOpen) {
        instructionsModal.classList.add('hidden');
        instructionsModal.classList.remove('is-hiding');
      }
    }, 220);
  }
  instructionsModalOpen = false;
  shouldAutoOpenInstructions = false;
  markInstructionsSeen();
  if (instructionsButton) {
    instructionsButton.setAttribute('aria-expanded', 'false');
    if (!force) {
      instructionsButton.focus({ preventScroll: true });
    }
  }
  document.removeEventListener('keydown', handleInstructionsKeydown);
}

function handleInstructionsKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeInstructionsModal();
  }
}

function maybeAutoOpenInstructions() {
  if (!shouldAutoOpenInstructions) return;
  if (instructionsModalOpen) return;
  if (player) return;
  openInstructionsModal();
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
  updateSelectedAvatar(normalizeAvatarChoice(stored.avatar));

  try {
    const { player: refreshed } = await silentlyRejoin(stored);
    player = refreshed;
    localStorage.setItem('just-one-player', JSON.stringify(refreshed));
    updateSelectedAvatar(normalizeAvatarChoice(refreshed.avatar));
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
    role: existing.role,
    avatar: normalizeAvatarChoice(existing.avatar)
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
  syncAvailableAvatarsFromServer();

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

  if (player && serverState) {
    const serverPlayerRecord = serverState.players.find(p => p.id === player.id);
    if (serverPlayerRecord) {
      const changed =
        serverPlayerRecord.name !== player.name ||
        serverPlayerRecord.role !== player.role ||
        serverPlayerRecord.avatar !== player.avatar;
      if (changed) {
        player = { ...player, ...serverPlayerRecord };
        localStorage.setItem('just-one-player', JSON.stringify(player));
        updateSelectedAvatar(normalizeAvatarChoice(player.avatar));
      }
    }
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
  payload.avatar = selectedAvatar;

  try {
    const { player: joined } = await apiPost('/api/join', payload);
    player = joined;
    localStorage.setItem('just-one-player', JSON.stringify(joined));
    roleSelect.value = joined.role;
    updateSelectedAvatar(normalizeAvatarChoice(joined.avatar));
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
    renderLeaderboard();
    maybeAutoOpenInstructions();
    return;
  }

  joinSection.classList.add('hidden');
  gameSection.classList.remove('hidden');

  renderPlayerInfo();
  renderPlayers();
  renderScore();
  renderControls();
  renderRound();
  renderLeaderboard();
}

function renderPlayerInfo() {
  playerInfo.innerHTML = '';

  if (!player) {
    playerInfo.textContent = 'Enter a name and choose a role to join the table.';
    return;
  }

  const summary = document.createElement('div');
  summary.className = 'identity-summary';

  const avatarEl = document.createElement('span');
  avatarEl.className = 'identity-avatar';
  avatarEl.textContent = player.avatar || defaultAvatar;
  summary.appendChild(avatarEl);

  const nameEl = document.createElement('strong');
  nameEl.textContent = player.name;
  summary.appendChild(nameEl);

  const roleEl = document.createElement('span');
  roleEl.className = 'identity-role';
  roleEl.textContent = player.role === 'guesser' ? 'Guesser' : 'Hint giver';
  summary.appendChild(roleEl);

  playerInfo.appendChild(summary);

  const round = serverState?.round;

  if (!round) {
    const prompt = document.createElement('div');
    prompt.className = 'info-card subtle';
    prompt.textContent = 'Start a round to begin the fun.';
    playerInfo.appendChild(prompt);
  } else {
    const notice = document.createElement('div');
    notice.className = 'roles-locked';
    notice.textContent = 'Roles are locked until this round is complete.';
    playerInfo.appendChild(notice);
  }

  const actions = document.createElement('div');
  actions.className = 'player-actions';
  const inviteButton = document.createElement('button');
  inviteButton.type = 'button';
  inviteButton.textContent = 'Invite friends';
  inviteButton.addEventListener('click', handleInviteFriends);
  actions.appendChild(inviteButton);
  const leaveButton = document.createElement('button');
  leaveButton.type = 'button';
  leaveButton.textContent = 'Leave table';
  leaveButton.addEventListener('click', handleLeaveTable);
  actions.appendChild(leaveButton);
  playerInfo.appendChild(actions);
}

function renderPlayers() {
  playersEl.innerHTML = '';
  if (!serverState) return;

  const groups = [
    { label: 'Guesser', players: serverState.players.filter(p => p.role === 'guesser') },
    { label: 'Hint givers', players: serverState.players.filter(p => p.role === 'hint') }
  ];

  for (const group of groups) {
    const container = document.createElement('div');
    container.className = 'player-list';

    const title = document.createElement('strong');
    title.textContent = `${group.label}:`;
    container.appendChild(title);

    if (group.players.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'empty';
      empty.textContent = '(none)';
      container.appendChild(empty);
    } else {
      group.players.forEach(record => {
        container.appendChild(renderPlayerBadge(record));
      });
    }

    playersEl.appendChild(container);
  }
}

function renderPlayerBadge(playerRecord) {
  const pill = document.createElement('span');
  pill.className = 'player-pill';
  if (player && player.id === playerRecord.id) {
    pill.classList.add('is-self');
  }

  const avatarEl = document.createElement('span');
  avatarEl.className = 'player-pill-avatar';
  avatarEl.textContent = playerRecord.avatar || defaultAvatar;
  pill.appendChild(avatarEl);

  const nameEl = document.createElement('span');
  nameEl.className = 'player-pill-name';
  nameEl.textContent = playerRecord.name;
  pill.appendChild(nameEl);

  return pill;
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
      const avatarSymbol = escapeHtml(entry.avatar || defaultAvatar);
      li.innerHTML = `
        <div class="leaderboard-rank">#${index + 1}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name">
            <span class="leaderboard-avatar">${avatarSymbol}</span>
            <span>${escapeHtml(entry.name)}</span>
          </div>
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
        setControlsMessage('Hints are being prepared.');
      }
      break;
    case 'reviewing_hints':
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Reveal valid clues to guesser', () => revealClues()));
      } else {
        setControlsMessage('Hint givers are resolving collisions.');
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
        setControlsMessage('Waiting for the guesser to decide.');
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
      controlsEl.innerHTML = '';
  }
}

function setControlsMessage(text) {
  controlsEl.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'info-card subtle';
  card.textContent = text;
  controlsEl.appendChild(card);
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

        const content = document.createElement('div');
        content.className = 'hint-content';

        const row = document.createElement('div');
        row.className = 'hint-row';

        const avatarEl = document.createElement('span');
        avatarEl.className = 'hint-avatar';
        avatarEl.textContent = hint.avatar || defaultAvatar;
        row.appendChild(avatarEl);

        const textEl = document.createElement('div');
        textEl.className = 'hint-text';
        const ownHint = hint.playerId === player.id;
        if (canSeeText || ownHint) {
          textEl.textContent = hint.text || '';
        } else {
          textEl.textContent = 'Hidden';
          textEl.classList.add('hint-text-obscured');
        }
        row.appendChild(textEl);

        content.appendChild(row);

        if (player.role === 'hint') {
          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = hint.author;
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

    const heading = document.createElement('h3');
    heading.textContent = 'Round summary';
    summary.appendChild(heading);

    const wordLine = document.createElement('p');
    wordLine.className = 'round-word';
    const wordLabel = document.createElement('span');
    wordLabel.textContent = 'Word:';
    wordLine.appendChild(wordLabel);
    const wordValue = document.createElement('strong');
    wordValue.textContent = round.word ?? currentWord ?? 'Unknown';
    wordLine.appendChild(wordValue);
    summary.appendChild(wordLine);

    const guessLine = document.createElement('p');
    guessLine.className = 'guess-line';
    const guessLabel = document.createElement('span');
    guessLabel.textContent = 'Guess:';
    guessLine.appendChild(guessLabel);

    if (round.guess) {
      const avatarEl = document.createElement('span');
      avatarEl.className = 'guess-avatar';
      avatarEl.textContent = round.guess.avatar || defaultAvatar;
      guessLine.appendChild(avatarEl);

      const nameEl = document.createElement('strong');
      nameEl.className = 'guess-name';
      nameEl.textContent = round.guess.playerName || 'Unknown player';
      guessLine.appendChild(nameEl);

      const guessTextEl = document.createElement('span');
      guessTextEl.className = 'guess-text';
      guessTextEl.textContent = `— ${round.guess.text || '(no guess)'}`;
      guessLine.appendChild(guessTextEl);

      const outcomeEl = document.createElement('span');
      outcomeEl.className = `guess-outcome ${round.guess.correct ? 'success' : 'fail'}`;
      outcomeEl.textContent = round.guess.correct ? 'Correct!' : 'Missed';
      guessLine.appendChild(outcomeEl);
    } else {
      const noGuess = document.createElement('span');
      noGuess.className = 'guess-text';
      noGuess.textContent = '(no guess)';
      guessLine.appendChild(noGuess);
    }

    summary.appendChild(guessLine);
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

async function handleInviteFriends() {
  const value = window.location.origin;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      showMessage('Invite link copied to clipboard.');
      return;
    }

    const tempInput = document.createElement('input');
    tempInput.value = value;
    tempInput.setAttribute('readonly', '');
    tempInput.style.position = 'absolute';
    tempInput.style.left = '-9999px';
    document.body.appendChild(tempInput);
    tempInput.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(tempInput);
    if (ok) {
      showMessage('Invite link copied to clipboard.');
      return;
    }
    throw new Error('Copy not supported');
  } catch (err) {
    showMessage('Copy failed. Copy the link manually from the address bar.', 'error');
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
    // Swallow audio errors silently (autoplay restrictions, etc.).
  }
}

function isMotionReduced() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

function markInstructionsSeen() {
  try {
    localStorage.setItem(INSTRUCTIONS_STORAGE_KEY, 'true');
  } catch (err) {
    // Ignore storage errors (private mode, etc.).
  }
}

function hasSeenInstructionsBefore() {
  try {
    return localStorage.getItem(INSTRUCTIONS_STORAGE_KEY) === 'true';
  } catch (err) {
    return false;
  }
}
