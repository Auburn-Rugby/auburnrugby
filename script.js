// =========================
// GLOBAL DATA + SHARED HELPERS
// =========================
// This file powers the Auburn Rugby site.
// The goal of this refactor is to keep the existing behavior intact while making
// the code easier to read, safer to maintain, and clearer for future edits.
//
// Major features in this file:
// 1) Load roster + previous game data
// 2) Render roster cards and roster filters
// 3) Open/close the player, coach, and game modals
// 4) Render upcoming games, previous games, schedule, and training cards
// 5) Handle the optional hero video hover effect
// 6) Submit the two contact forms through Formspree without leaving the page

const MODAL_CLOSE_DELAY_MS = 320;
const MODAL_SWITCH_DELAY_MS = 220;


// Shared in-memory data stores. These are filled once JSON files load.
let allRosterPlayers = [];
let allPreviousGames = [];
let playerMap = new Map();
let playerSeasonStats = new Map();

/**
 * Convert a full player name into a normalized key.
 * Input example: "Will Locke"
 * Output example: "will-locke"
 *
 * This key is used to match player names between the roster JSON and
 * previous-games JSON where stats are stored by name.
 */
function makePlayerKeyFromFullName(name) {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/**
 * Convert a roster player object into the same normalized key format used
 * by makePlayerKeyFromFullName().
 *
 * Expected input: an object with fname and lname fields.
 */
function makePlayerKeyFromRosterPlayer(player) {
  return `${player.fname || ''} ${player.lname || ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

/**
 * Small helper for reading elements by id.
 * Returns null if the element does not exist.
 */
function getById(id) {
  return document.getElementById(id);
}

/**
 * Open a modal with the same visual timing used throughout the site.
 * This keeps the body scroll lock and CSS transition behavior consistent.
 */
function showModal(modal) {
  if (!modal) return;

  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  requestAnimationFrame(() => {
    modal.classList.add('is-open');
  });
}

/**
 * Close a modal with the same delay used by the existing CSS transition.
 */
function hideModal(modal) {
  if (!modal) return;

  modal.classList.remove('is-open');

  setTimeout(() => {
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }, MODAL_CLOSE_DELAY_MS);
}

/**
 * Attach click and Enter/Space keyboard behavior to a card-like element.
 * This is used for roster cards, coach cards, and previous-game cards.
 */
function addCardActivation(card, handler) {
  if (!card || typeof handler !== 'function') return;

  card.addEventListener('click', handler);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handler();
    }
  });
}

/**
 * Attach a shared Escape-key handler for a modal.
 * Only closes the modal if it is currently open.
 */
function bindEscapeToModal(modalId, closeHandler) {
  document.addEventListener('keydown', (event) => {
    const modal = getById(modalId);
    if (event.key === 'Escape' && modal && modal.classList.contains('is-open')) {
      closeHandler();
    }
  });
}

/**
 * Fetch a JSON file and parse it.
 * Returns a Promise that resolves to the parsed JSON data.
 */
function loadJson(path) {
  return fetch(path)
    .then(res => res.json())
    .catch(() => {
      console.error("Failed to load:", path);
      return [];
    });
}

// =========================
// FORCE PAGE TO LOAD AT TOP
// Prevent browser from restoring old scroll position on refresh
// =========================

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

window.addEventListener('load', () => {
  if (!window.location.hash) {
    window.scrollTo(0, 0);
  }
});

// =========================
// PLAYER DATA MAPPING + SEASON TOTALS
// =========================

/**
 * Build a lookup map so a normalized player key can quickly return a roster player object.
 * A Map is used here so game stats can jump directly to the matching player card/modal data.
 */
function buildPlayerMap(players) {
  playerMap = new Map();

  players.forEach((player) => {
    const key = makePlayerKeyFromRosterPlayer(player);
    playerMap.set(key, player);
  });
}

/**
 * Build season totals for each player using the previous-games JSON.
 *
 * Each stat line increments:
 * - games
 * - tries
 * - conversions
 */
function buildPlayerSeasonStats(previousGames) {
  playerSeasonStats = new Map();

  previousGames.forEach((game) => {
    (game.playerStats || []).forEach((statLine) => {
      const key = makePlayerKeyFromFullName(statLine.name);
      if (!key) return;

      if (!playerSeasonStats.has(key)) {
        playerSeasonStats.set(key, {
          games: 0,
          tries: 0,
          conversions: 0
        });
      }

      const totals = playerSeasonStats.get(key);
      totals.games += 1;
      totals.tries += statLine.tries || 0;
      totals.conversions += statLine.conversions || 0;
    });
  });
}

/**
 * Return season totals for a single roster player.
 * If the player does not have recorded stats yet, return zeroed totals.
 */
function getSeasonStatsForPlayer(player) {
  const key = makePlayerKeyFromRosterPlayer(player);

  return playerSeasonStats.get(key) || {
    games: 0,
    tries: 0,
    conversions: 0
  };
}

/**
 * Return a list of all recorded games for a single roster player.
 * Each returned item includes both game metadata and that player's stat line.
 */
function getGamesForPlayer(player) {
  const key = makePlayerKeyFromRosterPlayer(player);

  return allPreviousGames
    .map((game) => {
      const matchingStatLine = (game.playerStats || []).find((statLine) => {
        return makePlayerKeyFromFullName(statLine.name) === key;
      });

      if (!matchingStatLine) return null;

      return {
        opponent: game.opponent,
        team: game.team,
        date: game.date,
        result: game.result,
        type: game.type,
        scoreUs: game.scoreUs,
        scoreThem: game.scoreThem,
        stats: matchingStatLine
      };
    })
    .filter(Boolean);
}

// =========================
// COACH MODAL
// =========================

/**
 * Open the coach modal using data attributes stored directly on a coach card.
 *
 * Expected input:
 * - a DOM element with data-name, data-role, data-image, etc.
 *
 * DOM updates:
 * - fills #coach-modal-content
 * - opens #coach-modal
 */
function openCoachModal(card) {
  const modal = getById('coach-modal');
  const modalContent = getById('coach-modal-content');
  if (!modal || !modalContent || !card) return;

  const name = card.dataset.name || '';
  const role = card.dataset.role || '';
  const image = card.dataset.image || 'images/players/silhouette.png';
  const experience = card.dataset.experience || 'TBD';
  const specialty = card.dataset.specialty || 'TBD';
  const bio = card.dataset.bio || 'Bio coming soon.';
  const academics = card.dataset.academics || 'TBD';
  const hometown = card.dataset.hometown || 'TBD';

  modalContent.innerHTML = `
    <div class="player-modal-layout">
      <div class="player-modal-top">
        <div class="player-modal-image-wrap">
          <img src="${image}" alt="${name}" class="player-modal-image">
        </div>

        <div class="player-modal-info">
          <p class="player-modal-kicker">Auburn Rugby</p>
          <h3 id="coach-modal-name" class="player-modal-name">${name}</h3>
          <p class="player-modal-position">${role}</p>

          <div class="player-modal-stats">
            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Experience</span>
              <span class="player-modal-stat-value">${experience}</span>
            </div>

            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Specialty</span>
              <span class="player-modal-stat-value">${specialty}</span>
            </div>

            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Academics</span>
              <span class="player-modal-stat-value">${academics}</span>
            </div>

            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Hometown</span>
              <span class="player-modal-stat-value">${hometown}</span>
            </div>

            <div class="player-modal-stat player-modal-stat-wide">
              <span class="player-modal-stat-label">Bio</span>
              <span class="player-modal-stat-value">${bio}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  showModal(modal);
}

/** Close the coach modal. */
function closeCoachModal() {
  hideModal(getById('coach-modal'));
}

// =========================
// PLAYER MODAL
// =========================

/**
 * Open the player modal for one roster player object.
 *
 * Expected input:
 * - a roster player object from roster.json
 *
 * DOM updates:
 * - fills #player-modal-content
 * - opens #player-modal
 * - wires each game card inside the player modal so it can open the game modal
 */
function openPlayerModal(player) {
  const imageCandidates = getPlayerImageCandidates(player);
  const modal = getById('player-modal');
  const modalContent = getById('player-modal-content');
  if (!modal || !modalContent || !player) return;

  const fullName = `${player.fname} ${player.lname}`;
  const totals = getSeasonStatsForPlayer(player);
  const gamesPlayed = getGamesForPlayer(player);

  const gamesMarkup = gamesPlayed.length
    ? gamesPlayed.map((game) => `
        <button
          type="button"
          class="player-game-card"
          data-game-team="${game.team}"
          data-game-opponent="${game.opponent}"
          data-game-date="${game.date}"
        >
          <div class="player-game-card-top">
            <span class="player-game-opponent">vs ${game.opponent}</span>
            <span class="player-game-result">${game.result}</span>
          </div>

          <div class="player-game-meta">
            <span>${game.date}</span>
            <span>${game.type}</span>
            <span>${game.team} ${game.scoreUs} - ${game.scoreThem} ${game.opponent}</span>
          </div>

          <div class="player-game-stat-line">
            <span>Tries: ${game.stats.tries ?? 0}</span>
            <span>Conversions: ${game.stats.conversions ?? 0}</span>
          </div>
        </button>
      `).join('')
    : '<p class="player-modal-no-games">No recorded games yet.</p>';

  modalContent.innerHTML = `
    <div class="player-modal-layout">
      <div class="player-modal-top">
        <div class="player-modal-image-wrap">
          <img 
            src="${imageCandidates[0]}" 
            alt="${fullName}" 
            class="player-modal-image"
            data-fallback-one="${imageCandidates[1]}"
            data-fallback-two="${imageCandidates[2]}"
          >
        </div>

        <div class="player-modal-info">
          <p class="player-modal-kicker">Auburn Rugby</p>
          <h3 id="player-modal-name" class="player-modal-name">${fullName}</h3>
          <p class="player-modal-position">${player.position}</p>

          <div class="player-modal-stats">
            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Height</span>
              <span class="player-modal-stat-value">${player.height}</span>
            </div>
            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Weight</span>
              <span class="player-modal-stat-value">${player.weight} lbs</span>
            </div>
            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Class</span>
              <span class="player-modal-stat-value">${player.class}</span>
            </div>
            <div class="player-modal-stat">
              <span class="player-modal-stat-label">Major</span>
              <span class="player-modal-stat-value">${player.major}</span>
            </div>
            <div class="player-modal-stat player-modal-stat-wide">
              <span class="player-modal-stat-label">Hometown</span>
              <span class="player-modal-stat-value">${player.hometown}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="player-modal-full-section player-modal-season-stats">
        <h4 class="player-modal-section-title">Season Stats</h4>
        <div class="player-modal-stats player-modal-stats-wide">
          <div class="player-modal-stat">
            <span class="player-modal-stat-label">Games</span>
            <span class="player-modal-stat-value">${totals.games}</span>
          </div>
          <div class="player-modal-stat">
            <span class="player-modal-stat-label">Tries</span>
            <span class="player-modal-stat-value">${totals.tries}</span>
          </div>
          <div class="player-modal-stat">
            <span class="player-modal-stat-label">Conversions</span>
            <span class="player-modal-stat-value">${totals.conversions}</span>
          </div>
        </div>
      </div>

      <div class="player-modal-full-section player-modal-games">
        <h4 class="player-modal-section-title">Games Played</h4>
        <div class="player-modal-games-list">
          ${gamesMarkup}
        </div>
      </div>
    </div>
  `;

  const modalImage = modalContent.querySelector('.player-modal-image');

  if (modalImage) {
    modalImage.addEventListener('error', () => {
      if (modalImage.dataset.fallbackOne) {
        modalImage.src = modalImage.dataset.fallbackOne;
        modalImage.dataset.fallbackOne = '';
      } else if (modalImage.dataset.fallbackTwo) {
        modalImage.src = modalImage.dataset.fallbackTwo;
        modalImage.dataset.fallbackTwo = '';
      }
    });
  }
  // Each game button inside the player modal opens the matching game modal.
  modalContent.querySelectorAll('[data-game-team]').forEach((button) => {
    button.addEventListener('click', () => {
      const team = button.dataset.gameTeam;
      const opponent = button.dataset.gameOpponent;
      const date = button.dataset.gameDate;

      const matchedGame = allPreviousGames.find((game) => {
        return game.team === team && game.opponent === opponent && game.date === date;
      });

      if (!matchedGame) return;

      closePlayerModal();
      setTimeout(() => {
        openGameModal(matchedGame);
      }, MODAL_SWITCH_DELAY_MS);
    });
  });

  showModal(modal);
}

/** Close the player modal. */
function closePlayerModal() {
  hideModal(getById('player-modal'));
}

// =========================
// GAME MODAL
// =========================

/**
 * Open the game modal for one game object.
 *
 * Expected input:
 * - a game object from previous-games.json
 *
 * DOM updates:
 * - fills #game-modal-content
 * - opens #game-modal
 * - wires each player stat card so it can jump to the matching player modal
 */
function openGameModal(game) {
  const modal = getById('game-modal');
  const modalContent = getById('game-modal-content');
  if (!modal || !modalContent || !game) return;

  const auburnWon = game.scoreUs > game.scoreThem;
  const opponentWon = game.scoreThem > game.scoreUs;

  modalContent.innerHTML = `
  
    <div class="game-modal-header">
      <div>
        <p class="game-modal-kicker">Previous Game</p>
        <h3 id="game-modal-title" class="game-modal-title">${game.team} vs ${game.opponent}</h3>
        <p class="game-modal-subtitle">${game.type}</p>
      </div>
    </div>

    <div class="game-modal-scoreboard">
      <div class="game-modal-team-row">
        <div class="game-modal-team-info">
          <img src="images/AUNavyLogo.png" alt="${game.team} logo" class="game-modal-team-logo">
          <span class="game-modal-team-name">${game.team}</span>
        </div>
        <span class="game-modal-score ${auburnWon ? 'win' : 'loss'}">${game.scoreUs}</span>
      </div>

      <div class="game-modal-team-row">
        <div class="game-modal-team-info">
          <img src="${game.image}" alt="${game.opponent} logo" class="game-modal-team-logo">
          <span class="game-modal-team-name">${game.opponent}</span>
        </div>
        <span class="game-modal-score ${opponentWon ? 'win' : 'loss'}">${game.scoreThem}</span>
      </div>
    </div>

    <div class="game-modal-details-grid">
      <div class="game-modal-detail-card">
        <span class="game-modal-detail-label">Date</span>
        <span class="game-modal-detail-value">${game.date}</span>
      </div>

      <div class="game-modal-detail-card">
        <span class="game-modal-detail-label">Location</span>
        <span class="game-modal-detail-value">${game.location}</span>
      </div>

      <div class="game-modal-detail-card">
        <span class="game-modal-detail-label">Competition</span>
        <span class="game-modal-detail-value">${game.type}</span>
      </div>

      <div class="game-modal-detail-card">
        <span class="game-modal-detail-label">Result</span>
        <span class="game-modal-detail-value">${game.result}</span>
      </div>
    </div>

    <div class="game-modal-player-stats">
      <h4 class="game-modal-section-title">Player Stats</h4>
      <div class="game-modal-player-grid">
        ${
          game.playerStats && game.playerStats.length
            ? game.playerStats.map((player) => `
                <button
                  class="game-modal-player-card"
                  type="button"
                  data-player-name="${player.name}"
                >
                  <span class="game-modal-player-name">${player.name}</span>
                  <div class="game-modal-player-lines">
                    <span>Tries: ${player.tries ?? 0}</span>
                    <span>Conversions: ${player.conversions ?? 0}</span>
                  </div>
                </button>
              `).join('')
            : '<p class="game-modal-no-stats">No stats recorded</p>'
        }
      </div>
    </div>
  `;
  // Clicking a player in the game modal reuses the roster data map to open
  // that player profile modal.
  modalContent.querySelectorAll('[data-player-name]').forEach((button) => {
    button.addEventListener('click', () => {
      const playerName = button.dataset.playerName;
      const playerKey = makePlayerKeyFromFullName(playerName);
      const rosterPlayer = playerMap.get(playerKey);

      if (!rosterPlayer) return;

      closeGameModal();
      setTimeout(() => {
        openPlayerModal(rosterPlayer);
      }, MODAL_SWITCH_DELAY_MS);
    });
  });

  showModal(modal);
}

/** Close the game modal. */
function closeGameModal() {
  hideModal(getById('game-modal'));
}

// =========================
// ROSTER INITIALIZATION + FILTERS
// =========================

/**
 * Render and wire the roster UI.
 *
 * Expected input:
 * - an array of player objects from roster.json
 *
 * This function supports both:
 * - the full roster page with filters/search/sort
 * - the home page mini-carousel version
 */
function getPlayerImageBaseName(player) {
  return `${player.fname || ''}${player.lname || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getPlayerImageCandidates(player) {
  const baseName = getPlayerImageBaseName(player);

  return [
    `images/players/${baseName}.png`,
    `images/players/${baseName}.jpeg`,
    `images/players/silhouette.png`
  ];
}

function initRoster(players) {
  const container = getById('roster-container');
  if (!container) return;

  const isHomeCarousel = container.classList.contains('player-carousel');

  const modalClose = getById('player-modal-close');
  const modalBackdrop = getById('player-modal-backdrop');

  const searchInput = getById('roster-search');
  const positionFilter = getById('position-filter');
  const classFilter = getById('class-filter');
  const sortFilter = getById('sort-filter');
  const resetButton = getById('reset-filters');
  const rosterCount = getById('roster-count');
  const rosterSummary = getById('roster-summary');

  const playersData = [...players];

  /** Randomize order for the home page carousel. */
  function shuffleArray(array) {
    const shuffled = [...array];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  // Used for class sorting and for filter display ordering.
  const classOrder = {
    Freshman: 1,
    Sophomore: 2,
    Junior: 3,
    Senior: 4,
    Graduate: 5,
    Unknown: 99
  };

  /** Turn a position like "PROP / FLANKER" into a safe CSS suffix. */
  function slugifyPosition(position) {
    return (position || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /** Fill the position and class dropdowns using live roster data. */
  function populateFilters() {
    function formatPositionLabel(position) {
      return position
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    if (positionFilter) {
      const positions = [
        ...new Set(
          playersData.flatMap((player) => {
            return (player.position || '')
              .split('/')
              .map((position) => position.trim())
              .filter(Boolean);
          })
        )
      ].sort();

      positions.forEach((position) => {
        const option = document.createElement('option');
        option.value = position;
        option.textContent = formatPositionLabel(position);
        positionFilter.appendChild(option);
      });
    }

    if (classFilter) {
      const classes = [...new Set(playersData.map((player) => player.class).filter(Boolean))]
        .sort((a, b) => (classOrder[a] || 99) - (classOrder[b] || 99));

      classes.forEach((playerClass) => {
        const option = document.createElement('option');
        option.value = playerClass;
        option.textContent = playerClass;
        classFilter.appendChild(option);
      });
    }
  }

  /** Update the roster count and optional summary pills. */
  function updateRosterSummary(playersToSummarize) {
    if (rosterCount) {
      const total = playersToSummarize.length;
      rosterCount.textContent = `${total} Player${total === 1 ? '' : 's'}`;
    }

    if (!rosterSummary) return;

    const classCounts = {};
    playersToSummarize.forEach((player) => {
      const key = player.class || 'Unknown';
      classCounts[key] = (classCounts[key] || 0) + 1;
    });

    const orderedClasses = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate', 'Unknown'];

    rosterSummary.innerHTML =
      orderedClasses
        .filter((playerClass) => classCounts[playerClass])
        .map((playerClass) => `<span class="roster-pill">${playerClass}: ${classCounts[playerClass]}</span>`)
        .join('') || '<span class="roster-pill">No players found</span>';
  }

  /** Sort a player array using the current sort dropdown selection. */
  function sortPlayers(playersToSort) {
    if (!sortFilter) return playersToSort;

    const value = sortFilter.value;
    const sorted = [...playersToSort];

    sorted.sort((a, b) => {
      const fullNameA = `${a.fname} ${a.lname}`.toLowerCase();
      const fullNameB = `${b.fname} ${b.lname}`.toLowerCase();

      switch (value) {
        case 'name-desc':
          return fullNameB.localeCompare(fullNameA);

        case 'class-asc':
          return (classOrder[a.class] || 99) - (classOrder[b.class] || 99) ||
            fullNameA.localeCompare(fullNameB);

        case 'position-asc':
          return (a.position || '').localeCompare(b.position || '') ||
            fullNameA.localeCompare(fullNameB);

        case 'hometown-asc':
          return (a.hometown || '').localeCompare(b.hometown || '') ||
            fullNameA.localeCompare(fullNameB);

        case 'name-asc':
        default:
          return fullNameA.localeCompare(fullNameB);
      }
    });

    return sorted;
  }

  /**
   * Render player cards into the roster container.
   * This also wires click/keyboard events that open the player modal.
   */
  function renderPlayers(playersToRender) {
    // Fade out briefly before rerendering so filter changes feel smoother.
    container.style.opacity = '0';

    setTimeout(() => {
      container.innerHTML = '';

      if (!playersToRender.length) {
        container.innerHTML = `
          <div class="roster-empty-state">
            <h3>No players found</h3>
            <p>Try changing your search or filter selections.</p>
          </div>
        `;
        updateRosterSummary([]);
        container.style.opacity = '1';
        return;
      }

      playersToRender.forEach((player) => {
        const fullName = `${player.fname} ${player.lname}`;
        const positionSlug = slugifyPosition(player.position);

        const card = document.createElement('article');
        card.className = 'player-card';
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `View details for ${fullName}`);

        const imageCandidates = getPlayerImageCandidates(player);
        
        card.innerHTML = `
          <div class="player-image-wrap">
            <img 
              src="${imageCandidates[0]}" 
              alt="${fullName}" 
              class="player-image"
              data-fallback-one="${imageCandidates[1]}"
              data-fallback-two="${imageCandidates[2]}"
            />
          </div>

          <div class="player-card-body">
            <h3 class="player-name">${fullName}</h3>
            <p class="player-position position-tag position-default position-${positionSlug}">${player.position}</p>

            <div class="player-card-preview">
              <span><strong>Class:</strong> ${player.class}</span>
              <span><strong>Hometown:</strong> ${player.hometown}</span>
              <span><strong>Major:</strong> ${player.major}</span>
            </div>

            <p class="player-card-hint">Click for full profile</p>
          </div>
        `;

        const playerImage = card.querySelector('.player-image');

        playerImage.addEventListener('error', () => {
          if (playerImage.dataset.fallbackOne) {
            playerImage.src = playerImage.dataset.fallbackOne;
            playerImage.dataset.fallbackOne = '';
          } else if (playerImage.dataset.fallbackTwo) {
            playerImage.src = playerImage.dataset.fallbackTwo;
            playerImage.dataset.fallbackTwo = '';
          }
        });
        
        addCardActivation(card, () => openPlayerModal(player));
        container.appendChild(card);
      });

      updateRosterSummary(playersToRender);
      container.style.opacity = '1';
    }, 120);
  }

  /** Apply the current search term, filters, and sort order to the roster. */
  function applyFilters() {
    const searchValue = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const selectedPosition = positionFilter ? positionFilter.value : 'all';
    const selectedClass = classFilter ? classFilter.value : 'all';

    let filteredPlayers = playersData.filter((player) => {
      const fullName = `${player.fname} ${player.lname}`.toLowerCase();
      const hometown = (player.hometown || '').toLowerCase();
      const major = (player.major || '').toLowerCase();
      const position = (player.position || '').toLowerCase();
      const playerClass = player.class || '';

      const matchesSearch =
        !searchValue ||
        fullName.includes(searchValue) ||
        hometown.includes(searchValue) ||
        major.includes(searchValue) ||
        position.includes(searchValue);

      // Positions in the JSON can contain multiple values like "WING / CENTER".
      // Split those so the position filter still works for each individual role.
      const playerPositions = (player.position || '')
        .split('/')
        .map((positionName) => positionName.trim().toUpperCase());

      const matchesPosition =
        selectedPosition === 'all' ||
        playerPositions.includes(selectedPosition.toUpperCase());

      const matchesClass = selectedClass === 'all' || playerClass === selectedClass;

      return matchesSearch && matchesPosition && matchesClass;
    });

    filteredPlayers = sortPlayers(filteredPlayers);
    renderPlayers(filteredPlayers);
  }

  /** Reset the roster toolbar back to its default state. */
  function resetFilters() {
    if (searchInput) searchInput.value = '';
    if (positionFilter) positionFilter.value = 'all';
    if (classFilter) classFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'name-asc';
    applyFilters();
  }

  populateFilters();

  // Home page behavior: show a randomized mini set.
  // Full roster page behavior: show the searchable/filterable list.
  if (isHomeCarousel) {
    const randomizedPlayers = shuffleArray(playersData).slice(0, 8);
    renderPlayers(randomizedPlayers);
  } else {
    applyFilters();
  }

  if (searchInput) searchInput.addEventListener('input', applyFilters);
  if (positionFilter) positionFilter.addEventListener('change', applyFilters);
  if (classFilter) classFilter.addEventListener('change', applyFilters);
  if (sortFilter) sortFilter.addEventListener('change', applyFilters);
  if (resetButton) resetButton.addEventListener('click', resetFilters);

  if (modalClose) modalClose.addEventListener('click', closePlayerModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closePlayerModal);
  bindEscapeToModal('player-modal', closePlayerModal);

  // Coach card behavior exists on the home page only.
  document.querySelectorAll('.coach-card').forEach((card) => {
    addCardActivation(card, () => openCoachModal(card));
  });

  const coachModalClose = getById('coach-modal-close');
  const coachModalBackdrop = getById('coach-modal-backdrop');

  if (coachModalClose) coachModalClose.addEventListener('click', closeCoachModal);
  if (coachModalBackdrop) coachModalBackdrop.addEventListener('click', closeCoachModal);
  bindEscapeToModal('coach-modal', closeCoachModal);
}

// =========================
// MAP URL GENERATION
// =========================

/**
 * Build both a clickable Google Maps link and an embeddable map URL.
 *
 * Inputs:
 * - address: the normal address string stored in JSON
 * - mapsQuery: optional override string used when the normal address resolves badly
 *
 * Output:
 * - { maps, embed }
 */
function buildGoogleMapsUrls(address, mapsQuery) {
  const query = encodeURIComponent(mapsQuery || address);
  return {
    maps: `https://www.google.com/maps?q=${query}`,
    embed: `https://www.google.com/maps?q=${query}&output=embed`
  };
}

