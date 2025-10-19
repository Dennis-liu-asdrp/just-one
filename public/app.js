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
const roundProgressEl = document.getElementById('round-progress');
const endGameButton = document.getElementById('end-game-button');
const endGameStatus = document.getElementById('end-game-status');
const resetGameButton = document.getElementById('reset-game-button');
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const settingsModalClose = document.getElementById('settings-modal-close');
const settingsForm = document.getElementById('settings-form');
const settingsTotalRoundsInput = document.getElementById('settings-total-rounds');
const difficultyInputs = settingsForm ? Array.from(settingsForm.querySelectorAll('input[name="setting-difficulty"]')) : [];
const roleInputs = settingsForm ? Array.from(settingsForm.querySelectorAll('input[name="setting-role"]')) : [];
const roleWarningEl = document.getElementById('role-warning');
const gameColumns = document.getElementById('game-columns');
const leaderboardPanel = document.getElementById('leaderboard-panel');
const leaderboardList = document.getElementById('leaderboard-list');
const personalStatsSection = document.getElementById('personal-stats');
const avatarOptionsContainer = document.getElementById('avatar-options');
const avatarInput = document.getElementById('avatar-input');
const avatarPickerButton = document.getElementById('avatar-picker-button');
const avatarPickerCurrent = document.getElementById('avatar-picker-current');
const avatarModal = document.getElementById('avatar-modal');
const avatarModalClose = document.getElementById('avatar-modal-close');
const hintChatSection = document.getElementById('hint-chat');
const hintChatMessages = document.getElementById('hint-chat-messages');
const hintChatForm = document.getElementById('hint-chat-form');
const hintChatInput = document.getElementById('hint-chat-input');
const hintChatStatus = document.getElementById('hint-chat-status');
const instructionsButton = document.getElementById('instructions-button');
const instructionsModal = document.getElementById('instructions-modal');
const instructionsModalClose = document.getElementById('instructions-modal-close');



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
let settingsModalOpen = false;
let shouldAutoOpenSettings = false;
let roleWarningTimeout = null;
let roleWarningClearTimeout = null;
let currentSettings = {
  totalRounds: 10,
  maxRounds: 20,
  difficulty: 'easy'
};
let availableAvatars = [...fallbackAvatars];
let selectedAvatar = defaultAvatar;
let avatarModalOpen = false;
let hintChatAutoScroll = true;
let lastRenderedChatRoundId = null;
let instructionsModalOpen = false;
let shouldAutoOpenInstructions = !hasSeenInstructionsBefore();
const HINT_TYPING_IDLE_DELAY = 1800;
const hintTypingState = {
  active: false,
  reported: false,
  timeoutId: null
};
const hintDraft = {
  roundId: null,
  value: '',
  syncedValue: ''
};
const GUESS_TYPING_IDLE_DELAY = 1800;
const guessTypingState = {
  active: false,
  reported: false,
  timeoutId: null
};
const guessDraft = {
  roundId: null,
  stage: null,
  value: ''
};

init();

function init() {
  joinForm.addEventListener('submit', handleJoinSubmit);
  window.addEventListener('beforeunload', handleBeforeUnload);
  if (endGameButton) {
    endGameButton.addEventListener('click', handleEndGameToggle);
  }
  if (resetGameButton) {
    resetGameButton.addEventListener('click', handleResetGame);
  }
  setupSettings();
  setupAvatarPicker();
  setupHintChat();
  setupInstructions();
  restorePlayer().catch(err => {
    console.warn('Failed to restore player', err);
  });
  openEventStream();
  setupButtonFeedback();
  maybeAutoOpenInstructions();
  renderSettingsButtonState();
}

async function simulateRandomClickAway(excludeElement) {
  if (typeof document === 'undefined' || !document.body) return;
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight;
  if (!viewportWidth || !viewportHeight) return;

  const rect = typeof excludeElement?.getBoundingClientRect === 'function'
    ? excludeElement.getBoundingClientRect()
    : null;
  const attempts = 12;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const clientX = Math.random() * viewportWidth;
    const clientY = Math.random() * viewportHeight;
    if (rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      continue;
    }
    const target = document.elementFromPoint(clientX, clientY);
    if (!target || target === excludeElement || (excludeElement && excludeElement.contains(target))) {
      continue;
    }
    await dispatchSyntheticClick(target, Math.round(clientX), Math.round(clientY));
    return;
  }

  if (excludeElement && typeof excludeElement.blur === 'function') {
    excludeElement.blur();
  }
  await new Promise(resolve => requestAnimationFrame(resolve));

  async function dispatchSyntheticClick(target, clientX, clientY) {
    const baseEventInit = {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      screenX: (window.screenX || 0) + clientX,
      screenY: (window.screenY || 0) + clientY,
      button: 0
    };

    if (typeof PointerEvent === 'function') {
      const pointerDown = new PointerEvent('pointerdown', {
        ...baseEventInit,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      });
      target.dispatchEvent(pointerDown);
      const pointerUp = new PointerEvent('pointerup', {
        ...baseEventInit,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true
      });
      target.dispatchEvent(pointerUp);
    } else {
      const mouseDown = new MouseEvent('mousedown', baseEventInit);
      target.dispatchEvent(mouseDown);
      const mouseUp = new MouseEvent('mouseup', baseEventInit);
      target.dispatchEvent(mouseUp);
    }

    const click = new MouseEvent('click', baseEventInit);
    target.dispatchEvent(click);

    await new Promise(resolve => requestAnimationFrame(resolve));
  }
}

function captureClueFocusState() {
  const active = document.activeElement;
  if ((active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) && active.name === 'clue') {
    const selectionStart = typeof active.selectionStart === 'number' ? active.selectionStart : active.value.length;
    const selectionEnd = typeof active.selectionEnd === 'number' ? active.selectionEnd : selectionStart;
    const selectionDirection = typeof active.selectionDirection === 'string' ? active.selectionDirection : 'none';
    return {
      shouldRestore: true,
      selectionStart,
      selectionEnd,
      selectionDirection
    };
  }
  return { shouldRestore: false };
}

