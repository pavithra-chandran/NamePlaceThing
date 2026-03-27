/* game-page.js - FIX: prevent '1' from getting stuck
   Changes:
   - Modal uses data-count attribute for robust matching.
   - scheduleThreeTwoOne now schedules an unconditional hide at roundStartTime.
   - hideCountdownIfNumber is tolerant and falls back to unconditional hide.
   - When roundStartTime is reached (round starts), we call clearLocalCountdown() before starting the timer.
*/

const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const playerName = urlParams.get('name');
const DEBUG_MODE = true; // set true for console logs

if (!roomCode || !playerName) {
  alert("Invalid room or player name");
  setTimeout(() => { window.location.href = "index.html"; }, 1200);
}

const gameRef = database.ref('games/' + roomCode);

let currentRound = 1;
let selectedRounds = 5;
let currentAlphabet = "";
let timerInterval = null;
const ROUND_DURATION = 60;
let secondsLeft = ROUND_DURATION;
let hasSubmitted = false;
let isHost = false;
let gameStarted = false;
let letterHistory = [];
let connectedPlayers = [];
let serverTimeOffset = 0;

// Single local countdown control to avoid duplicates
const localCountdown = {
  type: null,        // 'start' | 'round' | null
  value: 0,          // current displayed seconds
  interval: null,    // interval id (not used for scheduled timeouts)
  visible: false,    // whether modal is currently displayed
  lastCallAt: 0,     // timestamp of last entry to showCountdown (ms)
  timeouts: [],      // array of timeout ids for cleanup
  scheduledFor: null // roundStartTime this client has scheduled for
};

// Host writer interval id (so we can cancel it cleanly)
let hostWriterInterval = null;

// ----------------- Robust 3-2-1 visual countdown -----------------
function scheduleThreeTwoOne(roundStartTime) {
  if (!roundStartTime) {
    clearLocalCountdown();
    return;
  }

  // If already scheduled for this exact roundStartTime, skip re-scheduling
  if (localCountdown.scheduledFor === roundStartTime) return;

  // debounce quick repeated calls
  const nowTs = Date.now();
  if (nowTs - localCountdown.lastCallAt < 200) {
    localCountdown.lastCallAt = nowTs;
  }
  localCountdown.lastCallAt = nowTs;

  // clear previous schedules
  clearLocalCountdown();

  localCountdown.scheduledFor = roundStartTime;

  const serverNow = Date.now() + (serverTimeOffset || 0);
  const startAt = roundStartTime;

  const offsets = [3000, 2000, 1000]; // show times before startAt for 3,2,1
  offsets.forEach((offset, idx) => {
    const showAt = startAt - offset;
    const delay = showAt - serverNow;
    const num = 3 - idx;

    if (delay <= 0) {
      const tid = setTimeout(() => showCountdownNumber(num), 10);
      localCountdown.timeouts.push(tid);
    } else {
      const tid = setTimeout(() => showCountdownNumber(num), delay);
      localCountdown.timeouts.push(tid);
    }

    // hide this specific number ~1s after show time (best-effort)
    const hideAt = showAt + 1000;
    const hideDelay = hideAt - serverNow;
    const hid = setTimeout(() => hideCountdownIfNumber(num), hideDelay > 0 ? hideDelay : 1100);
    localCountdown.timeouts.push(hid);
  });

  // Show "Go!" at roundStartTime
  const goDelay = startAt - serverNow;
  const goTid = setTimeout(() => showCountdownGo(), goDelay > 0 ? goDelay : 10);
  localCountdown.timeouts.push(goTid);

  // Hide "Go!" after 1 second
  const goHideDelay = (startAt + 1000) - serverNow;
  const goHideTid = setTimeout(() => hideCountdownIfGo(), goHideDelay > 0 ? goHideDelay : 1010);
  localCountdown.timeouts.push(goHideTid);

  // Unconditionally hide at exact roundStartTime + 1100ms (safety)
  const unconditionalHideDelay = startAt - serverNow + 1100;
  const finalHideTid = setTimeout(() => {
    // If the round actually started we want the modal gone
    hideCountdownUnconditionally();
    // clear all local scheduled timeouts now
    clearLocalCountdown();
  }, unconditionalHideDelay > 0 ? unconditionalHideDelay : 100);
  localCountdown.timeouts.push(finalHideTid);

  // additional final cleanup to avoid leaks
  const cleanupTid = setTimeout(() => clearLocalCountdown(), Math.max(5000, unconditionalHideDelay + 1000));
  localCountdown.timeouts.push(cleanupTid);
}