// =========================
// UPCOMING GAMES
// =========================

/**
 * Load upcoming games and render the upcoming game cards.
 * Each card keeps the current map embedding behavior, including mapsQuery overrides.
 */
function initUpcomingGames() {
  loadJson('upcoming-games.json').then((games) => {
    const container = getById('upcoming-games-container');
    if (!container) return;

    initNextMatchCountdown(games);

    const realGames = (games || []).filter((game) => !game.example);
    const limitedGames = realGames.slice(0, 4);

    container.innerHTML = '';

    if (!limitedGames.length) {
      container.innerHTML = `
        <article class="upcoming-game-empty-state">
          <div class="upcoming-game-empty-content">
            <span class="upcoming-game-badge">Schedule Update</span>
            <h3>No upcoming games right now</h3>
            <p>Please check back soon for our next match.</p>
          </div>
        </article>
      `;
      return;
    }

    limitedGames.forEach((game) => {
      const { maps, embed } = buildGoogleMapsUrls(game.address, game.mapsQuery);

      const card = document.createElement('article');
      card.className = 'upcoming-game-card';

      card.innerHTML = `
        <div class="upcoming-game-content">
          <span class="upcoming-game-badge">Upcoming Match</span>

          <div class="upcoming-game-header">
            <img src="${game.image}" alt="${game.opponent} logo" class="upcoming-game-logo">
            <h3 class="upcoming-game-title">${game.opponent}</h3>
          </div>

          <div class="upcoming-game-meta">
            <div class="upcoming-game-meta-item">
              <div class="upcoming-game-meta-icon"></div>
              <div>
                <span class="upcoming-game-meta-label">Date</span>
                <p class="upcoming-game-meta-value">${game.date}</p>
              </div>
            </div>

            <div class="upcoming-game-meta-item">
              <div class="upcoming-game-meta-icon"></div>
              <div>
                <span class="upcoming-game-meta-label">Time</span>
                <p class="upcoming-game-meta-value">${game.time}</p>
              </div>
            </div>

            <div class="upcoming-game-meta-item">
              <div class="upcoming-game-meta-icon"></div>
              <div>
                <span class="upcoming-game-meta-label">Location</span>
                <p class="upcoming-game-meta-value">
                  <a href="${maps}" target="_blank" rel="noopener noreferrer">
                    ${game.location}
                  </a>
                </p>
              </div>
            </div>
          </div>

          <div class="upcoming-game-map-container">
            <iframe
              src="${embed}"
              loading="lazy"
              allowfullscreen
              referrerpolicy="no-referrer-when-downgrade"
              title="Map for ${game.location}">
            </iframe>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  });
}

let heroCountdownInterval = null;

function parseUpcomingGameDateTime(game) {
  if (!game?.date || !game?.time) return null;

  const combined = `${game.date} ${game.time}`;
  const parsed = new Date(combined);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}
// =========================
// COUNTDOWN
// =========================

let nextMatchCountdownInterval = null;

function parseUpcomingGameDateTime(game) {
  if (!game?.date || !game?.time) return null;

  const combined = `${game.date} ${game.time}`;
  const parsed = new Date(combined);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatNextMatchDate(gameDate) {
  return gameDate.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function setNextMatchCountdownValues({
  days = '--',
  hours = '--',
  minutes = '--',
  seconds = '--'
} = {}) {
  const daysEl = getById('countdown-days');
  const hoursEl = getById('countdown-hours');
  const minutesEl = getById('countdown-minutes');
  const secondsEl = getById('countdown-seconds');

  if (daysEl) daysEl.textContent = days;
  if (hoursEl) hoursEl.textContent = hours;
  if (minutesEl) minutesEl.textContent = minutes;
  if (secondsEl) secondsEl.textContent = seconds;
}

function initNextMatchCountdown(games) {
  const nextMatchSection = getById('next-match');
  const nextMatchOpponent = getById('next-match-opponent');
  const nextMatchMeta = getById('next-match-meta');

  const daysEl = getById('countdown-days');
  const hoursEl = getById('countdown-hours');
  const minutesEl = getById('countdown-minutes');
  const secondsEl = getById('countdown-seconds');

  if (
    !nextMatchSection ||
    !nextMatchOpponent ||
    !nextMatchMeta ||
    !daysEl ||
    !hoursEl ||
    !minutesEl ||
    !secondsEl
  ) {
    return;
  }

  const realGames = (games || []).filter((game) => !game.example);

  const datedGames = realGames
    .map((game) => {
      const dateTime = new Date(`${game.date} ${game.time || '12:00 PM'}`);

      return {
        ...game,
        dateTime
      };
    })
    .filter((game) => !Number.isNaN(game.dateTime.getTime()));

  const now = new Date();

  const futureGames = datedGames
    .filter((game) => game.dateTime > now)
    .sort((a, b) => a.dateTime - b.dateTime);

  const nextGame = futureGames[0];

  // If there is no real upcoming game, hide the whole countdown section.
  if (!nextGame) {
    nextMatchSection.style.display = 'none';
    return;
  }

  // If there is a real upcoming game, show the countdown section.
  nextMatchSection.style.display = '';

  nextMatchOpponent.textContent = `Auburn Rugby vs ${nextGame.opponent}`;
  nextMatchMeta.textContent = `${nextGame.type || 'Match'} • ${nextGame.date} • ${nextGame.time || 'TBD'} • ${nextGame.location || 'TBD'}`;

  function updateCountdown() {
    const currentTime = new Date();
    const distance = nextGame.dateTime - currentTime;

    if (distance <= 0) {
      nextMatchSection.style.display = 'none';
      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((distance / (1000 * 60)) % 60);
    const seconds = Math.floor((distance / 1000) % 60);

    daysEl.textContent = days;
    hoursEl.textContent = String(hours).padStart(2, '0');
    minutesEl.textContent = String(minutes).padStart(2, '0');
    secondsEl.textContent = String(seconds).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

// =========================
// PREVIOUS GAMES
// =========================

/**
 * Render the previous games rail and wire each card to the game modal.
 *
 * Expected input:
 * - an array of game objects from previous-games.json
 */
function initPreviousGames(games) {
  const container = getById('previous-games-container');
  if (!container) return;

  const modalClose = getById('game-modal-close');
  const modalBackdrop = getById('game-modal-backdrop');

  container.innerHTML = '';

  games.forEach((game) => {
    const card = document.createElement('article');
    card.className = 'upcoming-game-card previous-game-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View game details for ${game.team} versus ${game.opponent}`);

    card.innerHTML = `
      <div class="espn-game-card">
        <div class="espn-game-top">
          <span class="espn-status-badge">FINAL</span>
          <span class="espn-game-type">${game.type}</span>
        </div>

        <div class="espn-matchup">
          <div class="espn-team-row">
            <div class="espn-team-info">
              <img src="images/AUNavyLogo.png" alt="${game.team} logo" class="espn-team-logo">
              <span class="espn-team-name">${game.team}</span>
            </div>
            <span class="espn-score-box ${game.scoreUs > game.scoreThem ? 'win' : 'loss'}">${game.scoreUs}</span>
          </div>

          <div class="espn-team-row">
            <div class="espn-team-info">
              <img src="${game.image}" alt="${game.opponent} logo" class="espn-team-logo">
              <span class="espn-team-name">${game.opponent}</span>
            </div>
            <span class="espn-score-box ${game.scoreThem > game.scoreUs ? 'win' : 'loss'}">${game.scoreThem}</span>
          </div>
        </div>

        <div class="espn-game-footer">
          <span class="espn-location-label">Location</span>
          <span class="espn-location-value">${game.location}</span>
        </div>
      </div>
    `;

    addCardActivation(card, () => openGameModal(game));
    container.appendChild(card);
  });

  if (modalClose) modalClose.addEventListener('click', closeGameModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeGameModal);
  bindEscapeToModal('game-modal', closeGameModal);
}

// =========================
// SCHEDULE TABLE
// =========================

/**
 * Render the older schedule table if the table exists on the page.
 * The current Home page has this section commented out, but the code is kept intact.
 */
function initScheduleTable() {
  loadJson('schedule.json').then((games) => {
    const tbody = getById('schedule-body');
    if (!tbody) return;

    games.forEach((game) => {
      const row = document.createElement('tr');

      row.innerHTML = `
        <td>${game.date}</td>
        <td>
          <img src="${game.image}" alt="logo" />
          ${game.school}
        </td>
        <td>${game.hereaway}</td>
      `;

      tbody.appendChild(row);
    });
  });
}

// =========================
// TRAINING SESSIONS
// =========================

/**
 * Render training cards and embedded maps.
 * This preserves address-based map loading and mapsQuery overrides.
 */
function initTrainingSessions() {
  loadJson('training.json').then((trainingSessions) => {
    const container = getById('training-container');
    if (!container) return;

    trainingSessions.forEach((session) => {
      const { maps, embed } = buildGoogleMapsUrls(session.address, session.mapsQuery);

      const card = document.createElement('article');
      card.className = 'training-card';

      card.innerHTML = `
        <div class="training-content">
          <div class="training-info">
            <span class="training-badge">Weekly Session</span>
            <h3>${session.date}</h3>

            <div class="training-meta">
              <div class="training-meta-item">
                <div class="training-meta-icon"></div>
                <div class="training-meta-text">
                  <span class="training-meta-label">Time</span>
                  <p class="training-meta-value">${session.time}</p>
                </div>
              </div>

              <div class="training-meta-item">
                <div class="training-meta-icon"></div>
                <div class="training-meta-text">
                  <span class="training-meta-label">Location</span>
                  <p class="training-meta-value">
                    <a href="${maps}" target="_blank" rel="noopener noreferrer">
                      ${session.location}
                    </a>
                  </p>
                </div>
              </div>
            </div>

            <p class="training-address">${session.address}</p>
          </div>

          <div class="training-map-container">
            <iframe
              src="${embed}"
              loading="lazy"
              allowfullscreen
              referrerpolicy="no-referrer-when-downgrade"
              title="Map for ${session.location}">
            </iframe>
          </div>
        </div>
      `;

      container.appendChild(card);
    });
  });
}

// =========================
// HERO VIDEO HOVER EFFECT
// =========================
// This is intentionally defensive. If the page does not include a hero video,
// nothing runs and the poster image stays as-is.

function initHeroVideo() {
  const heroBlock = document.querySelector('.hero-image');
  const heroVideo = getById('hero-video');

  if (!heroBlock || !heroVideo || !window.matchMedia('(hover: hover)').matches) {
    return;
  }

  heroBlock.addEventListener('mouseenter', () => {
    heroBlock.classList.add('is-playing');
    heroVideo.currentTime = 0;
    heroVideo.play();
  });

  heroBlock.addEventListener('mouseleave', () => {
    heroVideo.pause();
    heroVideo.currentTime = 0;
    heroBlock.classList.remove('is-playing');
  });
}

// =========================
// CONTACT FORM (FORMSPREE AJAX)
// =========================

/**
 * Wire a form so submission happens through AJAX instead of a full page redirect.
 * 
 * This program uses Formspree's AJAX API, which means the form action URL should be set to the Formspree endpoint.
 *
 * Expected input:
 * - formId: the id of a form element
 *
 * Behavior:
 * - POSTs FormData to the form action URL
 * - resets the form on success
 * - opens the contact success modal on success
 */
function setupAjaxForm(formId) {
  const form = getById(formId);
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const action = form.getAttribute('action');

    try {
      const response = await fetch(action, {
        method: 'POST',
        body: formData,
        headers: {
          Accept: 'application/json'
        }
      });

      if (response.ok) {
        form.reset();
        openContactSuccessModal();
      } else {
        alert('Something went wrong. Please try again.');
      }
    } catch (error) {
      alert('Something went wrong. Check connection.');
    }
  });
}