function restoreClueFocus(inputEl, focusState) {
  if (!focusState?.shouldRestore) return;
  const isTextArea = inputEl instanceof HTMLTextAreaElement;
  const isInput = inputEl instanceof HTMLInputElement;
  if (!isTextArea && !isInput) return;
  if (inputEl.readOnly || inputEl.disabled) return;
  inputEl.focus({ preventScroll: true });
  try {
    inputEl.setSelectionRange(
      focusState.selectionStart,
      focusState.selectionEnd,
      focusState.selectionDirection
    );
  } catch (err) {
    // Ignore selection errors (e.g., input detached).
  }
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

function setupHintChat() {
  if (hintChatMessages) {
    hintChatMessages.addEventListener('scroll', () => {
      if (!hintChatMessages) return;
      const { scrollTop, scrollHeight, clientHeight } = hintChatMessages;
      hintChatAutoScroll = scrollHeight - (scrollTop + clientHeight) < 32;
    });
  }

  if (hintChatForm) {
    hintChatForm.addEventListener('submit', handleHintChatSubmit);
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
function setupSettings() {
  if (!settingsButton || !settingsModal) return;
  settingsButton.addEventListener('click', () => {
    if (settingsModalOpen) {
      closeSettingsModal();
    } else {
      openSettingsModal();
    }
  });

  settingsModal.addEventListener('click', event => {
    const target = event.target;
    if (target instanceof HTMLElement && target.dataset.dismiss === 'settings-modal') {
      closeSettingsModal();
    }
  });

  if (settingsModalClose) {
    settingsModalClose.addEventListener('click', () => closeSettingsModal());
  }

  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
  }

  difficultyInputs.forEach(input => {
    input.addEventListener('change', handleDifficultyChange);
  });

  roleInputs.forEach(input => {
    input.addEventListener('change', handleRoleChange);
    const label = input.closest('label');
    if (label) {
      label.addEventListener('click', event => handleRoleOptionClick(event, input));
    }
  });
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
    shouldAutoOpenSettings = true;
    updateSelectedAvatar(normalizeAvatarChoice(refreshed.avatar));
  } catch (err) {
    console.warn('Failed to restore session', err);
    localStorage.removeItem('just-one-player');
    player = null;
    shouldAutoOpenSettings = false;
  }

  updateLayout();
  maybeAutoOpenSettings();
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
  syncSettingsFromServer();
  syncAvailableAvatarsFromServer();

  const round = serverState?.round;
  const roundId = round?.id ?? null;
  const stage = round?.stage ?? null;

  if (player?.role === 'hint') {
    const reviewLocks = Array.isArray(round?.reviewLocks) ? round.reviewLocks : [];
    const playerLocked = reviewLocks.includes(player.id);
    if (!round || stage !== 'collecting_hints' || playerLocked) {
      stopHintTypingImmediate({ notify: true });
    }
  } else {
    stopHintTypingImmediate({ notify: true });
  }

  if (!round || stage !== 'collecting_hints' || player?.role !== 'hint') {
    resetHintDraft();
  }

  if (player?.role === 'guesser') {
    if (!round || stage !== 'awaiting_guess') {
      stopGuessTypingImmediate({ notify: true });
    }
  } else {
    stopGuessTypingImmediate({ notify: true });
  }

  if (!round || stage !== 'awaiting_guess' || player?.role !== 'guesser') {
    resetGuessDraft();
  }

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
    shouldAutoOpenSettings = true;
    updateSelectedAvatar(normalizeAvatarChoice(joined.avatar));
    updateLayout();
    openSettingsModal({ auto: true });
    maybeAutoOpenSettings();
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
    renderRoundProgress();
    renderEndGameControls();
    renderSettingsButtonState();
    applySettingsFormState();
    shouldAutoOpenSettings = false;
    closeSettingsModal(true);
    renderHintChat();
    return;
  }

  joinSection.classList.add('hidden');
  gameSection.classList.remove('hidden');

  renderPlayerInfo();
  renderPlayers();
  renderScore();
  renderRoundProgress();
  renderEndGameControls();
  renderSettingsButtonState();
  renderControls();
  renderRound();
  renderHintChat();
  renderLeaderboard();
  applySettingsFormState();
  renderSettingsButtonState();
  maybeAutoOpenSettings();
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
  const game = serverState?.game;
  const roundStage = round?.stage ?? null;

  if (!round) {
    const prompt = document.createElement('div');
    prompt.className = 'info-card subtle';
    if (game?.gameOver) {
      prompt.textContent = game.gameOverReason === 'completed'
        ? `Game finished after ${game.roundsCompleted}/${game.totalRounds} rounds.`
        : 'Game ended early by unanimous vote.';
    } else {
      prompt.textContent = 'Start a round to begin the fun.';
    }
    playerInfo.appendChild(prompt);
  } else if (roundStage && roundStage !== 'round_result') {
    const notice = document.createElement('div');
    notice.className = 'roles-locked';
    notice.textContent = 'Roles are locked until this round is complete.';
    playerInfo.appendChild(notice);
  }

  const difficultyNote = document.createElement('div');
  difficultyNote.className = 'settings-summary';
  const friendlyDifficulty = currentSettings.difficulty === 'hard' ? 'Hard mode' : 'Easy mode';
  difficultyNote.textContent = `Difficulty: ${friendlyDifficulty}`;
  playerInfo.appendChild(difficultyNote);

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
        container.appendChild(renderPlayerBadge(record, serverState.round));
      });
    }

    playersEl.appendChild(container);
  }
}