function showCountdownNumber(n) {
  try {
    const modal = document.getElementById("countdownModal");
    if (!modal) return;

    localCountdown.lastCallAt = Date.now();
    localCountdown.visible = true;
    localCountdown.type = 'start';

    // set data-count attribute for robust matching
    modal.setAttribute('data-count', String(n));

    modal.innerHTML = `
      <div class="countdown-inner" style="text-align:center;">
        <div class="countdown-title" style="font-weight:700;font-size:20px;margin-bottom:8px;">Get Ready...</div>
        <div class="countdown-number" style="font-size:96px;font-weight:900;line-height:1;">${n}</div>
      </div>
    `;
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";

    if (localCountdown.interval) {
      try { clearInterval(localCountdown.interval); } catch (e) {}
      localCountdown.interval = null;
    }
  } catch (e) {
    if (DEBUG_MODE) console.error("showCountdownNumber error", e);
  }
}

function showCountdownGo() {
  try {
    const modal = document.getElementById("countdownModal");
    if (!modal) return;

    localCountdown.lastCallAt = Date.now();
    localCountdown.visible = true;
    localCountdown.type = 'start';

    modal.setAttribute('data-count', 'go');

    modal.innerHTML = `
      <div class="countdown-inner" style="text-align:center;">
        <div class="countdown-title" style="font-weight:700;font-size:20px;margin-bottom:8px;">Get Ready...</div>
        <div class="countdown-number" style="font-size:96px;font-weight:900;line-height:1;">Go!</div>
      </div>
    `;
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";

    if (localCountdown.interval) {
      try { clearInterval(localCountdown.interval); } catch (e) {}
      localCountdown.interval = null;
    }
  } catch (e) {
    if (DEBUG_MODE) console.error("showCountdownGo error", e);
  }
}

// Hide only if the modal currently indicates the same number.
// Falls back to unconditional hide if parsing fails or if mismatch occurs for safety.
function hideCountdownIfNumber(n) {
  const modal = document.getElementById("countdownModal");
  if (!modal) return;
  try {
    const dataAttr = modal.getAttribute('data-count');
    if (dataAttr != null) {
      const displayed = parseInt(dataAttr, 10);
      if (!Number.isNaN(displayed) && displayed === n) {
        modal.style.display = "none";
        modal.removeAttribute('data-count');
        localCountdown.visible = false;
        localCountdown.type = null;
        return;
      }
    }
    // fallback: if data-count not present or mismatched, but the modal shows same text content, hide anyway
    const numEl = modal.querySelector('.countdown-number');
    if (numEl) {
      const txt = parseInt(numEl.textContent.trim(), 10);
      if (!Number.isNaN(txt) && txt === n) {
        modal.style.display = "none";
        modal.removeAttribute('data-count');
        localCountdown.visible = false;
        localCountdown.type = null;
        return;
      }
    }
    // If we reach here, don't forcibly hide (so later numbers can be shown). But if stuck conditions are detected,
    // perform an unconditional hide to avoid a permanently stuck modal.
    // Safety: hide if this was the last scheduled hide (n===1) and it still shows 1 (best-effort).
    if (n === 1) {
      hideCountdownUnconditionally();
    }
  } catch (e) {
    if (DEBUG_MODE) console.error("hideCountdownIfNumber error", e);
    hideCountdownUnconditionally();
  }
}

