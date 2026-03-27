const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const playerName = urlParams.get('name');
const DEBUG_MODE = true;

if (!roomCode || !playerName) {
  if (DEBUG_MODE) console.log('Missing roomCode or playerName, redirecting to index.html');
  window.location.href = "index.html";
}

const gameRef = database.ref('games/' + roomCode);
let currentAlphabet = "";
let isHost = false;
let connectedPlayers = [];
const allCategories = ['name', 'place', 'thing', 'animal', 'movie'];

gameRef.on('value', (snapshot) => {
  const gameData = snapshot.val();
  if (DEBUG_MODE) console.log('GameRef Snapshot:', JSON.stringify(gameData, null, 2));
  if (!gameData) {
    if (DEBUG_MODE) console.log('No game data found, redirecting to index.html');
    window.location.href = "index.html";
    return;
  }

  currentAlphabet = gameData.currentAlphabet || "";
  isHost = gameData.host === playerName;
  connectedPlayers = Object.keys(gameData.players || {});
  if (DEBUG_MODE) console.log('Current Alphabet:', currentAlphabet, 'Is Host:', isHost, 'Connected Players:', connectedPlayers);

  if (gameData.gameCompleted) {
    if (DEBUG_MODE) console.log('Game completed, redirecting to winner.html');
    window.location.href = `winner.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
    return;
  }

  if (!gameData.scoringPhase) {
    if (DEBUG_MODE) console.log('Not in scoring phase, redirecting to game-page.html');
    window.location.href = `game-page.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
    return;
  }

  showScoringContent();
  checkAllPlayersScored(gameData);
});

function showScoringContent() {
  if (DEBUG_MODE) console.log('Entering showScoringContent');
  gameRef.once('value').then((snapshot) => {
    const gameData = snapshot.val();
    if (DEBUG_MODE) console.log('showScoringContent Game Data:', JSON.stringify(gameData, null, 2));
    if (!gameData) {
      if (DEBUG_MODE) console.log('No game data in showScoringContent, exiting');
      showScoringMessage('No game data available.', 'error');
      return;
    }

    const players = gameData.players || {};
    if (DEBUG_MODE) console.log('Players:', JSON.stringify(players, null, 2));

    // Get all player IDs, sort them for consistent assignment
    const sortedPlayerIds = Object.keys(players).sort();

    // Find the assigned player for this player (round-robin: each scores the next one)
    const currentIndex = sortedPlayerIds.indexOf(playerName);
    const assignedIndex = (currentIndex + 1) % sortedPlayerIds.length;
    const assignedPlayer = sortedPlayerIds[assignedIndex];

    // Only score the assigned player
    const playerIds = [assignedPlayer];

    if (DEBUG_MODE) console.log('Selected player for scoring:', playerIds);

    const categoryConfig = {
      name: { title: "Name", icon: "fas fa-user", color: "#4facfe" },
      place: { title: "Place", icon: "fas fa-map-marker-alt", color: "#00f2fe" },
      thing: { title: "Thing", icon: "fas fa-box-open", color: "#ff6b6b" },
      animal: { title: "Animal", icon: "fas fa-paw", color: "#ff8e53" },
      movie: { title: "Movie", icon: "fas fa-film", color: "#a18cd1" }
    };

    const scoringContent = document.getElementById("scoringContent");
    if (!scoringContent) {
      if (DEBUG_MODE) console.log('scoringContent element not found');
      console.error('scoringContent element not found');
      return;
    }
    
    if (playerIds.length === 0) {
      if (DEBUG_MODE) console.log('No other players to score, rendering empty state');
      scoringContent.innerHTML = `
        <div class="text-center p-4">
          <i class="fas fa-info-circle fa-3x mb-3" style="color: #ffd700;"></i>
          <h3 class="text-white">No other players to score this round</h3>
          <p class="mt-3 text-white">Waiting for other players to join or submit answers.</p>
          <button id="skipScoringBtn" class="btn btn-primary mt-4">
            <i class="fas fa-forward me-2"></i>Continue to Next Round
          </button>
        </div>
      `;

      const skipButton = document.getElementById('skipScoringBtn');
      if (skipButton) {
        skipButton.addEventListener('click', skipScoring);
      }
      return;
    }

    // Store the selected player for this scoring session
    const selectedPlayerToScore = playerIds[0];
    window.assignedPlayerToScore = assignedPlayer;

    const assignedPlayerData = players[assignedPlayer] || {};
    const assignedAnswers = assignedPlayerData.answers?.[currentAlphabet] || {};
    const assignedSubmittedFields = assignedAnswers.submittedFields || {};
    const allFieldsFilled = allCategories.every(cat => assignedSubmittedFields[cat] === true);

    let content = `
      <div class="scoring-header mb-3">
        <div class="scoring-player-info">
          <i class="fas fa-user-circle me-2"></i>
          <span>Scoring <strong>${assignedPlayer}</strong>'s answers</span>
          <span class="scoring-letter-badge">${currentAlphabet}</span>
        </div>
        ${allFieldsFilled ? '<div class="bonus-badge"><i class="fas fa-bolt me-1"></i>+10 Bonus — All fields filled!</div>' : ''}
      </div>
      <div class="scoring-cards-list" id="scoring-cards-${assignedPlayer}">
    `;

    allCategories.forEach(categoryKey => {
      const answerValue = assignedAnswers[categoryKey] || '';
      const isFieldSubmitted = assignedSubmittedFields[categoryKey] === true && answerValue.trim() !== '';
      content += renderScoringCard(assignedPlayer, categoryKey, answerValue, isFieldSubmitted, categoryConfig[categoryKey]);
    });

    content += `
      </div>
      <div class="scoring-total-row">
        <span>Total Score:</span>
        <span class="scoring-total-value" id="total-${assignedPlayer}">${allFieldsFilled ? 10 : 0}</span>
      </div>
      <div class="d-flex justify-content-center mt-4">
        <button id="submitScoringBtn" class="btn btn-primary btn-lg">
          <i class="fas fa-check-circle me-2"></i>Submit Scores
        </button>
      </div>
      <div id="scoringMessage" class="mt-3 text-center" style="display: none;"></div>
    `;

    scoringContent.innerHTML = content;

    // Initialize slider displays for the assigned player
    allCategories.forEach(categoryKey => {
      const slider = document.querySelector(`input[data-player="${assignedPlayer}"][data-category="${categoryKey}"]`);
      if (slider && !slider.disabled) {
        updateScoreDisplay(assignedPlayer, categoryKey, slider.value);
      }
    });

    const submitButton = document.getElementById('submitScoringBtn');
    if (submitButton) {
      submitButton.addEventListener('click', submitScores);
    }
  }).catch(error => {
    console.error('Error fetching game data:', error);
    showScoringMessage('Failed to load scoring data. Please try again.', 'error');
  });
}