function renderPlayerBadge(playerRecord, round = null) {
  const pill = document.createElement('span');
  pill.className = 'player-pill';
  if (player && player.id === playerRecord.id) {
    pill.classList.add('is-self');
  }
  const voted = Boolean(playerRecord?.votedToEnd);
  if (voted) pill.classList.add('has-voted');

  const reviewLocks = Array.isArray(round?.reviewLocks) ? round.reviewLocks : [];
  const typingHints = Array.isArray(round?.typingHints) ? round.typingHints : [];
  const guesserTyping = Array.isArray(round?.guesserTyping) ? round.guesserTyping : [];
  const isReady = reviewLocks.includes(playerRecord.id);
  if (isReady && playerRecord.role === 'hint') {
    pill.classList.add('is-ready');
  }
  
  const avatarEl = document.createElement('span');
  avatarEl.className = 'player-pill-avatar';
  avatarEl.textContent = playerRecord.avatar || defaultAvatar;
  pill.appendChild(avatarEl);

  const nameEl = document.createElement('span');
  nameEl.className = 'player-pill-name';
  nameEl.textContent = playerRecord.name;
  pill.appendChild(nameEl);
  
  if (voted) {
    const indicator = document.createElement('span');
    indicator.className = 'player-vote-indicator';
    indicator.textContent = '🔴';
    pill.appendChild(indicator);
  }

  const isHintTyping = Boolean(
    round &&
    playerRecord.role === 'hint' &&
    round.stage === 'collecting_hints' &&
    typingHints.includes(playerRecord.id) &&
    !reviewLocks.includes(playerRecord.id)
  );

  const isGuesserTyping = Boolean(
    round &&
    playerRecord.role === 'guesser' &&
    round.stage === 'awaiting_guess' &&
    guesserTyping.includes(playerRecord.id)
  );

  const showTyping = isHintTyping || isGuesserTyping;

  if (showTyping) {
    pill.appendChild(buildTypingIndicator());
  }

  return pill;
}

function buildTypingIndicator() {
  const bubble = document.createElement('span');
  bubble.className = 'typing-indicator';
  bubble.setAttribute('role', 'status');
  bubble.setAttribute('aria-live', 'polite');
  for (let index = 0; index < 3; index += 1) {
    const dot = document.createElement('span');
    dot.className = 'typing-dot';
    dot.style.animationDelay = `${index * 0.2}s`;
    bubble.appendChild(dot);
  }
  return bubble;
}

function markHintTypingActivity() {
  if (!player || player.role !== 'hint') return;
  const round = serverState?.round;
  if (!round || round.stage !== 'collecting_hints') return;
  if (hintTypingState.timeoutId) {
    window.clearTimeout(hintTypingState.timeoutId);
    hintTypingState.timeoutId = null;
  }
  const wasActive = hintTypingState.active;
  hintTypingState.active = true;
  hintTypingState.timeoutId = window.setTimeout(() => {
    hintTypingState.timeoutId = null;
    hintTypingState.active = false;
    void sendHintTypingState(false);
  }, HINT_TYPING_IDLE_DELAY);
  if (!wasActive || hintTypingState.reported !== true) {
    void sendHintTypingState(true);
  }
}

function stopHintTypingImmediate({ notify = false } = {}) {
  if (hintTypingState.timeoutId) {
    window.clearTimeout(hintTypingState.timeoutId);
    hintTypingState.timeoutId = null;
  }
  const shouldNotify = notify || hintTypingState.active || hintTypingState.reported === true;
  hintTypingState.active = false;
  if (shouldNotify) {
    void sendHintTypingState(false);
  }
}

function resetHintDraft() {
  hintDraft.roundId = null;
  hintDraft.value = '';
  hintDraft.syncedValue = '';
}

function markGuessTypingActivity() {
  if (!player || player.role !== 'guesser') return;
  const round = serverState?.round;
  if (!round || round.stage !== 'awaiting_guess') return;
  if (guessTypingState.timeoutId) {
    window.clearTimeout(guessTypingState.timeoutId);
    guessTypingState.timeoutId = null;
  }
  const wasActive = guessTypingState.active;
  guessTypingState.active = true;
  guessTypingState.timeoutId = window.setTimeout(() => {
    guessTypingState.timeoutId = null;
    guessTypingState.active = false;
    void sendGuessTypingState(false);
  }, GUESS_TYPING_IDLE_DELAY);
  if (!wasActive || guessTypingState.reported !== true) {
    void sendGuessTypingState(true);
  }
}

function stopGuessTypingImmediate({ notify = false } = {}) {
  if (guessTypingState.timeoutId) {
    window.clearTimeout(guessTypingState.timeoutId);
    guessTypingState.timeoutId = null;
  }
  const shouldNotify = notify || guessTypingState.active || guessTypingState.reported === true;
  guessTypingState.active = false;
  if (shouldNotify) {
    void sendGuessTypingState(false);
  }
}

function resetGuessDraft() {
  guessDraft.roundId = null;
  guessDraft.stage = null;
  guessDraft.value = '';
}

async function sendHintTypingState(active) {
  if (!player) return;
  if (!serverState?.round) return;
  if (hintTypingState.reported === active) return;
  try {
    await apiPost('/api/hints/typing', { playerId: player.id, typing: active }, { silent: true });
    hintTypingState.reported = active;
  } catch (err) {
    hintTypingState.reported = null;
  }
}

async function sendGuessTypingState(active) {
  if (!player) return;
  if (!serverState?.round) return;
  if (guessTypingState.reported === active) return;
  try {
    await apiPost('/api/guess/typing', { playerId: player.id, typing: active }, { silent: true });
    guessTypingState.reported = active;
  } catch (err) {
    guessTypingState.reported = null;
  }
}

function renderScore() {
  if (!serverState) {
    stageIndicator.textContent = '';
    scoreboardEl.textContent = '';
    return;
  }
  const round = serverState.round;
  const game = serverState.game;
  if (game?.gameOver) {
    stageIndicator.textContent = game.gameOverReason === 'completed'
      ? 'Game finished'
      : 'Game ended early';
  } else {
    const stage = round?.stage ?? 'waiting';
    stageIndicator.textContent = formatStage(stage);
  }
  const { success, failure } = serverState.score;
  scoreboardEl.textContent = `Score: ${success} correct · ${failure} misses`;
}

function renderRoundProgress() {
  if (!roundProgressEl) return;
  if (!serverState?.game) {
    roundProgressEl.textContent = '';
    return;
  }
  const { totalRounds = 0, roundsCompleted = 0 } = serverState.game;
  if (!totalRounds) {
    roundProgressEl.textContent = '';
    return;
  }
  const roundActive = Boolean(serverState.round) && !serverState.game.gameOver;
  const displayNumber = Math.min(totalRounds, roundActive ? roundsCompleted + 1 : roundsCompleted);
  const label = roundActive
    ? `Round ${displayNumber}/${totalRounds} (in progress)`
    : `Round ${roundsCompleted}/${totalRounds}`;
  roundProgressEl.textContent = label;
}