function hideCountdownIfGo() {
  const modal = document.getElementById("countdownModal");
  if (!modal) return;
  try {
    const dataAttr = modal.getAttribute('data-count');
    if (dataAttr === 'go') {
      modal.style.display = "none";
      modal.removeAttribute('data-count');
      localCountdown.visible = false;
      localCountdown.type = null;
    }
  } catch (e) {
    if (DEBUG_MODE) console.error("hideCountdownIfGo error", e);
    hideCountdownUnconditionally();
  }
}

function hideCountdownUnconditionally() {
  const modal = document.getElementById("countdownModal");
  if (!modal) return;
  try {
    modal.style.display = "none";
    modal.removeAttribute('data-count');
  } catch (e) { if (DEBUG_MODE) console.error(e); }
  localCountdown.visible = false;
  localCountdown.type = null;
}

// Clears scheduled timeouts, hides modal and resets scheduling metadata
function clearLocalCountdown() {
  if (localCountdown.timeouts && localCountdown.timeouts.length) {
    localCountdown.timeouts.forEach(tid => {
      try { clearTimeout(tid); } catch (e) {}
    });
  }
  localCountdown.timeouts = [];
  localCountdown.scheduledFor = null;
  localCountdown.lastCallAt = Date.now();
  localCountdown.type = null;
  localCountdown.value = 0;
  localCountdown.visible = false;
  if (localCountdown.interval) {
    try { clearInterval(localCountdown.interval); } catch (e) {}
    localCountdown.interval = null;
  }
  const modal = document.getElementById("countdownModal");
  if (modal) {
    try { modal.style.display = "none"; modal.removeAttribute('data-count'); } catch (e) {}
  }
}
// --------------------------------------------------------------------------

// Firebase server offset for accurate timestamps
const connectedRef = database.ref(".info/connected");
connectedRef.on("value", (snap) => {
  if (snap.val() === true) {
    const offsetRef = database.ref(".info/serverTimeOffset");
    offsetRef.on("value", (snap) => {
      serverTimeOffset = snap.val() || 0;
    });
  }
});

// update player name display if present
const playerNameEl = document.getElementById('playerNameDisplay');
if (playerNameEl) playerNameEl.textContent = playerName;