/** Open the thank-you modal shown after a successful contact form submission. */
function openContactSuccessModal() {
  const modal = getById('contact-success-modal');
  if (!modal) return;

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

/** Close the thank-you modal shown after a successful contact form submission. */
function closeContactSuccessModal() {
  const modal = getById('contact-success-modal');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

/** Wire the success modal close button and backdrop click behavior. */
function initContactSuccessModal() {
  const closeButton = getById('contact-success-close');
  if (closeButton) {
    closeButton.addEventListener('click', closeContactSuccessModal);
  }

  const modal = getById('contact-success-modal');
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target.classList.contains('contact-success-backdrop')) {
        closeContactSuccessModal();
      }
    });
  }
}

// =========================
// CLEAN HEADER SCROLL EFFECT
// Adds shadow only (no hiding)
// =========================

const siteHeader = document.getElementById('site-header');

if (siteHeader) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      siteHeader.classList.add('scrolled');
    } else {
      siteHeader.classList.remove('scrolled');
    }
  });
}

// =========================
// PAGE STARTUP
// =========================
// Load the shared roster/game data first because multiple features depend on it.

Promise.all([
  loadJson('roster.json'),
  loadJson('previous-games.json')
]).then(([players, previousGames]) => {
  allRosterPlayers = players;
  allPreviousGames = previousGames;

  buildPlayerMap(allRosterPlayers);
  buildPlayerSeasonStats(allPreviousGames);

  initRoster(allRosterPlayers);
  initPreviousGames(allPreviousGames);
});

// Independent page features can initialize immediately.
initUpcomingGames();
initScheduleTable();
initTrainingSessions();
initHeroVideo();
setupAjaxForm('player-contact-form');
setupAjaxForm('sponsor-contact-form');
initContactSuccessModal();