function renderEndGameControls() {
  if (!endGameButton || !endGameStatus) return;
  if (!serverState?.game) {
    endGameButton.disabled = true;
    endGameButton.textContent = 'End game early';
    endGameStatus.textContent = '';
    if (resetGameButton) resetGameButton.classList.add('hidden');
    return;
  }

  const game = serverState.game;
  const totalPlayers = serverState.players.length;
  const votes = Number(game.endGameVotes?.count ?? 0);
  const playerRecord = player ? serverState.players.find(p => p.id === player.id) : null;
  const hasVoted = Boolean(playerRecord?.votedToEnd);

  if (game.gameOver) {
    endGameButton.disabled = true;
    endGameButton.textContent = 'Game ended';
    endGameStatus.textContent = game.gameOverReason === 'completed'
      ? `All ${game.roundsCompleted}/${game.totalRounds} rounds completed.`
      : 'Ended early by player votes.';
    if (resetGameButton) {
      resetGameButton.classList.remove('hidden');
      resetGameButton.disabled = !player;
    }
    return;
  }

  const canVote = Boolean(player) && totalPlayers > 0;
  endGameButton.disabled = !canVote;
  endGameButton.textContent = hasVoted ? 'Withdraw vote' : 'End game early';
  const baseStatus = totalPlayers > 0
    ? `Votes to end: ${votes}/${totalPlayers}`
    : 'Waiting for players to join.';
  endGameStatus.textContent = canVote ? baseStatus : `${baseStatus}${player ? '' : ' (join to vote)'}`;
  if (resetGameButton) {
    resetGameButton.classList.add('hidden');
  }
}

function renderSettingsButtonState() {
  if (!settingsButton) return;
  const canEdit = canEditSettings();
  settingsButton.disabled = !canEdit;
  settingsButton.title = canEdit
    ? 'Adjust game settings'
    : 'Settings available between rounds';
  if (!canEdit && settingsModalOpen) {
    closeSettingsModal(true);
  }
}