gameRef.on('value', (snapshot) => {
  const gameData = snapshot.val();
  if (!gameData) {
    if (DEBUG_MODE) console.warn("No game data");
    setTimeout(() => { window.location.href = "index.html"; }, 1200);
    return;
  }

  if (gameData.players) connectedPlayers = Object.keys(gameData.players);

  isHost = gameData.host === playerName;
  const hostIndicator = document.getElementById("hostIndicator");
  const startBtnContainer = document.getElementById("startButtonContainer");
  if (hostIndicator) hostIndicator.style.display = isHost ? "block" : "none";
  if (startBtnContainer) startBtnContainer.style.display = (isHost && !gameData.gameStarted) ? "block" : "none";

  if (gameData.players && gameData.players[playerName] && gameData.players[playerName].avatar) {
    const avatarEl = document.getElementById("playerAvatar");
    if (avatarEl) avatarEl.src = gameData.players[playerName].avatar;
  }

  selectedRounds = parseInt(gameData.rounds) || selectedRounds;
  currentRound = gameData.currentRound || 1;

  const remainingRoundsEl = document.getElementById("remainingRounds");
  if (remainingRoundsEl) remainingRoundsEl.textContent = `Round ${currentRound} of ${selectedRounds}`;

  if (currentAlphabet !== gameData.currentAlphabet || (gameData.gameStarted && !gameStarted)) {
    currentAlphabet = gameData.currentAlphabet;
    const alphabetContainer = document.getElementById("alphabetContainer");
    if (alphabetContainer) alphabetContainer.textContent = currentAlphabet;

    if (currentAlphabet && !letterHistory.includes(currentAlphabet)) letterHistory.push(currentAlphabet);
    hasSubmitted = false;
    resetRound(gameData);
  }

  gameStarted = gameData.gameStarted;

  updateScoresDisplay(gameData.players);

  if (gameData.scoringPhase === true) {
    const timerEl = document.getElementById("timer");
    if (timerEl) {
      timerEl.textContent = "Scoring";
      timerEl.style.backgroundColor = "#6c757d";
      timerEl.style.color = "white";
    }
    const inputs = document.querySelectorAll('.user-input input');
    inputs.forEach(i => i.disabled = true);
    const sb = document.getElementById("submitBtn"); if (sb) sb.style.display = "none";

    if (!gameData.players[playerName].scoringComplete || !gameData.players[playerName].scoringComplete[currentAlphabet]) {
      window.location.href = `scoring.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
      return;
    } else {
      const waitingModal = document.getElementById("waitingModal");
      if (waitingModal) waitingModal.style.display = "flex";
    }

  } else {
    const waitingModal = document.getElementById("waitingModal");
    if (waitingModal) waitingModal.style.display = "none";

    if (isHost && gameData.nextRound && !gameData.roundCountdown && gameData.gameStarted && !gameData.roundStartTime) {
      gameRef.once('value').then(snap => {
        const gd = snap.val() || {};
        if (!gd.roundStartTime && gd.nextAlphabet && gd.nextRound) {
          const now = Date.now() + serverTimeOffset + 5000;
          return gameRef.update({
            currentAlphabet: gd.nextAlphabet,
            currentRound: gd.nextRound,
            roundStartTime: now,
            nextAlphabet: null,
            nextRound: null
          });
        }
      }).catch(err => { if (DEBUG_MODE) console.error(err); });
    }
  }

  if (gameData.gameCompleted) {
    clearInterval(timerInterval);
    window.location.href = `winner.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
    return;
  }

  // Core: handle roundStartTime
  if (gameData.roundStartTime && !gameData.roundCompleted?.[currentRound] && !gameData.scoringPhase) {
    const currentTime = Date.now() + serverTimeOffset;
    const timeUntilStart = gameData.roundStartTime - currentTime;

    if (timeUntilStart > 1000) {
      // Redirect to countdown page
      window.location.href = `countdown.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
    } else {
      // Round has started --- start timer
      const elapsed = Math.floor((currentTime - gameData.roundStartTime) / 1000);
      secondsLeft = Math.max(0, ROUND_DURATION - elapsed);

      if (secondsLeft <= 0) {
        endRound(false);
      } else {
        if (!timerInterval) {
          startTimer();
        }
      }
      revealGameFields();
    }
  } else if (!gameData.roundStartTime && !gameData.scoringPhase) {
    const timerEl = document.getElementById("timer");
    if (timerEl) timerEl.textContent = formatTime(ROUND_DURATION);
  }

});

// ----------------- Host-written countdown helpers -----------------
const startBtnContainer = document.getElementById("startButtonContainer");
if (startBtnContainer) {
  startBtnContainer.addEventListener("click", () => {
    if (!isHost) return;
    gameRef.once('value').then(snap => {
      const gd = snap.val() || {};
      if (!gd.gameStarted) {
        const newAlphabet = generateUniqueAlphabet(gd.letterHistory || []);
        const now = Date.now() + serverTimeOffset + 5000;
        return gameRef.update({
          gameStarted: true,
          currentAlphabet: newAlphabet,
          currentRound: 1,
          roundStartTime: now,
          letterHistory: (gd.letterHistory || []).concat(newAlphabet || [])
        }).then(() => {
          setTimeout(() => {
            window.location.href = `countdown.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
          }, 500);
        });
      }
    }).catch(err => { if (DEBUG_MODE) console.error(err); });
    startBtnContainer.style.display = "none";
  });
}

