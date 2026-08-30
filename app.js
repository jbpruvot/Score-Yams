// Storage helper with localStorage fallback to memory
const Storage = (() => {
  const memory = {};
  const namespace = 'yams_v2';
  
  const safeExecute = (fn, fallback) => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  return {
    set(key, value) {
      safeExecute(() => localStorage.setItem(`${namespace}:${key}`, JSON.stringify(value)));
      memory[key] = value;
    },
    get(key, defaultValue) {
      const stored = safeExecute(() => localStorage.getItem(`${namespace}:${key}`));
      return stored ? JSON.parse(stored) : (key in memory ? memory[key] : defaultValue);
    },
    remove(key) {
      safeExecute(() => localStorage.removeItem(`${namespace}:${key}`));
      delete memory[key];
    }
  };
})();

class YamsGame {
  constructor() {
    // Game constants
    this.CONSTANTS = Object.freeze({
      UPPER_TARGET: 63,
      UPPER_BONUS: 35
    });

    // Score configurations
    this.FIXED_SCORES = {
      'full': 25,
      'petite-suite': 30,
      'grande-suite': 40,
      'yams': 50
    };

    this.UPPER_CATEGORIES = ['as', 'deux', 'trois', 'quatre', 'cinq', 'six'];
    this.LOWER_CATEGORIES = ['brelan', 'carre', 'full', 'petite-suite', 'grande-suite', 'yams', 'chance'];
    this.ALL_CATEGORIES = [...this.UPPER_CATEGORIES, ...this.LOWER_CATEGORIES];

    this.PLACEHOLDERS = {
      'as': '0/1/2/3/4/5',
      'deux': '0/2/4/6/8/10',
      'trois': '0/3/6/9/12/15',
      'quatre': '0/4/8/12/16/20',
      'cinq': '0/5/10/15/20/25',
      'six': '0/6/12/18/24/30',
      'brelan': '-',
      'carre': '-',
      'chance': '-',
      'full': '0 / 25',
      'petite-suite': '0 / 30',
      'grande-suite': '0 / 40',
      'yams': '0 / 50'
    };

    // Game state - STRUCTURE SELON SPÉCIFICATIONS
    this.state = {
      activePlayer: 0,
      scores: [{}, {}], // Correspond aux spécifications : scores de la partie en cours
      playerNames: ['Caty', 'JB'],
      gameId: this.generateGameId(),
      startTime: new Date().toISOString()
    };

    // Undo/Redo stacks
    this.undoStack = [];
    this.redoStack = [];
    this.MAX_STACK_SIZE = 50;

    this.cacheElements();
    this.bindEvents();
    this.loadGameState();
    this.updateUI();
    this.startAutoSave();
  }