function renderLeaderboard() {
  if (!leaderboardPanel || !leaderboardList || !gameColumns) return;
  const board = serverState?.leaderboard ?? null;

  if (!player || !board) {
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

  const entries = Array.isArray(board.global) ? board.global : [];
  leaderboardList.innerHTML = '';

  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'leaderboard-empty';
    li.textContent = 'No hint data yet — keep those clues coming.';
    leaderboardList.appendChild(li);
  } else {
    entries.slice(0, 10).forEach((entry, index) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row';
      if (player && entry.playerId === player.id) {
        li.classList.add('is-self');
      }
      const metrics = entry.metrics || {};
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
      ${buildStatChip('Hint Survival Rate', `${formatMetricValue(metrics.hsr)}%`)}
      ${buildStatChip('Hint Success Rate', `${formatMetricValue(metrics.gar)}%`)}
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
  const game = serverState.game;
  if (!round) {
    const prompt = document.createElement('div');
    const gameOver = Boolean(game?.gameOver);
    if (gameOver) {
      const reason = game.gameOverReason === 'completed'
        ? `Game complete after ${game.roundsCompleted}/${game.totalRounds} rounds.`
        : 'Game ended early by unanimous vote.';
      prompt.className = 'info-card subtle';
      prompt.textContent = `${reason} Update settings to start a new game.`;
    } else {
      prompt.textContent = 'Ready to play? Anyone can kick off the first round.';
    }
    controlsEl.appendChild(prompt);
    const startButton = buildButton('Start new round', () => startRound());
    startButton.disabled = Boolean(game?.gameOver);
    controlsEl.appendChild(startButton);
    return;
  }

  switch (round.stage) {
    case 'collecting_hints':
      if (player.role === 'hint') {
        const reviewLocks = Array.isArray(round.reviewLocks) ? round.reviewLocks : [];
        const playerLocked = reviewLocks.includes(player.id);
        const playerHint = round.hints.find(h => h.playerId === player.id);
        if (playerLocked) {
          setControlsMessage('Hint locked. Waiting for other hint givers to review collisions.');
        } else {
          const button = buildButton('Review collisions', () => beginReview(), !playerHint);
          controlsEl.appendChild(button);
        }
      } else {
        setControlsMessage('Hint team is submitting clues.');
      }
      break;
    case 'reviewing_hints':
      if (player.role === 'hint') {
        controlsEl.appendChild(buildButton('Reveal valid clues to guesser', () => revealClues()));
      } else {
        setControlsMessage('Hint team is resolving collisions.');
      }
      break;
    case 'awaiting_guess':
      if (player.role === 'guesser') {
        const form = document.createElement('form');
        form.className = 'guess-form';
        const roundIdentifier = round.id ?? null;
        form.innerHTML = `
          <label>
            <span>Your guess</span>
            <input type="text" name="guess" autocomplete="off" required />
          </label>
          <button type="submit">Submit guess</button>
        `;
        const guessInput = form.querySelector('input[name="guess"]');
        if (guessDraft.roundId !== roundIdentifier || guessDraft.stage !== 'awaiting_guess') {
          guessDraft.roundId = roundIdentifier;
          guessDraft.stage = 'awaiting_guess';
          guessDraft.value = '';
        }
        if (guessInput) {
          guessInput.value = guessDraft.value;
          guessInput.addEventListener('input', () => {
            guessDraft.roundId = roundIdentifier;
            guessDraft.stage = 'awaiting_guess';
            guessDraft.value = guessInput.value;
            markGuessTypingActivity();
          });
          guessInput.addEventListener('blur', () => stopGuessTypingImmediate({ notify: true }));
        }
        form.addEventListener('submit', async evt => {
          evt.preventDefault();
          const guessValue = guessInput ? guessInput.value : '';
          const guess = guessValue.trim();
          if (!guess) {
            showMessage('Enter a guess first.', 'error');
            return;
          }
          guessDraft.roundId = roundIdentifier;
          guessDraft.stage = 'awaiting_guess';
          guessDraft.value = guess;
          stopGuessTypingImmediate({ notify: true });
          try {
            await submitGuess(guess);
            guessDraft.value = '';
            if (guessInput) {
              guessInput.value = '';
            }
            form.reset();
          } catch (err) {
            if (guessInput) {
              guessDraft.value = guessInput.value;
            }
          }
        });
        controlsEl.appendChild(form);
      } else if (player.role !== 'hint') {
        setControlsMessage('Waiting for the guesser to decide.');
      } else {
        controlsEl.innerHTML = '';
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
  const clueFocusState = captureClueFocusState();
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

  if (typeof round.number === 'number') {
    const badge = document.createElement('div');
    badge.className = 'round-number-badge';
    badge.textContent = `Round ${round.number}`;
    roundEl.appendChild(badge);
  }

  if (player.role === 'hint' && currentWord) {
    const card = document.createElement('div');
    card.className = 'word-card';
    card.textContent = currentWord;
    roundEl.appendChild(card);
  }

  const stage = round.stage;
  const reviewLocks = Array.isArray(round.reviewLocks) ? round.reviewLocks : [];
  const isHintPlayer = player.role === 'hint';
  const playerLocked = isHintPlayer && reviewLocks.includes(player.id);
  const roundIdentifier = round.id ?? null;
  const existingHint = isHintPlayer
    ? round.hints.find(h => h.playerId === player.id)
    : null;

  if (isHintPlayer && stage === 'collecting_hints') {
    const serverValue = existingHint ? (existingHint.text || '') : '';
    if (hintDraft.roundId !== roundIdentifier) {
      hintDraft.roundId = roundIdentifier;
      hintDraft.syncedValue = serverValue;
      hintDraft.value = serverValue;
    } else if (existingHint) {
      const wasSynced = hintDraft.value === hintDraft.syncedValue;
      hintDraft.syncedValue = serverValue;
      if (wasSynced) {
        hintDraft.value = serverValue;
      }
    } else {
      const wasSynced = hintDraft.value === hintDraft.syncedValue;
      hintDraft.syncedValue = '';
      if (wasSynced) {
        hintDraft.value = '';
      }
    }
  } else if (isHintPlayer && hintDraft.roundId !== roundIdentifier) {
    const fallbackValue = existingHint ? (existingHint.text || '') : '';
    hintDraft.roundId = roundIdentifier;
    hintDraft.syncedValue = fallbackValue;
    hintDraft.value = fallbackValue;
  }

  if (isHintPlayer && (playerLocked || stage !== 'collecting_hints')) {
    stopHintTypingImmediate({ notify: true });
  }

  const shouldShowHintList = isHintPlayer || round.hints.length > 0;
  if (shouldShowHintList) {
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

      const hintPlayerCanSeeText = isHintPlayer && stage !== 'collecting_hints';
      const canSeeText = hintPlayerCanSeeText
        || stage === 'round_result'
        || (player.role === 'guesser' && stage === 'awaiting_guess');

      let hintsForDisplay = player.role === 'guesser' && stage === 'awaiting_guess'
        ? round.hints.filter(h => !h.invalid)
        : [...round.hints];

      if (isHintPlayer && stage === 'collecting_hints' && !existingHint) {
        hintsForDisplay.unshift({
          id: '__draft__',
          playerId: player.id,
          avatar: player.avatar || defaultAvatar,
          text: hintDraft.value || '',
          author: player.name || 'You',
          isDraft: true
        });
      }

      let clueInputForFocus = null;

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

        const ownHint = hint.playerId === player.id;
        const canEditHint = ownHint && isHintPlayer && stage === 'collecting_hints' && !playerLocked;

        if (canEditHint) {
          const form = document.createElement('form');
          form.className = 'hint-inline-form';
          const input = document.createElement('input');
          input.type = 'text';
          input.name = 'clue';
          input.maxLength = 32;
          input.placeholder = 'Single word';
          input.autocomplete = 'off';
          input.value = hintDraft.value;
          form.appendChild(input);

          const submitButton = document.createElement('button');
          submitButton.type = 'submit';
          submitButton.className = 'hint-inline-submit';
          submitButton.textContent = 'Submit';
          form.appendChild(submitButton);

          form.addEventListener('submit', async evt => {
            evt.preventDefault();
            await simulateRandomClickAway(input);
            const value = input.value.trim();
            if (!value) {
              showMessage('Clue cannot be empty.', 'error');
              return;
            }
            hintDraft.roundId = roundIdentifier;
            hintDraft.value = value;
            stopHintTypingImmediate({ notify: true });
            await submitHint(value);
            hintDraft.syncedValue = value;
            input.value = value;
          });

          input.addEventListener('input', () => {
            hintDraft.roundId = roundIdentifier;
            hintDraft.value = input.value;
            markHintTypingActivity();
          });

          input.addEventListener('blur', () => stopHintTypingImmediate({ notify: true }));

          row.appendChild(form);
          clueInputForFocus = input;
        } else {
          const textEl = document.createElement('div');
          textEl.className = 'hint-text';
          if (canSeeText || ownHint) {
            textEl.textContent = hint.text || '';
          } else {
            textEl.textContent = 'Hidden';
            textEl.classList.add('hint-text-obscured');
          }
          row.appendChild(textEl);
        }

        content.appendChild(row);

        if (player.role === 'hint') {
          const meta = document.createElement('div');
          meta.className = 'meta';
          meta.textContent = hint.author;
          content.appendChild(meta);
        }

        li.appendChild(content);

        const votes = Array.isArray(hint.eliminationVotes)
          ? Array.from(new Set(hint.eliminationVotes))
          : [];
        const totalHintGivers = getHintGiverCount();
        const votesCount = Math.min(votes.length, totalHintGivers);
        const playerHasVoted = votes.includes(player?.id ?? '');

        if (player.role === 'hint' && stage === 'reviewing_hints') {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'hint-eliminate-button';
          if (playerHasVoted) {
            toggle.classList.add('is-voted');
          }
          const voteLabel = `${votesCount}/${totalHintGivers}`;
          toggle.textContent = playerHasVoted
            ? `Undo eliminate (${voteLabel})`
            : `Eliminate (${voteLabel})`;
          toggle.disabled = totalHintGivers === 0;
          toggle.addEventListener('click', () => toggleHintVote(hint));
          li.appendChild(toggle);
        }

        if (player.role === 'hint') {
          const voteStatus = document.createElement('div');
          voteStatus.className = 'hint-vote-status';
          if (totalHintGivers === 0) {
            voteStatus.textContent = 'No other hint givers yet.';
          } else if (votesCount === totalHintGivers) {
            voteStatus.textContent = 'All hint givers voted to eliminate.';
          } else if (votesCount === 0) {
            voteStatus.textContent = 'No eliminate votes yet.';
          } else {
            const voters = votes
              .map(id => getPlayerName(id))
              .filter(Boolean);
            const voterList = voters.length ? ` (${voters.join(', ')})` : '';
            voteStatus.textContent = `${votesCount}/${totalHintGivers} hint givers voted${voterList}.`;
          }
          li.appendChild(voteStatus);
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

      if (clueInputForFocus) {
        restoreClueFocus(clueInputForFocus, clueFocusState);
      }

      if (isHintPlayer && playerLocked && stage === 'collecting_hints') {
        const notice = document.createElement('div');
        notice.className = 'info-card subtle';
        notice.textContent = 'Your hint is locked. Waiting for other hint givers.';
        roundEl.appendChild(notice);
      }
    }
  } else if (player.role === 'guesser' && stage !== 'round_result') {
    const placeholder = document.createElement('div');
    placeholder.className = 'info-card subtle';
    placeholder.textContent = stage === 'reviewing_hints'
      ? 'Hint givers are reviewing clues before revealing them.'
      : 'Waiting for hint givers to submit their clues.';
    roundEl.appendChild(placeholder);
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

function renderHintChat() {
  if (!hintChatSection || !hintChatMessages || !hintChatStatus) return;
  const round = serverState?.round ?? null;
  const roundId = round?.id ?? null;

  if (roundId !== lastRenderedChatRoundId) {
    lastRenderedChatRoundId = roundId;
    hintChatAutoScroll = true;
  }

  if (!player || player.role !== 'hint' || !round) {
    hintChatSection.classList.add('hidden');
    hintChatStatus.textContent = '';
    if (hintChatMessages) {
      hintChatMessages.innerHTML = '';
    }
    return;
  }

  hintChatSection.classList.remove('hidden');

  const stage = round.stage;
  const messages = Array.isArray(round.chatMessages) ? round.chatMessages : [];
  const canChat = canUseHintChat();

  const statusText = (() => {
    switch (stage) {
      case 'collecting_hints':
        return 'Coordinate before sharing your clues.';
      case 'reviewing_hints':
        return 'Agree on collisions before reveal.';
      case 'awaiting_guess':
        return 'Chat paused while the guesser decides.';
      case 'round_result':
        return 'Chat closed until the next round.';
      default:
        return '';
    }
  })();
  hintChatStatus.textContent = statusText;

  if (hintChatInput) {
    hintChatInput.disabled = !canChat;
    hintChatInput.placeholder = canChat
      ? 'Discuss collisions here…'
      : 'Chat closed for this stage';
  }

  if (hintChatForm) {
    const submitButton = hintChatForm.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = !canChat;
    }
  }

  hintChatMessages.innerHTML = '';

  messages.forEach(message => {
    const isSelf = player && message.playerId === player.id;
    const wrapper = document.createElement('div');
    wrapper.className = 'hint-chat-message';
    if (isSelf) {
      wrapper.classList.add('self');
    }

    const avatarEl = document.createElement('div');
    avatarEl.className = 'hint-chat-avatar';
    avatarEl.textContent = message.avatar || '🙂';

    const bubble = document.createElement('div');
    bubble.className = 'hint-chat-bubble';

    const authorLine = document.createElement('div');
    authorLine.className = 'hint-chat-author';
    authorLine.textContent = message.name || 'Hint giver';
    if (message.createdAt) {
      const time = document.createElement('span');
      time.className = 'hint-chat-time';
      time.textContent = formatChatTimestamp(message.createdAt);
      authorLine.appendChild(time);
    }
    bubble.appendChild(authorLine);

    const textEl = document.createElement('div');
    textEl.className = 'hint-chat-text';
    textEl.textContent = message.text;
    bubble.appendChild(textEl);

    if (isSelf) {
      wrapper.appendChild(bubble);
      wrapper.appendChild(avatarEl);
    } else {
      wrapper.appendChild(avatarEl);
      wrapper.appendChild(bubble);
    }

    hintChatMessages.appendChild(wrapper);
  });

  if (hintChatAutoScroll) {
    hintChatMessages.scrollTop = hintChatMessages.scrollHeight;
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
    const result = await apiPost('/api/round/begin-review', { playerId: player.id });
    stopHintTypingImmediate({ notify: true });
    if (result?.readyToReview) {
      showMessage('All hint givers are now reviewing collisions.');
    } else if (!result?.alreadyLocked) {
      showMessage('Hint locked. Waiting for other hint givers.');
    }
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

async function handleHintChatSubmit(event) {
  event.preventDefault();
  if (!player || !hintChatInput) return;
  const canChat = canUseHintChat();
  if (!canChat) {
    showMessage('Chat is available while clues are being prepared.', 'error');
    return;
  }
  const text = hintChatInput.value.trim();
  if (!text) {
    return;
  }
  try {
    await apiPost('/api/round/chat', {
      playerId: player.id,
      text
    });
    hintChatInput.value = '';
    hintChatAutoScroll = true;
  } catch (err) {
    // message shown by apiPost
  }
}

async function toggleHintVote(hint) {
  if (!player) return;
  const votes = Array.isArray(hint.eliminationVotes) ? new Set(hint.eliminationVotes) : new Set();
  const hasVoted = votes.has(player.id);
  await apiPost(`/api/hints/${hint.id}/mark`, { playerId: player.id, invalid: !hasVoted });
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
      return 'Collecting hints';
    case 'reviewing_hints':
      return 'Reviewing collisions';
    case 'awaiting_guess':
      return 'Guess in progress';
    case 'round_result':
      return 'Round result';
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

function openSettingsModal({ auto = false } = {}) {
  if (!settingsModal || !settingsButton) return;
  if (!canEditSettings()) {
    if (!auto) {
      showMessage('Finish the current round before updating settings.', 'error');
    }
    return;
  }
  settingsModal.classList.remove('hidden');
  settingsModal.classList.remove('is-hiding');
  settingsModal.classList.add('is-visible');
  settingsModalOpen = true;
  shouldAutoOpenSettings = false;
  settingsButton.setAttribute('aria-expanded', 'true');
  applySettingsFormState();
  if (settingsTotalRoundsInput) {
    settingsTotalRoundsInput.value = String(currentSettings.totalRounds ?? 10);
    settingsTotalRoundsInput.focus({ preventScroll: true });
    settingsTotalRoundsInput.select();
  }
  document.addEventListener('keydown', handleSettingsKeydown);
}

function closeSettingsModal(force = false) {
  if (!settingsModal || !settingsButton || !settingsModalOpen) {
    if (force && settingsModal) {
      settingsModal.classList.add('hidden');
      settingsModal.classList.remove('is-visible');
      settingsModal.classList.remove('is-hiding');
    }
    return;
  }
  settingsModal.classList.remove('is-visible');
  if (force) {
    settingsModal.classList.add('hidden');
    settingsModal.classList.remove('is-hiding');
  } else {
    settingsModal.classList.add('is-hiding');
    window.setTimeout(() => {
      if (!settingsModalOpen) {
        settingsModal.classList.add('hidden');
        settingsModal.classList.remove('is-hiding');
      }
    }, 240);
  }
  settingsModalOpen = false;
  settingsButton.setAttribute('aria-expanded', 'false');
  if (!force) {
    settingsButton.focus({ preventScroll: true });
  }
  hideRoleWarning();
  document.removeEventListener('keydown', handleSettingsKeydown);
}

function handleSettingsKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSettingsModal();
  }
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  if (!player) {
    showMessage('Join the table first.', 'error');
    return;
  }
  if (!canEditSettings()) {
    showMessage('Finish the current round before updating settings.', 'error');
    applySettingsFormState();
    return;
  }
  if (!settingsTotalRoundsInput) return;
  const rawValue = Number(settingsTotalRoundsInput.value);
  const maxRounds = currentSettings.maxRounds ?? 20;
  if (!Number.isFinite(rawValue) || rawValue < 1 || rawValue > maxRounds) {
    showMessage(`Choose a number of rounds between 1 and ${maxRounds}.`, 'error');
    settingsTotalRoundsInput.value = String(currentSettings.totalRounds);
    return;
  }
  const totalRounds = Math.round(rawValue);
  const selectedDifficulty = difficultyInputs.find(input => input.checked)?.value === 'hard' ? 'hard' : 'easy';
  try {
    const response = await apiPost('/api/settings', {
      playerId: player.id,
      totalRounds,
      difficulty: selectedDifficulty
    });
    if (typeof response.totalRounds === 'number') {
      currentSettings.totalRounds = response.totalRounds;
    }
    if (typeof response.difficulty === 'string') {
      currentSettings.difficulty = response.difficulty === 'hard' ? 'hard' : 'easy';
    }
    applySettingsFormState();
    showMessage('Settings updated.');
    closeSettingsModal();
  } catch (err) {
    applySettingsFormState();
  }
}

async function handleDifficultyChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const value = target.value === 'hard' ? 'hard' : 'easy';
  if (!player) {
    showMessage('Join the table first.', 'error');
    applySettingsFormState();
    return;
  }
  if (!canEditSettings()) {
    showMessage('Finish the current round before updating settings.', 'error');
    applySettingsFormState();
    return;
  }
  if (value === currentSettings.difficulty) {
    return;
  }
  try {
    const response = await apiPost('/api/settings', {
      playerId: player.id,
      difficulty: value,
      totalRounds: currentSettings.totalRounds
    });
    if (typeof response.difficulty === 'string') {
      currentSettings.difficulty = response.difficulty === 'hard' ? 'hard' : 'easy';
    }
    if (typeof response.totalRounds === 'number') {
      currentSettings.totalRounds = response.totalRounds;
    }
    applySettingsFormState();
    showMessage(value === 'hard' ? 'Hard mode enabled.' : 'Easy mode enabled.');
  } catch (err) {
    applySettingsFormState();
  }
}

async function handleRoleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const value = target.value === 'guesser' ? 'guesser' : 'hint';
  if (!player) {
    showMessage('Join the table first.', 'error');
    applySettingsFormState();
    return;
  }
  const roundStage = serverState?.round?.stage ?? null;
  if (roundStage && roundStage !== 'round_result') {
    showMessage('Finish the current round before changing roles.', 'error');
    applySettingsFormState();
    return;
  }
  if (value === player.role) return;

  try {
    const { player: updated } = await apiPost('/api/join', {
      playerId: player.id,
      name: player.name,
      role: value
    });
    player = updated;
    localStorage.setItem('just-one-player', JSON.stringify(updated));
    showMessage(value === 'guesser' ? 'You are now the guesser.' : 'You are now a hint giver.');
  } catch (err) {
    if (typeof err?.message === 'string' && err.message.toLowerCase().includes('guesser')) {
      showRoleLimitWarning();
    }
  } finally {
    applySettingsFormState();
  }
}

function handleRoleOptionClick(event, input) {
  if (!(input instanceof HTMLInputElement)) return;
  if (!input.disabled) return;
  if (!player) return;
  if (input.value !== 'guesser') return;
  const roundStage = serverState?.round?.stage ?? null;
  if (roundStage && roundStage !== 'round_result') return;
  const guesserTaken = Boolean(serverState?.players?.some(p => p.role === 'guesser' && p.id !== player.id));
  if (!guesserTaken) return;
  event.preventDefault();
  showRoleLimitWarning();
}

function showRoleLimitWarning() {
  if (!roleWarningEl) return;
  if (roleWarningTimeout) {
    window.clearTimeout(roleWarningTimeout);
    roleWarningTimeout = null;
  }
  if (roleWarningClearTimeout) {
    window.clearTimeout(roleWarningClearTimeout);
    roleWarningClearTimeout = null;
  }
  roleWarningEl.textContent = 'There can be a maximum of one guesser at any time.';
  roleWarningEl.classList.add('is-visible');
  roleWarningTimeout = window.setTimeout(() => {
    roleWarningEl.classList.remove('is-visible');
    roleWarningTimeout = null;
    roleWarningClearTimeout = window.setTimeout(() => {
      roleWarningEl.textContent = '';
      roleWarningClearTimeout = null;
    }, 220);
  }, 2400);
}

function hideRoleWarning() {
  if (!roleWarningEl) return;
  if (roleWarningTimeout) {
    window.clearTimeout(roleWarningTimeout);
    roleWarningTimeout = null;
  }
  if (roleWarningClearTimeout) {
    window.clearTimeout(roleWarningClearTimeout);
    roleWarningClearTimeout = null;
  }
  roleWarningEl.classList.remove('is-visible');
  roleWarningEl.textContent = '';
}

function applySettingsFormState() {
  const canEdit = canEditSettings();
  if (settingsTotalRoundsInput) {
    const focused = document.activeElement === settingsTotalRoundsInput;
    if (!focused) {
      settingsTotalRoundsInput.value = String(currentSettings.totalRounds);
    }
    settingsTotalRoundsInput.min = '1';
    settingsTotalRoundsInput.max = String(currentSettings.maxRounds);
    settingsTotalRoundsInput.disabled = !canEdit;
  }
  const currentDifficulty = currentSettings.difficulty === 'hard' ? 'hard' : 'easy';
  difficultyInputs.forEach(input => {
    input.checked = input.value === currentDifficulty;
    input.disabled = !canEdit;
  });

  const roundStage = serverState?.round?.stage ?? null;
  const roundLocked = Boolean(roundStage && roundStage !== 'round_result');
  const currentRole = player?.role === 'guesser' ? 'guesser' : 'hint';
  const otherGuesserExists = Boolean(serverState?.players?.some(p => p.role === 'guesser' && p.id !== player?.id));
  roleInputs.forEach(input => {
    const isGuesser = input.value === 'guesser';
    input.checked = input.value === currentRole;
    const disableBecauseNoPlayer = !player;
    const disableBecauseRound = roundLocked;
    const disableBecauseTaken = isGuesser && otherGuesserExists && currentRole !== 'guesser';
    input.disabled = disableBecauseNoPlayer || disableBecauseRound || disableBecauseTaken;
  });
  if (!player || roundLocked || currentRole === 'guesser' || !otherGuesserExists) {
    hideRoleWarning();
  }
}

function maybeAutoOpenSettings() {
  if (!shouldAutoOpenSettings) return;
  if (!player) return;
  if (settingsModalOpen) return;
  if (!canEditSettings()) return;
  openSettingsModal({ auto: true });
}

function syncSettingsFromServer() {
  const game = serverState?.game;
  const settings = serverState?.settings;
  if (!game && !settings) return;
  const nextTotal = Number.isFinite(game?.totalRounds) ? Number(game.totalRounds) : currentSettings.totalRounds;
  const nextMax = Number.isFinite(game?.maxRounds) ? Number(game.maxRounds) : currentSettings.maxRounds;
  const nextDifficulty = settings?.difficulty === 'hard'
    ? 'hard'
    : settings?.difficulty === 'easy'
      ? 'easy'
      : currentSettings.difficulty;
  const changed = nextTotal !== currentSettings.totalRounds
    || nextMax !== currentSettings.maxRounds
    || nextDifficulty !== currentSettings.difficulty;
  currentSettings = {
    totalRounds: nextTotal,
    maxRounds: nextMax,
    difficulty: nextDifficulty
  };
  if (settingsTotalRoundsInput) {
    settingsTotalRoundsInput.max = String(currentSettings.maxRounds);
    if (changed && settingsModalOpen) {
      settingsTotalRoundsInput.value = String(currentSettings.totalRounds);
    }
  }
}

function canEditSettings() {
  return Boolean(player) && !serverState?.round;
}

function canUseHintChat() {
  if (!player || player.role !== 'hint') return false;
  const round = serverState?.round;
  if (!round) return false;
  return round.stage === 'collecting_hints' || round.stage === 'reviewing_hints';
}

function getHintGiverCount() {
  if (typeof serverState?.hintGiverCount === 'number') {
    return serverState.hintGiverCount;
  }
  if (!Array.isArray(serverState?.players)) return 0;
  return serverState.players.filter(p => p.role === 'hint').length;
}

function getPlayerName(id) {
  if (!Array.isArray(serverState?.players)) return null;
  const record = serverState.players.find(p => p.id === id);
  return record ? record.name : null;
}

function formatChatTimestamp(value) {
  const time = Number(value);
  if (!Number.isFinite(time)) return '';
  try {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (err) {
    return '';
  }
}

async function handleEndGameToggle() {
  if (!player) {
    showMessage('Join the table first.', 'error');
    return;
  }
  if (!serverState?.game) return;
  if (serverState.game.gameOver) {
    showMessage('Game already ended.', 'error');
    return;
  }

  const playerRecord = serverState.players.find(p => p.id === player.id);
  const hasVoted = Boolean(playerRecord?.votedToEnd);
  try {
    await apiPost('/api/game/end-vote', {
      playerId: player.id,
      vote: !hasVoted
    });
    showMessage(!hasVoted ? 'Vote recorded.' : 'Vote withdrawn.');
  } catch (err) {
    // message surfaced
  }
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

async function handleResetGame() {
  if (!player) {
    showMessage('Join the table first.', 'error');
    return;
  }
  try {
    await apiPost('/api/game/reset', { playerId: player.id });
    showMessage('Game reset. Ready for a new round.');
    shouldAutoOpenSettings = false;
    updateLayout();
  } catch (err) {}
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
  shouldAutoOpenSettings = false;
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