// ------------------ Timer, reveal UI, round logic ------------------
function revealGameFields() {
  const wm = document.getElementById("waitingMessage"); if (wm) wm.style.display = "none";
  const modal = document.getElementById("countdownModal");
  if (modal && !localCountdown.visible && !localCountdown.scheduledFor) modal.style.display = "none";

  const gameContainer = document.getElementById("gameContainer") || document.getElementById("playingArea");
  if (gameContainer) gameContainer.style.display = "block";

  const inputs = document.querySelectorAll('.user-input input');
  inputs.forEach(i => { if (!hasSubmitted) i.disabled = false; });

  const sb = document.getElementById("submitBtn"); if (sb && !hasSubmitted) sb.style.display = "block";

  const timerEl = document.getElementById("timer");
  if (timerEl && (timerEl.textContent === "Starting..." || timerEl.textContent === "")) {
    timerEl.textContent = formatTime(secondsLeft || ROUND_DURATION);
  }

  const sc = document.getElementById("scoresDisplay"); if (sc) sc.style.display = "block";
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  updateTimerDisplay();

  timerInterval = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      endRound(false);
    } else if (secondsLeft <= 10) {
      const t = document.getElementById("timer"); if (t) t.classList.add("timer-warning");
    }
  }, 1000);
}

function updateTimerDisplay() {
  const t = document.getElementById("timer");
  if (!t) return;

  const timeText = formatTime(secondsLeft);
  t.textContent = timeText;
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
// ------------------------------------------------------------------

// ----------------- Round reset / answers / submission -----------------
function resetRound(gameData) {
  ['name','place','thing','animal','movie'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  const inputs = document.querySelectorAll('.user-input input');
  if (gameData.gameStarted) {
    inputs.forEach(i => {
      i.disabled = false;
      i.removeEventListener('input', saveTempAnswers);
      i.addEventListener('input', saveTempAnswers);
    });
    const sb = document.getElementById("submitBtn"); if (sb) sb.style.display = "block";
  } else {
    inputs.forEach(i => i.disabled = true);
    const sb = document.getElementById("submitBtn"); if (sb) sb.style.display = "none";
  }

  const timerEl = document.getElementById("timer");
  if (timerEl) {
    timerEl.classList.remove("timer-warning");
    timerEl.style.backgroundColor = "";
    timerEl.style.color = "white";
  }
  secondsLeft = ROUND_DURATION;

  updateTimerDisplay();

  if (gameData.players &&
      gameData.players[playerName] &&
      gameData.players[playerName].answers &&
      gameData.players[playerName].answers[currentAlphabet]) {
    hasSubmitted = true;
    const saved = gameData.players[playerName].answers[currentAlphabet];
    if (saved) {
      if (document.getElementById("name")) document.getElementById("name").value = saved.name || "";
      if (document.getElementById("place")) document.getElementById("place").value = saved.place || "";
      if (document.getElementById("thing")) document.getElementById("thing").value = saved.thing || "";
      if (document.getElementById("animal")) document.getElementById("animal").value = saved.animal || "";
      if (document.getElementById("movie")) document.getElementById("movie").value = saved.movie || "";
    }
    inputs.forEach(i => i.disabled = true);
    const sb = document.getElementById("submitBtn"); if (sb) sb.style.display = "none";
  } else if (gameData.players &&
             gameData.players[playerName] &&
             gameData.players[playerName].tempAnswers &&
             gameData.players[playerName].tempAnswers[currentAlphabet]) {
    hasSubmitted = false;
    const temp = gameData.players[playerName].tempAnswers[currentAlphabet];
    if (document.getElementById("name")) document.getElementById("name").value = temp.name || "";
    if (document.getElementById("place")) document.getElementById("place").value = temp.place || "";
    if (document.getElementById("thing")) document.getElementById("thing").value = temp.thing || "";
    if (document.getElementById("animal")) document.getElementById("animal").value = temp.animal || "";
    if (document.getElementById("movie")) document.getElementById("movie").value = temp.movie || "";
  } else {
    hasSubmitted = false;
  }

  const msg = document.getElementById("messageBox"); if (msg) msg.style.display = "none";

  const gameContainer = document.getElementById("gameContainer") || document.getElementById("playingArea");
  if (gameContainer) gameContainer.style.display = "none";
}

function saveTempAnswers() {
  const answers = {
    name: (document.getElementById("name") ? document.getElementById("name").value.trim() : ""),
    place: (document.getElementById("place") ? document.getElementById("place").value.trim() : ""),
    thing: (document.getElementById("thing") ? document.getElementById("thing").value.trim() : ""),
    animal: (document.getElementById("animal") ? document.getElementById("animal").value.trim() : ""),
    movie: (document.getElementById("movie") ? document.getElementById("movie").value.trim() : "")
  };
  gameRef.update({ [`players/${playerName}/tempAnswers/${currentAlphabet}`]: answers }).catch(err => { if (DEBUG_MODE) console.error(err); });
}

function endRound(completed) {
  clearInterval(timerInterval);
  timerInterval = null;

  if (!completed && !hasSubmitted) {
    hasSubmitted = true;
    const name = document.getElementById("name") ? document.getElementById("name").value.trim() : "";
    const place = document.getElementById("place") ? document.getElementById("place").value.trim() : "";
    const thing = document.getElementById("thing") ? document.getElementById("thing").value.trim() : "";
    const animal = document.getElementById("animal") ? document.getElementById("animal").value.trim() : "";
    const movie = document.getElementById("movie") ? document.getElementById("movie").value.trim() : "";

    const submittedFields = {
      name: name !== '',
      place: place !== '',
      thing: thing !== '',
      animal: animal !== '',
      movie: movie !== ''
    };

    gameRef.update({
      [`players/${playerName}/answers/${currentAlphabet}`]: {
        name, place, thing, animal, movie, submittedFields,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      },
      [`players/${playerName}/submitted/${currentAlphabet}`]: true
    }).catch(err => { if (DEBUG_MODE) console.error(err); });
  }

  const inputs = document.querySelectorAll('.user-input input'); inputs.forEach(i => i.disabled = true);
  const sb = document.getElementById("submitBtn"); if (sb) sb.style.display = "none";

  if (isHost) {
    gameRef.child(`roundCompleted/${currentRound}`).set(true).catch(err => { if (DEBUG_MODE) console.error(err); });
    setTimeout(() => {
      gameRef.update({ scoringPhase: true, roundStartTime: null }).catch(err => { if (DEBUG_MODE) console.error(err); });
    }, 1000);
  }
}
// ------------------------------------------------------------------

// ---------------- Submit button hookup ----------------
const submitBtn = document.getElementById("submitBtn");
if (submitBtn) {
  submitBtn.addEventListener("click", () => {
    if (hasSubmitted) { showMessage("You've already submitted for this letter"); return; }
    const name = document.getElementById("name") ? document.getElementById("name").value.trim() : "";
    const place = document.getElementById("place") ? document.getElementById("place").value.trim() : "";
    const thing = document.getElementById("thing") ? document.getElementById("thing").value.trim() : "";
    const animal = document.getElementById("animal") ? document.getElementById("animal").value.trim() : "";
    const movie = document.getElementById("movie") ? document.getElementById("movie").value.trim() : "";

    const submittedFields = { name: name !== '', place: place !== '', thing: thing !== '', animal: animal !== '', movie: movie !== '' };
    hasSubmitted = true;

    const answers = { name, place, thing, animal, movie, submittedFields, timestamp: firebase.database.ServerValue.TIMESTAMP };
    const updates = { [`players/${playerName}/answers/${currentAlphabet}`]: answers, [`players/${playerName}/submitted/${currentAlphabet}`]: true };

    gameRef.update(updates)
      .then(() => gameRef.once('value'))
      .then(snapshot => {
        const gameData = snapshot.val();
        if (!gameData.scoringPhase) {
          const roundUpdates = { scoringPhase: true, [`roundCompleted/${currentRound}`]: true, roundStartTime: null };
          for (const pid in gameData.players || {}) {
            if (!gameData.players[pid].submitted || !gameData.players[pid].submitted[currentAlphabet]) {
              const temp = gameData.players[pid].tempAnswers?.[currentAlphabet] || {};
              const sf = {
                name: (temp.name || '').trim() !== '',
                place: (temp.place || '').trim() !== '',
                thing: (temp.thing || '').trim() !== '',
                animal: (temp.animal || '').trim() !== '',
                movie: (temp.movie || '').trim() !== ''
              };
              roundUpdates[`players/${pid}/answers/${currentAlphabet}`] = {
                name: temp.name || '', place: temp.place || '', thing: temp.thing || '',
                animal: temp.animal || '', movie: temp.movie || '', submittedFields: sf,
                timestamp: firebase.database.ServerValue.TIMESTAMP
              };
              roundUpdates[`players/${pid}/submitted/${currentAlphabet}`] = true;
            }
          }
          return gameRef.update(roundUpdates);
        }
      })
      .then(() => {
        window.location.href = `scoring.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
      })
      .catch(err => { if (DEBUG_MODE) console.error(err); showMessage('Failed to submit answers. Please try again.', 'error'); });
  });
}
// ------------------------------------------------------------------

// ---------------- Utility UI helpers ----------------
function showMessage(message, type = "error") {
  const messageBox = document.getElementById("messageBox");
  if (!messageBox) return;
  messageBox.innerHTML = `
    <div class="d-flex align-items-center">
      ${type === "success" ? '<i class="fas fa-check-circle me-2"></i>' :
        type === "info" ? '<i class="fas fa-info-circle me-2"></i>' :
        '<i class="fas fa-exclamation-circle me-2"></i>'}
      <span>${message}</span>
    </div>`;
  messageBox.style.display = "block";
  if (type === "success") { messageBox.style.backgroundColor = "#d4edda"; messageBox.style.color = "#155724"; }
  else if (type === "info") { messageBox.style.backgroundColor = "#d1ecf1"; messageBox.style.color = "#0c5460"; }
  else { messageBox.style.backgroundColor = "#f8d7da"; messageBox.style.color = "#721c24"; }
  setTimeout(() => { messageBox.style.animation = "slideOut 0.5s ease"; setTimeout(() => { messageBox.style.display = "none"; messageBox.style.animation = ""; }, 500); }, 3000);
}

function updateScoresDisplay(players) {
  const scoresDisplay = document.getElementById("scoresDisplay");
  if (!scoresDisplay || !players) return;
  scoresDisplay.innerHTML = "";
  const playersArray = Object.entries(players).map(([id, player]) => ({ id, name: player.name, score: player.score || 0 }));
  playersArray.sort((a, b) => b.score - a.score);
  playersArray.forEach(player => {
    const playerScoreElement = document.createElement("div");
    playerScoreElement.className = `player-score ${player.id === playerName ? "current-player" : ""}`;
    playerScoreElement.innerHTML = `<span><i class="fas fa-user me-2"></i>${player.name}</span><span>${player.score} <i class="fas fa-star"></i></span>`;
    scoresDisplay.appendChild(playerScoreElement);
  });
}

function generateUniqueAlphabet(usedLetters) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const available = alphabet.split('').filter(l => !usedLetters.includes(l));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

window.addEventListener('beforeunload', () => {
  if (isHost) {
    gameRef.update({ gameStatus: "hostLeft" }).catch(err => { if (DEBUG_MODE) console.error(err); });
  }
});