function renderScoringCard(playerId, categoryKey, answerValue, isFieldSubmitted, config) {
  if (!isFieldSubmitted) {
    return `
      <div class="scoring-card scoring-card--empty">
        <div class="scoring-card-header">
          <span class="scoring-card-icon"><i class="${config.icon}"></i></span>
          <span class="scoring-card-title">${config.title}</span>
        </div>
        <div class="scoring-card-answer scoring-card-answer--empty">
          <i class="fas fa-times-circle me-1"></i> Not submitted
        </div>
        <div class="scoring-card-score-row">
          <span class="scoring-card-score-label">Score: <strong>0</strong></span>
        </div>
      </div>
    `;
  }

  return `
    <div class="scoring-card">
      <div class="scoring-card-header">
        <span class="scoring-card-icon" style="color:${config.color}"><i class="${config.icon}"></i></span>
        <span class="scoring-card-title">${config.title}</span>
      </div>
      <div class="scoring-card-answer">
        <i class="fas fa-quote-left me-1"></i>${answerValue}<i class="fas fa-quote-right ms-1"></i>
      </div>
      <div class="scoring-card-score-row">
        <span class="scoring-card-score-label">Score:</span>
        <input type="range" class="scoring-slider"
               min="0" max="10" value="5" step="1"
               data-player="${playerId}"
               data-category="${categoryKey}"
               oninput="updateScoreDisplay('${playerId}', '${categoryKey}', this.value)">
        <span class="score-value" id="score-${playerId}-${categoryKey}">5</span>
      </div>
    </div>
  `;
}

function updateScoreDisplay(playerId, categoryKey, value) {
  const scoreElement = document.getElementById(`score-${playerId}-${categoryKey}`);
  if (scoreElement) {
    scoreElement.textContent = value;
    calculatePlayerTotal(playerId);
  }
}

function calculatePlayerTotal(playerId) {
  const sliders = document.querySelectorAll(`input[data-player="${playerId}"]`);
  let total = 0;

  sliders.forEach(slider => {
    if (!slider.disabled) {
      total += parseInt(slider.value) || 0;
    }
  });

  gameRef.child(`players/${playerId}`).once('value').then(snapshot => {
    const playerData = snapshot.val();
    if (!playerData) return;

    const answers = playerData.answers?.[currentAlphabet] || {};
    const submittedFields = answers.submittedFields || {};
    const allFieldsFilled = allCategories.every(cat => submittedFields[cat] === true);

    if (allFieldsFilled) {
      total += 10;
    }

    const totalElement = document.getElementById(`total-${playerId}`);
    if (totalElement) {
      totalElement.textContent = total;
    }
  });
}

function skipScoring() {
  const updates = {
    [`players/${playerName}/scoringComplete/${currentAlphabet}`]: true
  };

  const button = document.getElementById('skipScoringBtn');
  if (button) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Processing...';

    gameRef.update(updates).then(() => {
      showScoringMessage('Skipped scoring for this round.', 'success');
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-forward me-2"></i>Continue to Next Round';
    }).catch(error => {
      console.error('Error skipping scoring:', error);
      showScoringMessage('Failed to skip scoring. Please try again.', 'error');
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-forward me-2"></i>Continue to Next Round';
    });
  }
}