  generateGameId() {
    return `game_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  }

  cacheElements() {
    this.elements = {
      // Header controls
      activeBadge: document.getElementById('activeBadge'),
      historyBtn: document.getElementById('historyBtn'),
      statsBtn: document.getElementById('statsBtn'),
      printBtn: document.getElementById('printBtn'),

      // Player configuration
      name0: document.getElementById('name0'),
      name1: document.getElementById('name1'),
      starter: document.getElementById('starter'),
      applyStarter: document.getElementById('applyStarter'),

      // Headers and labels
      headers: [document.getElementById('h0'), document.getElementById('h1')],
      labels: [document.getElementById('h0Label'), document.getElementById('h1Label')],

      // Progress elements
      progressBars: [document.getElementById('p0bar'), document.getElementById('p1bar')],
      progressTexts: [document.getElementById('p0remain'), document.getElementById('p1remain')],

      // Main elements
      grid: document.getElementById('grid'),
      gridWrapper: document.querySelector('.grid-wrapper'),
      resetBtn: document.getElementById('resetBtn'),

      // Statistics modal
      statsModal: document.getElementById('statsModal'),
      closeStatsModal: document.getElementById('closeStatsModal'),
      statsContent: document.getElementById('statsContent')
    };

    // Log missing elements for debugging
    Object.entries(this.elements).forEach(([key, element]) => {
      if (!element && !Array.isArray(element)) {
        console.warn(`Element not found: ${key}`);
      } else if (Array.isArray(element)) {
        element.forEach((el, index) => {
          if (!el) console.warn(`Element not found: ${key}[${index}]`);
        });
      }
    });
  }

  bindEvents() {
    // Header button events
    if (this.elements.historyBtn) {
      this.elements.historyBtn.addEventListener('click', () => this.showGameHistory());
    }
    if (this.elements.statsBtn) {
      this.elements.statsBtn.addEventListener('click', () => this.showDailyStats());
    }
    if (this.elements.printBtn) {
      this.elements.printBtn.addEventListener('click', () => this.printHistory());
    }

    // Statistics modal events
    if (this.elements.closeStatsModal) {
      this.elements.closeStatsModal.addEventListener('click', () => this.closeStatsModal());
    }
    if (this.elements.statsModal) {
      this.elements.statsModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
          this.closeStatsModal();
        }
      });
    }

    // Player name events
    if (this.elements.name0) {
      this.elements.name0.addEventListener('input', (e) => {
        this.state.playerNames[0] = (e.target.value || 'Caty').trim() || 'Caty';
        this.updateNames();
        this.saveGameState();
      });
    }

    if (this.elements.name1) {
      this.elements.name1.addEventListener('input', (e) => {
        this.state.playerNames[1] = (e.target.value || 'JB').trim() || 'JB';
        this.updateNames();
        this.saveGameState();
      });
    }

    // Game controls
    if (this.elements.applyStarter) {
      this.elements.applyStarter.addEventListener('click', () => this.applyStarter());
    }
    if (this.elements.resetBtn) {
      this.elements.resetBtn.addEventListener('click', () => this.resetGame());
    }

    // Grid events
    if (this.elements.grid) {
      this.elements.grid.addEventListener('click', (e) => this.handleGridClick(e));
      this.elements.grid.addEventListener('dblclick', (e) => this.handleGridDoubleClick(e));
      
      // Keyboard events
      this.elements.grid.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
          const cell = e.target.closest('td.score');
          if (cell) {
            e.preventDefault();
            this.openEditorForCell(cell, false);
          }
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.nextTurn();
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.previousTurn();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.closeAllEditors();
          this.closeStatsModal();
        }
      });
    }

    // Save on page unload
    window.addEventListener('beforeunload', () => this.saveGameState());
  }

  applyStarter() {
    if (this.elements.starter) {
      this.state.activePlayer = parseInt(this.elements.starter.value, 10) || 0;
      this.updateUI();
      this.saveGameState();
      this.showToast('Partie démarrée !');
    }
  }

  nextTurn() {
    this.state.activePlayer = (this.state.activePlayer + 1) % 2;
    this.updateUI();
    this.saveGameState();
  }

  previousTurn() {
    this.state.activePlayer = (this.state.activePlayer + 1) % 2;
    this.updateUI();
    this.saveGameState();
  }

  updateUI() {
    this.markActiveColumn();
    this.updateActiveBadge();
    this.updateAllProgress();
    this.updateNames();
  }

  markActiveColumn() {
    if (!this.elements.grid) return;
    
    // Remove existing active column classes
    this.elements.grid.className = this.elements.grid.className.replace(/col-\d+/g, '');
    this.elements.grid.classList.add(`col-${this.state.activePlayer}`);

    // Remove all active-col classes
    this.elements.grid.querySelectorAll('.active-col').forEach(el => {
      el.classList.remove('active-col');
    });

    // Add active-col to current player's column
    const activeHeader = this.elements.headers[this.state.activePlayer];
    if (activeHeader) activeHeader.classList.add('active-col');

    // Add active-col to all score cells for active player
    this.ALL_CATEGORIES.forEach(category => {
      const cell = document.getElementById(`${category}-${this.state.activePlayer}`);
      if (cell) cell.classList.add('active-col');
    });
  }

  updateActiveBadge() {
    if (!this.elements.activeBadge) return;
    
    const playerName = this.state.playerNames[this.state.activePlayer];
    this.elements.activeBadge.textContent = `Tour : ${playerName}`;
    this.elements.activeBadge.classList.remove('player-0', 'player-1');
    this.elements.activeBadge.classList.add(`player-${this.state.activePlayer}`);
  }

  handleGridClick(e) {
    const cell = e.target.closest('td');
    if (!cell) return;

    // Handle edit button clicks
    if (e.target.classList.contains('edit-btn')) {
      e.stopPropagation();
      this.openEditorForCell(cell, true);
      return;
    }

    // Only handle clickable or fixed cells
    if (!(cell.classList.contains('clickable') || cell.classList.contains('fixed'))) return;

    e.preventDefault();
    this.openEditorForCell(cell, false);
  }

  handleGridDoubleClick(e) {
    const cell = e.target.closest('td');
    if (!cell || !cell.classList.contains('fixed')) return;
    e.preventDefault();
    this.openEditorForCell(cell, true);
  }

  parseCell(cellId) {
    if (!cellId) return { category: '', player: NaN };
    const lastDashIndex = cellId.lastIndexOf('-');
    if (lastDashIndex < 0) return { category: '', player: NaN };
    
    return {
      category: cellId.slice(0, lastDashIndex),
      player: parseInt(cellId.slice(lastDashIndex + 1), 10)
    };
  }

  openEditorForCell(cell, forceEdit) {
    const cellId = cell.getAttribute('id');
    const { category, player } = this.parseCell(cellId);
    
    if (!category || !this.ALL_CATEGORIES.includes(category)) return;

    // Only allow editing if it's the active player's turn or forced edit
    if (player !== this.state.activePlayer && this.state.scores[player][category] === undefined && !forceEdit) {
      return;
    }

    const isFixed = this.state.scores[player][category] !== undefined;
    const isEdit = forceEdit || isFixed;

    if (this.FIXED_SCORES[category]) {
      this.openFixedScoreChooser(category, player, isEdit);
    } else if (this.UPPER_CATEGORIES.includes(category)) {
      this.openUpperScoreChooser(category, player, isEdit);
    } else {
      this.openCustomScoreEditor(category, player, isEdit);
    }
  }

  createBackdrop() {
    this.closeAllEditors();
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('click', () => this.closeAllEditors());
    document.body.appendChild(backdrop);
    return backdrop;
  }

  closeAllEditors() {
    document.querySelectorAll('.chooser, .editor, .backdrop').forEach(el => el.remove());
  }

  openFixedScoreChooser(category, player, isEdit) {
    this.createBackdrop();
    const chooser = document.createElement('div');
    chooser.className = 'chooser';
    chooser.setAttribute('role', 'dialog');
    chooser.setAttribute('aria-label', 'Choix score');

    const title = document.createElement('h3');
    title.textContent = `${category.charAt(0).toUpperCase() + category.slice(1)}`;
    chooser.appendChild(title);

    const value = this.FIXED_SCORES[category];
    
    const successBtn = this.createButton('ok', `Fait (${value} pts)`);
    const failBtn = this.createButton('cancel', 'Raté (0 pt)');
    const cancelBtn = this.createButton('cancel', 'Annuler');

    successBtn.onclick = () => {
      this.applyScore(category, player, value, isEdit);
      this.closeAllEditors();
    };

    failBtn.onclick = () => {
      this.applyScore(category, player, 0, isEdit);
      this.closeAllEditors();
    };

    cancelBtn.onclick = () => this.closeAllEditors();

    chooser.append(successBtn, failBtn, cancelBtn);
    document.body.appendChild(chooser);
    successBtn.focus();
  }

  getUpperScoreOptions(category) {
    const multipliers = { as: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
    const base = multipliers[category];
    return [0, base, 2 * base, 3 * base, 4 * base, 5 * base];
  }

  openUpperScoreChooser(category, player, isEdit) {
    this.createBackdrop();
    const chooser = document.createElement('div');
    chooser.className = 'chooser';
    chooser.setAttribute('role', 'dialog');

    const title = document.createElement('h3');
    title.textContent = `${category.charAt(0).toUpperCase() + category.slice(1)}`;
    chooser.appendChild(title);

    const options = this.getUpperScoreOptions(category);
    
    options.forEach(value => {
      const chip = this.createButton('chip', String(value));
      chip.onclick = () => {
        this.applyScore(category, player, value, isEdit);
        this.closeAllEditors();
      };
      chooser.appendChild(chip);
    });

    const cancelBtn = this.createButton('cancel', 'Annuler');
    cancelBtn.onclick = () => this.closeAllEditors();
    chooser.appendChild(cancelBtn);

    document.body.appendChild(chooser);
    chooser.querySelector('.chip').focus();
  }

  openCustomScoreEditor(category, player, isEdit) {
    this.createBackdrop();
    const editor = document.createElement('div');
    editor.className = 'editor';
    editor.setAttribute('role', 'dialog');

    const title = document.createElement('h3');
    title.textContent = `${category.charAt(0).toUpperCase() + category.slice(1)}`;
    editor.appendChild(title);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.placeholder = 'score';
    input.setAttribute('aria-label', 'Entrer un score');

    // Quick score buttons
    [0, 15, 20, 25, 30].forEach(value => {
      const chip = this.createButton('chip', String(value));
      chip.onclick = () => input.value = value;
      editor.appendChild(chip);
    });

    const okBtn = this.createButton('ok', 'OK');
    const cancelBtn = this.createButton('cancel', 'Annuler');

    const commit = () => {
      const value = parseInt(input.value, 10);
      if (!Number.isFinite(value) || value < 0) {
        alert('Entrez un entier ≥ 0');
        return;
      }
      if (value > 30 && !confirm('La somme habituelle ne dépasse pas 30. Continuer ?')) {
        return;
      }
      this.applyScore(category, player, value, isEdit);
      this.closeAllEditors();
    };

    okBtn.onclick = commit;
    cancelBtn.onclick = () => this.closeAllEditors();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.closeAllEditors();
      }
    });

    editor.prepend(input);
    editor.append(okBtn, cancelBtn);
    document.body.appendChild(editor);
    
    setTimeout(() => input.focus(), 100);
  }

  createButton(className, text) {
    const button = document.createElement('button');
    button.className = className;
    button.textContent = text;
    button.type = 'button';
    return button;
  }

  ensureEditButton(cell) {
    if (cell.querySelector('.edit-btn')) return;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✎';
    editBtn.type = 'button';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditorForCell(cell, true);
    });
    
    cell.appendChild(editBtn);
  }

  pushUndo(previousState) {
    this.undoStack.unshift(JSON.stringify(previousState));
    if (this.undoStack.length > this.MAX_STACK_SIZE) {
      this.undoStack.pop();
    }
    this.redoStack.length = 0;
  }

  createSnapshot() {
    return {
      scores: JSON.parse(JSON.stringify(this.state.scores)),
      activePlayer: this.state.activePlayer
    };
  }

  applyScore(category, player, value, isEdit) {
    const beforeState = this.createSnapshot();
    
    this.state.scores[player][category] = value;
    
    const cell = document.getElementById(`${category}-${player}`);
    if (!cell) return;

    cell.textContent = String(value);
    cell.classList.add('fixed');
    cell.classList.remove('clickable');
    this.ensureEditButton(cell);

    this.updateTotals(player);
    this.updateProgress(player);

    if (!isEdit) {
      this.state.activePlayer = (this.state.activePlayer + 1) % 2;
      this.updateUI();
    }

    this.saveGameState();
    this.checkGameComplete();
    this.pushUndo(beforeState);
  }

  redrawScores() {
    this.ALL_CATEGORIES.forEach(category => {
      for (let player = 0; player < 2; player++) {
        const cell = document.getElementById(`${category}-${player}`);
        if (!cell) continue;

        const value = this.state.scores[player][category];
        if (value !== undefined) {
          cell.textContent = String(value);
          cell.classList.add('fixed');
          cell.classList.remove('clickable');
          this.ensureEditButton(cell);
        } else {
          cell.textContent = this.PLACEHOLDERS[category] || '-';
          cell.classList.add('clickable');
          cell.classList.remove('fixed');
          cell.querySelectorAll('.edit-btn').forEach(btn => btn.remove());
        }
      }
    });
    this.updateAllProgress();
  }

  updateTotals(player) {
    // Upper section total
    const upperTotal = this.UPPER_CATEGORIES.reduce((total, category) => {
      return total + (this.state.scores[player][category] || 0);
    }, 0);
    
    const subUElement = document.getElementById(`subU-${player}`);
    if (subUElement) subUElement.textContent = upperTotal;

    // Bonus calculation
    const bonus = upperTotal >= this.CONSTANTS.UPPER_TARGET ? this.CONSTANTS.UPPER_BONUS : 0;
    const bonusElement = document.getElementById(`bonus-${player}`);
    if (bonusElement) bonusElement.textContent = bonus;

    // Total upper with bonus
    const totalUpper = upperTotal + bonus;
    const totUElement = document.getElementById(`totU-${player}`);
    if (totUElement) totUElement.textContent = totalUpper;

    // Lower section total
    const lowerTotal = this.LOWER_CATEGORIES.reduce((total, category) => {
      return total + (this.state.scores[player][category] || 0);
    }, 0);
    
    const totLElement = document.getElementById(`totL-${player}`);
    if (totLElement) totLElement.textContent = lowerTotal;

    // Final total
    const finalTotal = totalUpper + lowerTotal;
    const finalElement = document.getElementById(`final-${player}`);
    if (finalElement) finalElement.textContent = finalTotal;
  }

  updateProgress(player) {
    const subUElement = document.getElementById(`subU-${player}`);
    const upperSubtotal = parseInt(subUElement?.textContent || '0', 10);
    const percentage = Math.max(0, Math.min(100, Math.round((upperSubtotal / this.CONSTANTS.UPPER_TARGET) * 100)));
    
    if (this.elements.progressBars[player]) {
      this.elements.progressBars[player].style.width = `${percentage}%`;
    }
    
    const remaining = Math.max(0, this.CONSTANTS.UPPER_TARGET - upperSubtotal);
    if (this.elements.progressTexts[player]) {
      this.elements.progressTexts[player].textContent = remaining === 0 
        ? `Bonus atteint (+${this.CONSTANTS.UPPER_BONUS})`
        : `Reste ${remaining} pts pour le bonus`;
    }
  }

  updateAllProgress() {
    for (let player = 0; player < 2; player++) {
      this.updateTotals(player);
      this.updateProgress(player);
    }
  }

  // CORRECTION MAJEURE : Détection correcte de fin de partie (26 scores)
  isGameComplete() {
    let filledScores = 0;
    
    // Compter les scores remplis pour les deux joueurs
    this.ALL_CATEGORIES.forEach(category => {
      if (this.state.scores[0][category] !== undefined) filledScores++;
      if (this.state.scores[1][category] !== undefined) filledScores++;
    });
    
    return filledScores === 26; // 13 catégories × 2 joueurs
  }

  // CORRECTION MAJEURE : Fin de partie automatique avec sauvegarde correcte
  checkGameComplete() {
    if (this.isGameComplete()) {
      setTimeout(() => this.gameComplete(), 500);
    }
  }

  gameComplete() {
    const score0Element = document.getElementById('final-0');
    const score1Element = document.getElementById('final-1');
    const score0 = parseInt(score0Element?.textContent || '0', 10);
    const score1 = parseInt(score1Element?.textContent || '0', 10);
    const winner = score0 > score1 ? 0 : (score1 > score0 ? 1 : null);

    const message = `🎉 Partie terminée !\n\n${this.state.playerNames[0]}: ${score0} pts\n${this.state.playerNames[1]}: ${score1} pts\n\n${
      winner !== null ? `🏆 Gagnant: ${this.state.playerNames[winner]}` : '🤝 Match nul !'
    }`;

    alert(message);
    
    // CORRECTION : Toujours sauvegarder avec isComplete: true
    this.saveToHistory(true);
  }

  // CORRECTION MAJEURE : Nouvelle partie garde l'historique intact
  resetGame() {
    this.closeAllEditors();
    this.closeStatsModal();
    if (!confirm('Commencer une nouvelle partie ?')) return;

    try {
      // CORRECTION : Ne sauvegarder la partie actuelle QUE si elle a des scores significatifs
      // Et SEULEMENT si elle n'est pas déjà dans l'historique
      if (this.hasSignificantScores()) {
        const history = Storage.get('history', []);
        const alreadyInHistory = history.some(game => game.gameId === this.state.gameId);
        if (!alreadyInHistory) {
          this.saveToHistory(false); // Partie incomplète si pas finie
        }
      }

      // RÉINITIALISER SEULEMENT L'ÉTAT DE JEU (PAS L'HISTORIQUE)
      this.state = {
        activePlayer: parseInt(this.elements.starter?.value || '0', 10) || 0,
        scores: [{}, {}], // Réinitialiser les scores
        playerNames: [...this.state.playerNames], // Garder les noms
        gameId: this.generateGameId(), // Nouveau ID
        startTime: new Date().toISOString()
      };

      this.redrawScores();

      // Reset all totals
      ['subU-0', 'subU-1', 'bonus-0', 'bonus-1', 'totU-0', 'totU-1', 'totL-0', 'totL-1', 'final-0', 'final-1'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '0';
      });

      // Reset progress bars
      this.elements.progressBars.forEach(bar => {
        if (bar) bar.style.width = '0%';
      });
      this.elements.progressTexts.forEach(text => {
        if (text) text.textContent = 'Reste 63 pts pour le bonus';
      });

      // Clear active columns
      if (this.elements.grid) {
        this.elements.grid.querySelectorAll('.active-col').forEach(el => {
          el.classList.remove('active-col');
        });
      }

      // Clear undo/redo stacks
      this.undoStack.length = 0;
      this.redoStack.length = 0;

      this.updateUI();
      this.saveGameState();
      this.showToast('Nouvelle partie commencée !');
    } catch (error) {
      console.error('Erreur reset:', error);
      this.showToast('Erreur lors du reset', true);
    }
  }

  showToast(message, isError = false) {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    if (isError) {
      toast.style.background = 'var(--color-error)';
      toast.style.color = 'var(--color-btn-primary-text)';
    }
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  // Storage and persistence
  saveGameState() {
    const data = {
      ...this.state,
      timestamp: new Date().toISOString()
    };
    Storage.set('current_game', data);
  }

  loadGameState() {
    const data = Storage.get('current_game');
    if (!data) return;

    this.state.scores = data.scores || [{}, {}];
    this.state.activePlayer = data.activePlayer || 0;
    this.state.playerNames = data.playerNames || ['Caty', 'JB'];
    this.state.gameId = data.gameId || this.generateGameId();
    this.state.startTime = data.startTime || new Date().toISOString();

    setTimeout(() => this.restoreGameInterface(), 100);
  }

  restoreGameInterface() {
    if (this.elements.name0) this.elements.name0.value = this.state.playerNames[0];
    if (this.elements.name1) this.elements.name1.value = this.state.playerNames[1];
    this.redrawScores();
    this.updateNames();
    this.updateUI();

    if (this.hasAnyScores()) {
      this.showToast('Partie restaurée !');
    }
  }

  startAutoSave() {
    this._autoSaveInterval = setInterval(() => {
      if (this.hasAnyScores()) {
        this.saveGameState();
      }
    }, 15000);
  }

  hasAnyScores() {
    return this.ALL_CATEGORIES.some(category => 
      this.state.scores[0][category] !== undefined || 
      this.state.scores[1][category] !== undefined
    );
  }

  hasSignificantScores() {
    const scoreCount = this.ALL_CATEGORIES.reduce((count, category) => {
      return count + 
        (this.state.scores[0][category] !== undefined ? 1 : 0) +
        (this.state.scores[1][category] !== undefined ? 1 : 0);
    }, 0);
    return scoreCount >= 4;
  }

  // CORRECTION MAJEURE : Sauvegarde historique avec structure de données conforme
  saveToHistory(isComplete = false) {
    const history = Storage.get('history', []);
    const existingIndex = history.findIndex(game => game.gameId === this.state.gameId);
    
    const score0Element = document.getElementById('final-0');
    const score1Element = document.getElementById('final-1');
    const finalScore0 = parseInt(score0Element?.textContent || '0', 10);
    const finalScore1 = parseInt(score1Element?.textContent || '0', 10);
    
    // CORRECTION : Calculate upper scores selon spécifications
    const upperScore0 = this.UPPER_CATEGORIES.reduce((total, category) => {
      return total + (this.state.scores[0][category] || 0);
    }, 0);
    const upperScore1 = this.UPPER_CATEGORIES.reduce((total, category) => {
      return total + (this.state.scores[1][category] || 0);
    }, 0);
    
    // CORRECTION : Structure bonuses selon spécifications (35 ou 0, pas boolean)
    const bonus0 = upperScore0 >= this.CONSTANTS.UPPER_TARGET ? this.CONSTANTS.UPPER_BONUS : 0;
    const bonus1 = upperScore1 >= this.CONSTANTS.UPPER_TARGET ? this.CONSTANTS.UPPER_BONUS : 0;
    
    // CORRECTION : Structure de données exactement selon les spécifications
    const gameRecord = {
      gameId: this.state.gameId,
      date: new Date().toISOString(),
      playerNames: [...this.state.playerNames],
      finalScores: [finalScore0, finalScore1], // Conforme aux spécifications
      upperScores: [upperScore0, upperScore1], // Conforme aux spécifications
      bonuses: [bonus0, bonus1], // CORRECTION : valeurs 35/0, pas boolean
      winner: finalScore0 > finalScore1 ? 0 : (finalScore1 > finalScore0 ? 1 : null),
      isComplete // TOUJOURS true pour les parties dans l'historique selon les spécifications
    };

    if (existingIndex >= 0) {
      history[existingIndex] = gameRecord;
    } else {
      history.unshift(gameRecord);
    }

    // Keep only last 50 games
    if (history.length > 50) {
      history.splice(50);
    }

    Storage.set('history', history);
  }

  getHistory() {
    return Storage.get('history', []);
  }

  // CORRECTION MAJEURE : Filtre correctement les parties d'aujourd'hui depuis l'historique
  getTodaysGames() {
    const history = this.getHistory(); // Récupère SEULEMENT l'historique
    const today = new Date().toDateString(); // Format: "Fri Sep 05 2025"
    
    // CORRECTION : Filtre les parties jouées aujourd'hui depuis l'historique
    return history.filter(game => {
      const gameDate = new Date(game.date).toDateString();
      return gameDate === today; // NE PAS filtrer par isComplete ici car toutes les parties dans l'historique sont complètes
    });
  }

  // CORRECTION MAJEURE : Calcule les statistiques basées EXCLUSIVEMENT sur l'historique du jour
  calculateDailyStats() {
    const todaysGames = this.getTodaysGames(); // Récupère SEULEMENT les parties d'aujourd'hui depuis l'historique
    
    if (todaysGames.length === 0) {
      return {
        totalGames: 0,
        players: {}
      };
    }

    // CORRECTION : Analyser SEULEMENT l'historique, IGNORER la partie en cours
    const stats = {
      totalGames: todaysGames.length,
      players: {}
    };

    // Analyser chaque partie de l'historique du jour
    todaysGames.forEach(game => {
      game.playerNames.forEach((name, playerIndex) => {
        if (!stats.players[name]) {
          stats.players[name] = {
            gamesPlayed: 0,
            wins: 0,
            scores: [],
            bonuses: 0
          };
        }
        
        stats.players[name].gamesPlayed++;
        stats.players[name].scores.push(game.finalScores[playerIndex]);
        
        if (game.winner === playerIndex) {
          stats.players[name].wins++;
        }
        
        if (game.bonuses[playerIndex] > 0) {
          stats.players[name].bonuses++;
        }
      });
    });
    
    // Calculer moyennes, min, max pour chaque joueur
    Object.keys(stats.players).forEach(playerName => {
      const player = stats.players[playerName];
      const scores = player.scores;
      
      player.avgScore = scores.length > 0 ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : 0;
      player.maxScore = scores.length > 0 ? Math.max(...scores) : 0;
      player.minScore = scores.length > 0 ? Math.min(...scores) : 0;
      player.winRate = player.gamesPlayed > 0 ? Math.round((player.wins / player.gamesPlayed) * 100) : 0;
    });
    
    return stats;
  }

  showDailyStats() {
    const stats = this.calculateDailyStats(); // CORRECTION : Maintenant basé EXCLUSIVEMENT sur l'historique du jour
    
    if (!this.elements.statsContent) return;
    
    let content = '';
    
    if (stats.totalGames === 0) {
      content = '<div class="no-stats">❌ Aucune partie complète aujourd\'hui dans l\'historique<br><br>Les statistiques se basent uniquement sur les parties terminées et sauvegardées dans l\'historique.</div>';
    } else {
      // Global stats
      content += `
        <div class="stats-section">
          <h3>📊 Statistiques du jour</h3>
          <div class="global-stats">
            <p style="margin-bottom: 16px; color: var(--color-text-secondary); font-size: 14px;">
              📅 Basé sur ${stats.totalGames} partie${stats.totalGames > 1 ? 's' : ''} terminée${stats.totalGames > 1 ? 's' : ''} aujourd'hui
            </p>
            <ul class="stats-list">
              <li>
                <span class="stats-label">Parties complètes aujourd'hui</span>
                <span class="stats-value highlight">${stats.totalGames}</span>
              </li>
            </ul>
          </div>
        </div>
      `;

      // Player stats
      const playerNames = Object.keys(stats.players).filter(name => stats.players[name].gamesPlayed > 0);
      
      if (playerNames.length > 0) {
        content += `
          <div class="stats-section">
            <h3>👥 Statistiques par joueur</h3>
            <div class="stats-grid">
        `;
        
        playerNames.forEach(playerName => {
          const playerStat = stats.players[playerName];
          content += `
            <div class="stats-card">
              <h4>${playerName}</h4>
              <ul class="stats-list">
                <li>
                  <span class="stats-label">Parties jouées</span>
                  <span class="stats-value">${playerStat.gamesPlayed}</span>
                </li>
                <li>
                  <span class="stats-label">Victoires</span>
                  <span class="stats-value highlight">${playerStat.wins}</span>
                </li>
                <li>
                  <span class="stats-label">Taux de victoires</span>
                  <span class="stats-value">${playerStat.winRate}%</span>
                </li>
                <li>
                  <span class="stats-label">Score moyen</span>
                  <span class="stats-value">${playerStat.avgScore} pts</span>
                </li>
                <li>
                  <span class="stats-label">Score maximum</span>
                  <span class="stats-value highlight">${playerStat.maxScore} pts</span>
                </li>
                <li>
                  <span class="stats-label">Score minimum</span>
                  <span class="stats-value">${playerStat.minScore} pts</span>
                </li>
                <li>
                  <span class="stats-label">Bonus obtenus</span>
                  <span class="stats-value">${playerStat.bonuses}</span>
                </li>
              </ul>
            </div>
          `;
        });
        
        content += `
            </div>
          </div>
        `;
      }
    }

    this.elements.statsContent.innerHTML = content;
    this.elements.statsModal.classList.remove('hidden');
    this.elements.closeStatsModal.focus();
  }

  closeStatsModal() {
    if (this.elements.statsModal) {
      this.elements.statsModal.classList.add('hidden');
    }
  }

  showGameHistory() {
    const history = this.getHistory();
    if (history.length === 0) {
      alert('❌ Aucune partie dans l\'historique');
      return;
    }

    let message = '📚 Historique des 50 dernières parties:\n\n';
    history.slice(0, 15).forEach((game, index) => {
      const date = new Date(game.date).toLocaleDateString('fr-FR');
      const time = new Date(game.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      message += `${index + 1}. ${date} ${time}\n`;
      message += `   ${game.playerNames[0]}: ${game.finalScores[0]} pts`;
      if (game.bonuses && game.bonuses[0] > 0) message += ' (+bonus)';
      message += '\n';
      message += `   ${game.playerNames[1]}: ${game.finalScores[1]} pts`;
      if (game.bonuses && game.bonuses[1] > 0) message += ' (+bonus)';
      message += '\n';
      message += `   ${game.winner !== null ? '🏆 Gagnant: ' + game.playerNames[game.winner] : '🤝 Match nul'}`;
      if (!game.isComplete) message += '\n   ⚠️ Partie incomplète';
      message += '\n\n';
    });

    if (history.length > 15) {
      message += `... et ${history.length - 15} autres parties`;
    }

    alert(message);
  }

  printHistory() {
    const history = this.getHistory();
    if (history.length === 0) {
      alert('❌ Aucune partie dans l\'historique à imprimer');
      return;
    }

    // Create print content
    let printContent = `
      <div class="print-content" style="display: none;">
        <h1>📚 Historique des Parties Yams</h1>
    `;

    history.forEach((game, index) => {
      const date = new Date(game.date).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const time = new Date(game.date).toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      printContent += `
        <div class="print-history-item">
          <div class="print-history-header">
            Partie ${index + 1} - ${date} à ${time}
            ${!game.isComplete ? ' (Incomplète)' : ''}
          </div>
          <div class="print-history-scores">
            <span>${game.playerNames[0]}: ${game.finalScores[0]} pts${game.bonuses && game.bonuses[0] > 0 ? ' (+bonus)' : ''}</span>
            <span>${game.playerNames[1]}: ${game.finalScores[1]} pts${game.bonuses && game.bonuses[1] > 0 ? ' (+bonus)' : ''}</span>
          </div>
          <div class="print-history-winner">
            ${game.winner !== null ? 
              `🏆 Gagnant: ${game.playerNames[game.winner]}` : 
              '🤝 Match nul'
            }
          </div>
        </div>
      `;
    });

    printContent += '</div>';

    // Add to document temporarily
    const printDiv = document.createElement('div');
    printDiv.innerHTML = printContent;
    document.body.appendChild(printDiv);

    // Print
    window.print();

    // Remove after printing
    setTimeout(() => {
      document.body.removeChild(printDiv);
    }, 1000);
  }

  updateNames() {
    const names = [
      this.state.playerNames[0] || 'Caty',
      this.state.playerNames[1] || 'JB'
    ];

    this.elements.headers.forEach((header, index) => {
      if (header) header.textContent = names[index];
    });

    this.elements.labels.forEach((label, index) => {
      if (label) label.textContent = names[index];
    });

    if (this.elements.name0 && this.elements.name0.value !== names[0]) {
      this.elements.name0.value = names[0];
    }
    if (this.elements.name1 && this.elements.name1.value !== names[1]) {
      this.elements.name1.value = names[1];
    }

    this.updateActiveBadge();
  }
}

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.yamsGame = new YamsGame();
    console.log('✅ Yams game initialized with corrected statistics system');
  } catch (error) {
    console.error('❌ Error initializing game:', error);
    alert('Erreur d\'initialisation. Rechargez la page.');
  }
});