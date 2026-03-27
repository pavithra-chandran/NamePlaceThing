const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
const playerName = urlParams.get('name');

if (!roomCode || !playerName) {
  window.location.href = "index.html";
}

const gameRef = database.ref('games/' + roomCode);

gameRef.once('value').then((snapshot) => {
  const gameData = snapshot.val();
  if (!gameData || !gameData.gameCompleted) {
    window.location.href = `game-page.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
    return;
  }

  const players = gameData.players;
  let highestScore = -1;
  let winnerName = "";

  // Calculate winner
  for (const playerId in players) {
    const score = players[playerId].score || 0;
    if (score > highestScore) {
      highestScore = score;
      winnerName = playerId;
    } else if (score === highestScore) {
      winnerName += ` & ${playerId}`;
    }
  }

  document.getElementById("winnerName").textContent = winnerName;
  document.getElementById("winnerScore").textContent = highestScore;

  // Display all players' scores
  const scoresContainer = document.getElementById("allPlayersScores");
  scoresContainer.innerHTML = "";

  // Sort players by score descending
  const sortedPlayers = Object.keys(players).sort((a, b) => (players[b].score || 0) - (players[a].score || 0));

  sortedPlayers.forEach(playerId => {
    const player = players[playerId];
    const score = player.score || 0;
    const playerDiv = document.createElement("div");
    playerDiv.className = "score-item d-flex justify-content-between align-items-center mb-2";
    playerDiv.innerHTML = `
      <span class="text-white">${playerId}</span>
      <span class="text-white fw-bold">${score} points</span>
    `;
    scoresContainer.appendChild(playerDiv);
  });

  // Home button
  document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "index.html";
  });

  // Restart button
  document.getElementById("restartBtn").addEventListener("click", () => {
    // Reset game state
    const updates = {
      gameStarted: false,
      currentRound: 0,
      currentAlphabet: "",
      gameCompleted: false,
      roundStartTime: null,
      gameStartTime: null,
      scoringPhase: null,
      startCountdown: null,
      roundCountdown: null,
      letterHistory: [],
      nextAlphabet: null,
      nextRound: null,
      roundCompleted: null
    };

    // Reset all player scores and data
    for (const playerId in players) {
      updates[`players/${playerId}/score`] = 0;
      updates[`players/${playerId}/ready`] = false;
      updates[`players/${playerId}/answers`] = null;
      updates[`players/${playerId}/submitted`] = null;
      updates[`players/${playerId}/tempAnswers`] = null;
      updates[`players/${playerId}/scoring`] = null;
      updates[`players/${playerId}/scoringComplete`] = null;
    }

    gameRef.update(updates)
      .then(() => {
        // Redirect to player home
        window.location.href = `player-home.html?room=${roomCode}&name=${encodeURIComponent(playerName)}`;
      })
      .catch((error) => {
        console.error("Error restarting game:", error);
        alert("Error restarting game. Please try again.");
      });
  });
});