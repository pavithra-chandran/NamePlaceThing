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

function generateRandomAlphabet() {
  const alphabetArray = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
                       'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
  const randomIndex = Math.floor(Math.random() * alphabetArray.length);
  return alphabetArray[randomIndex];
}

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

// ----------------- Robust 3-2-1 visual countdown -----------------
function scheduleThreeTwoOne(startTime, isGameStart = false) {
  if (!startTime) {
    clearLocalCountdown();
    return;
  }

  if (localCountdown.scheduledFor === startTime) return;

  const nowTs = Date.now();
  if (nowTs - localCountdown.lastCallAt < 200) {
    localCountdown.lastCallAt = nowTs;
  }
  localCountdown.lastCallAt = nowTs;

  clearLocalCountdown();

  localCountdown.scheduledFor = startTime;

  const serverNow = Date.now() + (serverTimeOffset || 0);
  const startAt = startTime;

  const offsets = [5000, 4000, 3000, 2000, 1000]; // show times before startAt for 5,4,3,2,1
  offsets.forEach((offset, idx) => {
    const showAt = startAt - offset;
    const delay = showAt - serverNow;
    const num = 5 - idx;

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

  // Redirect to game page shortly after start, ensure roundStartTime is set
  const redirectDelay = Math.max(5100, startAt - serverNow + 1100);
  const redirectTid = setTimeout(() => {
    if (isGameStart) {
      const alphabet = generateRandomAlphabet();
      gameRef.update({
        gameStarted: true,
        currentRound: 1,
        currentAlphabet: alphabet,
        roundStartTime: startAt,
        startTime: firebase.database.ServerValue.TIMESTAMP
      }).then(() => {
        window.location.href = `game-page.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
      });
    } else {
      window.location.href = `game-page.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
    }
  }, redirectDelay > 0 ? redirectDelay : 100);
  localCountdown.timeouts.push(redirectTid);

  // additional final cleanup to avoid leaks
  const cleanupTid = setTimeout(() => clearLocalCountdown(), Math.max(5000, redirectDelay + 1000));
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

    // Update existing elements instead of replacing innerHTML
    const titleEl = modal.querySelector('h2');
    if (titleEl) titleEl.textContent = 'Get Ready...';
    const numberEl = modal.querySelector('.countdown-number');
    if (numberEl) numberEl.textContent = n;

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

    // Update existing elements instead of replacing innerHTML
    const titleEl = modal.querySelector('h2');
    if (titleEl) titleEl.textContent = 'Get Ready...';
    const numberEl = modal.querySelector('.countdown-number');
    if (numberEl) numberEl.textContent = 'Go!';

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
let serverTimeOffset = 0;
const connectedRef = database.ref(".info/connected");
connectedRef.on("value", (snap) => {
  if (snap.val() === true) {
    const offsetRef = database.ref(".info/serverTimeOffset");
    offsetRef.on("value", (snap) => {
      serverTimeOffset = snap.val() || 0;
    });
  }
});

gameRef.on('value', (snapshot) => {
  const gameData = snapshot.val();
  if (!gameData) {
    if (DEBUG_MODE) console.warn("No game data");
    setTimeout(() => { window.location.href = "index.html"; }, 1200);
    return;
  }

  currentRound = gameData.currentRound || 1;

  // Handle gameStartTime
  if (gameData.gameStartTime && !gameData.gameStarted) {
    // schedule modal 3-2-1 for game start
    scheduleThreeTwoOne(gameData.gameStartTime, true);
  }

  // Handle roundStartTime
  if (gameData.roundStartTime && !gameData.roundCompleted?.[currentRound] && !gameData.scoringPhase) {
    // schedule modal 3-2-1
    scheduleThreeTwoOne(gameData.roundStartTime);
  }
});