function submitScores() {
  const submitButton = document.getElementById('submitScoringBtn');
  if (!submitButton) return;

  submitButton.disabled = true;
  submitButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Submitting...';
  showScoringMessage('Submitting scores...', 'info');

  const scores = {};
  const sliders = document.querySelectorAll('.scoring-slider');

  sliders.forEach(slider => {
    const playerId = slider.dataset.player;
    const category = slider.dataset.category;
    const score = slider.disabled ? 0 : parseInt(slider.value) || 0;

    if (!scores[playerId]) scores[playerId] = {};
    scores[playerId][category] = score;
  });

  const updates = {};
  // Only store scores for the assigned player
  const assignedPlayer = window.assignedPlayerToScore;
  if (assignedPlayer && scores[assignedPlayer]) {
    updates[`players/${playerName}/scoring/${currentAlphabet}/${assignedPlayer}`] = scores[assignedPlayer];
  }
  updates[`players/${playerName}/scoringComplete/${currentAlphabet}`] = true;

  gameRef.update(updates).then(() => {
    showScoringMessage('Scores submitted successfully! Waiting for other players...', 'success');
    submitButton.innerHTML = '<i class="fas fa-check me-2"></i>Submitted';

    // Disable all sliders after submission
    const allSliders = document.querySelectorAll('.scoring-slider');
    allSliders.forEach(slider => {
      slider.disabled = true;
      slider.style.opacity = '0.5';
    });
  }).catch(error => {
    console.error('Error submitting scores:', error);
    showScoringMessage('Failed to submit scores. Please try again.', 'error');
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="fas fa-check-circle me-2"></i>Submit Scores';
    }
  });
}

function showScoringMessage(message, type) {
  const messageBox = document.getElementById('scoringMessage');
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.style.display = 'block';
  
  switch(type) {
    case 'success':
      messageBox.className = 'alert alert-success mt-3 text-center';
      break;
    case 'error':
      messageBox.className = 'alert alert-danger mt-3 text-center';
      break;
    case 'info':
      messageBox.className = 'alert alert-info mt-3 text-center';
      break;
    default:
      messageBox.className = 'alert alert-secondary mt-3 text-center';
  }

  if (type !== 'info') {
    setTimeout(() => {
      messageBox.style.display = 'none';
    }, 3000);
  }
}

function checkAllPlayersScored(gameData) {
  const players = gameData.players || {};
  let allScored = true;

  for (const playerId of connectedPlayers) {
    if (!players[playerId]?.scoringComplete?.[currentAlphabet]) {
      allScored = false;
      break;
    }
  }

  if (allScored && isHost) {
    calculateFinalScores(gameData);
  }
}

function calculateFinalScores(gameData) {
  const players = gameData.players || {};
  const updates = {};
  const playerScores = {};

  for (const playerId of connectedPlayers) {
    playerScores[playerId] = players[playerId].score || 0;
  }

  // Each player scores one other player, so we need to collect all scores for each player
  for (const playerId of connectedPlayers) {
    const playerScoring = players[playerId].scoring?.[currentAlphabet] || {};

    for (const scoredPlayerId in playerScoring) {
      const scores = playerScoring[scoredPlayerId];
      const scoreSum = Object.values(scores).reduce((sum, score) => sum + (score || 0), 0);

      const answers = players[scoredPlayerId].answers?.[currentAlphabet] || {};
      const submittedFields = answers.submittedFields || {};
      const allFieldsFilled = allCategories.every(cat => submittedFields[cat] === true);
      const bonusPoints = allFieldsFilled ? 10 : 0;

      playerScores[scoredPlayerId] += scoreSum + bonusPoints;
    }
  }

  for (const playerId in playerScores) {
    updates[`players/${playerId}/score`] = playerScores[playerId];
  }

  const nextRound = (gameData.currentRound || 1) + 1;
  const selectedRounds = parseInt(gameData.rounds) || 1;

  if (nextRound > selectedRounds) {
    updates.gameCompleted = true;
    updates.scoringPhase = false;
  } else {
    const newAlphabet = generateUniqueAlphabet(gameData.letterHistory || []);
    if (newAlphabet) {
      updates.nextAlphabet = newAlphabet;
      updates.nextRound = nextRound;
      updates.scoringPhase = false;
      updates.letterHistory = [...(gameData.letterHistory || []), newAlphabet];

      for (const playerId of connectedPlayers) {
        updates[`players/${playerId}/submitted/${newAlphabet}`] = null;
        updates[`players/${playerId}/scoringComplete/${currentAlphabet}`] = null;
      }
    } else {
      updates.gameCompleted = true;
      updates.scoringPhase = false;
    }
  }

  gameRef.update(updates).catch(error => {
    console.error('Error updating game state:', error);
    showScoringMessage('Failed to advance game. Please try again.', 'error');
  });
}

function generateUniqueAlphabet(usedLetters) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const availableLetters = alphabet.split('').filter(letter => !usedLetters.includes(letter));

  if (availableLetters.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * availableLetters.length);
  return availableLetters[randomIndex];
}
