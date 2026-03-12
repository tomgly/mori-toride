const UI = (() => {

  let gameState   = null;
  let myIndex     = -1;
  let myTurn      = false;
  let playerNames = ['', ''];
  let _gameStarted = false;

  let selected       = null;
  let highlightCells = [];
  let placeCells     = [];

  const canvas = document.getElementById('game-canvas');

  function init() {
    Network.init();
    Render.init(canvas);
    const saved = localStorage.getItem('mt_player_name');
    if (saved) document.getElementById('input-name').value = saved;
    _bindLobby();
    _bindCanvas();
    _bindNetwork();
    _applyUrl();
  }

  function _applyUrl() {
    const code = new URLSearchParams(location.search).get('code');
    if (code) document.getElementById('input-room-code').value = code.toUpperCase();
    showScreen('screen-lobby');
  }

  function _setUrl(code) {
    const p = new URLSearchParams();
    if (code) p.set('code', code);
    history.replaceState(null, '', '?' + p.toString());
  }

  function _clearUrl() {
    history.replaceState(null, '', location.pathname);
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.body.classList.toggle('game-active', id === 'screen-game');
  }

  function setStatus(html) {
    document.getElementById('status-text').innerHTML = html;
    const ws = document.getElementById('waiting-status-text');
    if (ws) ws.textContent = html;
  }

  function _bindLobby() {

    document.getElementById('btn-create').addEventListener('click', async () => {
      const name = document.getElementById('input-name').value.trim();
      if (!name) { _flashErr('input-name', '名前を入力してください'); return; }
      playerNames[0] = name;
      localStorage.setItem('mt_player_name', name);
      _setLoading('btn-create', true);
      try {
        const code = await Network.createRoom(name);
        myIndex = 0;
        _gameStarted = false;
        _setUrl(code);
        document.getElementById('room-code-display').textContent = code;
        showScreen('screen-waiting');
        setStatus('相手の参加を待っています…');
      } catch (e) {
        alert('ルーム作成失敗: ' + e.message);
      } finally {
        _setLoading('btn-create', false);
      }
    });

    document.getElementById('btn-join').addEventListener('click', async () => {
      const name = document.getElementById('input-name').value.trim();
      const code = document.getElementById('input-room-code').value.trim();
      if (!name) { _flashErr('input-name', '名前を入力してください'); return; }
      if (!code) { _flashErr('input-room-code', 'ルームコードを入力してください'); return; }
      playerNames[1] = name;
      localStorage.setItem('mt_player_name', name);
      _setLoading('btn-join', true);
      _setUrl(code);
      try {
        myIndex = await Network.joinRoom(code, name);
      } catch (e) {
        alert('参加失敗: ' + e.message);
        _setLoading('btn-join', false);
      }
    });

    document.getElementById('btn-spectate').addEventListener('click', async () => {
      const code = document.getElementById('input-room-code').value.trim();
      if (!code) { _flashErr('input-room-code', 'ルームコードを入力してください'); return; }
      _setLoading('btn-spectate', true);
      _setUrl(code);
      try {
        await Network.spectateRoom(code);
        myIndex = -1;
        showScreen('screen-waiting');
        setStatus('観戦を待っています…');
      } catch (e) {
        alert('観戦失敗: ' + e.message);
        _setLoading('btn-spectate', false);
      }
    });

    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const code = document.getElementById('room-code-display').textContent;
      navigator.clipboard.writeText(code).then(() => {
        const b = document.getElementById('btn-copy-code');
        b.textContent = 'コピーしました！';
        setTimeout(() => b.textContent = 'コードをコピー', 2000);
      });
    });

    document.getElementById('btn-copy-link').addEventListener('click', () => {
      const code = document.getElementById('room-code-display').textContent;
      const url  = `${location.origin}${location.pathname}?code=${code}`;
      navigator.clipboard.writeText(url).then(() => {
        const b = document.getElementById('btn-copy-link');
        b.textContent = 'コピーしました！';
        setTimeout(() => b.textContent = 'リンクをコピー', 2000);
      });
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      Network.leave();
      _clearUrl();
      document.getElementById('result-overlay').classList.remove('show');
      gameState = null; myIndex = -1; selected = null;
      highlightCells = []; placeCells = [];
      playerNames = ['', '']; _gameStarted = false;
      document.getElementById('input-room-code').value = '';
      showScreen('screen-lobby');
    });
  }

  function _bindNetwork() {

    Network.onOpponentJoined(async (opponentName, firstTurn) => {
      if (myIndex === 0) {
        if (_gameStarted) { await Network.sendRoomFull(); return; }
        playerNames[1] = opponentName;
        const ft = Math.random() < 0.5 ? 0 : 1;
        await Network.ackJoin(playerNames[0], ft);
        _gameStarted = true;
        _startGame(playerNames[0], playerNames[1], ft);
      } else {
        playerNames[0] = opponentName;
        _gameStarted = true;
        _startGame(playerNames[0], playerNames[1], firstTurn);
        _setLoading('btn-join', false);
      }
    });

    Network.onForcedSpectate(() => {
      myIndex = -1;
      _setLoading('btn-join', false);
      showScreen('screen-waiting');
      setStatus('満員のため観戦モードに切り替えました…');
    });

    Network.onSpectatorJoined(() => {
      if (!gameState || myIndex !== 0) return;
      Network.sendStateSync(gameState, playerNames[0], playerNames[1]);
    });

    Network.onSpectateSync((state, nameA, nameB) => {
      gameState = Game.deepClone(state);
      myIndex = -1;
      playerNames[0] = nameA; playerNames[1] = nameB;
      showScreen('screen-game');
      _redraw(); _updateInfo(); _updateStatus();
      _setLoading('btn-spectate', false);
    });

    Network.onGameAction(action => _applyRemote(action));

    Network.onOpponentLeft(() => {
      if (myIndex === -1 || !gameState || gameState.over) return;
      Network.leave();
      _clearUrl();
      _gameStarted = false;
      document.getElementById('result-title').textContent = '相手が切断しました';
      document.getElementById('result-sub').textContent   = 'ロビーに戻ります';
      document.getElementById('result-overlay').classList.add('show');
    });
  }

  function _startGame(nameA, nameB, firstTurn = 0) {
    gameState = Game.createState(nameA, nameB, firstTurn);
    myIndex   = Network.getMyIndex();
    selected  = null; highlightCells = []; placeCells = [];
    showScreen('screen-game');
    _updateInfo();
    _updateStatus();
    _refreshHandPanel();
    _redraw();
  }

  function _bindCanvas() {

    canvas.addEventListener('click', e => {
      if (!gameState || !myTurn || gameState.over) return;
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / rect.width;
      const sy = canvas.height / rect.height;
      const cell = Render.hitCell((e.clientX - rect.left)*sx, (e.clientY - rect.top)*sy);
      if (cell) _onCellClick(cell.col, cell.row);
    });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!gameState || !myTurn || gameState.over) return;
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width  / rect.width;
      const sy = canvas.height / rect.height;
      const cell = Render.hitCell((t.clientX - rect.left)*sx, (t.clientY - rect.top)*sy);
      if (cell) _onCellClick(cell.col, cell.row);
    }, { passive: false });
  }

  function _onCellClick(col, row) {
    const p   = gameState.players[myIndex];
    const occ = Game.buildOccupied(gameState);
    const key = Game.pk(col, row);
    const at  = occ.get(key);

    // 配置先クリック（手札選択中）
    if (selected && selected.type === 'hand') {
      if (placeCells.some(c => c.col === col && c.row === row)) {
        _doAction({ type: 'place', pieceId: selected.id, col, row });
        return;
      }
    }

    // 移動先クリック（駒選択中）
    if (selected && (selected.type === 'boss' || selected.type === 'field')) {
      if (highlightCells.some(c => c.col === col && c.row === row)) {
        const action = selected.type === 'boss'
          ? { type: 'move', subtype: 'boss', col, row }
          : { type: 'move', subtype: 'field', pieceId: selected.id, col, row };
        _doAction(action);
        return;
      }
    }

    // 自分の駒をクリック → 選択
    if (at && at.pIdx === myIndex) {
      // *** バグ修正: ボスの pieceType は 'bear' ***
      const pieceType = at.type === 'boss' ? 'bear' : at.piece.id;
      const newSel = at.type === 'boss'
        ? { type: 'boss', pIdx: myIndex }
        : { type: 'field', pIdx: myIndex, id: at.piece.id };

      // 同じ駒をクリック → 選択解除
      if (selected && selected.type === newSel.type && selected.id === newSel.id) {
        selected = null; highlightCells = []; placeCells = [];
      } else {
        selected = newSel;
        placeCells = [];
        const flip = at.type === 'boss' ? p.boss.flip : at.piece.flip;
        highlightCells = Game.legalMovesForPiece(col, row, pieceType, flip, occ, myIndex);
      }
      _redraw();
      return;
    }

    // 何もない / 相手の駒 → 選択解除
    selected = null; highlightCells = []; placeCells = [];
    _redraw();
  }

  function onHandCardClick(pieceId) {
    if (!myTurn || !gameState || gameState.over) return;
    const actions = Game.getLegalActions(gameState, myIndex);

    if (selected && selected.type === 'hand' && selected.id === pieceId) {
      selected = null; placeCells = []; highlightCells = [];
      _redraw(); return;
    }

    selected = { type: 'hand', pIdx: myIndex, id: pieceId };
    highlightCells = [];
    placeCells = actions
      .filter(a => a.type === 'place' && a.pieceId === pieceId)
      .map(a => ({ col: a.col, row: a.row }));
    _redraw();
    _refreshHandPanel();
  }

  function onReturnPiece(pieceId) {
    if (!myTurn || !gameState || gameState.over) return;
    _doAction({ type: 'return', pieceId });
  }

  function _doAction(action) {
    gameState = Game.applyAction(gameState, myIndex, action);
    Network.sendAction(action);
    selected = null; highlightCells = []; placeCells = [];
    _afterAction();
  }

  function _applyRemote(action) {
    if (!gameState || gameState.over) return;
    const actorIdx = myIndex === -1 ? gameState.turn : 1 - myIndex;
    gameState = Game.applyAction(gameState, actorIdx, action);
    selected = null; highlightCells = []; placeCells = [];
    _afterAction();
  }

  function _afterAction() {
    _updateInfo();
    _updateStatus();
    _refreshHandPanel();
    _redraw();
    if (gameState.over) _showResult();
  }

  function _redraw() {
    if (!gameState) return;
    Render.draw(gameState, myIndex, { highlightCells, placeCells, selectedPiece: selected });
  }

  function _updateInfo() {
    if (!gameState) return;
    const p0 = gameState.players[0];
    const p1 = gameState.players[1];
    document.getElementById('sente-name').textContent  = p0.name || '---';
    document.getElementById('gote-name').textContent   = p1.name || '---';
    document.getElementById('sente-hand-count').textContent  = p0.hand.length;
    document.getElementById('gote-hand-count').textContent   = p1.hand.length;
    document.getElementById('sente-field-count').textContent = p0.field.length;
    document.getElementById('gote-field-count').textContent  = p1.field.length;
    document.getElementById('sente-panel').classList.toggle('panel-active', gameState.turn === 0);
    document.getElementById('gote-panel').classList.toggle('panel-active',  gameState.turn === 1);
  }

  function _updateStatus() {
    myTurn = myIndex !== -1 && gameState.turn === myIndex;
    if (myIndex === -1) {
      setStatus('観戦中 — ' + (gameState.players[gameState.turn].name || '？') + ' のターン');
    } else if (myTurn) {
      setStatus('あなたのターン');
    } else {
      setStatus('相手のターン…');
    }
  }

  function _refreshHandPanel() {
    if (!gameState) return;
    for (let i = 0; i < 2; i++) {
      const isMe  = i === myIndex;
      const p     = gameState.players[i];
      const color = i === 0 ? CFG.COLOR_SENTE : CFG.COLOR_GOTE;
      const panelId = i === 0 ? 'hand-p0' : 'hand-p1';
      const panel = document.getElementById(panelId);
      if (!panel) continue;
      panel.innerHTML = '';

      for (const piece of p.hand) {
        const btn = document.createElement('button');
        btn.className = 'hand-card';
        const isSel = selected && selected.type === 'hand' && selected.id === piece.id && i === myIndex;
        if (isSel) btn.classList.add('selected');
        btn.style.borderColor = color;
        btn.innerHTML = `<span class="card-emoji">${piece.emoji}</span><span class="card-name">${piece.name}</span>`;
        if (isMe && myTurn && !gameState.over) {
          btn.addEventListener('click', () => onHandCardClick(piece.id));
        } else {
          btn.disabled = true;
        }
        panel.appendChild(btn);
      }

      for (const f of p.field) {
        const btn = document.createElement('button');
        btn.className = 'hand-card hand-card--field';
        btn.style.borderColor = color;
        btn.innerHTML = `<span class="card-emoji">${f.emoji}</span><span class="card-name">${f.name}<br><small>盤上</small></span>`;
        if (isMe && myTurn && !gameState.over) {
          btn.addEventListener('click', () => onReturnPiece(f.id));
          btn.title = '手持ちに戻す';
        } else {
          btn.disabled = true;
        }
        panel.appendChild(btn);
      }

      if (panel.children.length === 0) {
        panel.innerHTML = '<div class="hand-empty">手札なし</div>';
      }

      const mob = document.getElementById(panelId + '-mobile');
      if (mob) mob.innerHTML = panel.innerHTML;
    }
  }

  function _showResult() {
    const w     = gameState.winner;
    const wName = gameState.players[w].name || `Player ${w}`;
    const isMe  = w === myIndex;
    const isSp  = myIndex === -1;

    if (isSp) {
      document.getElementById('result-title').textContent = wName;
      document.getElementById('result-sub').textContent   = 'の勝利！';
    } else {
      document.getElementById('result-title').textContent = isMe ? '🎉 勝利！' : '😞 敗北…';
      document.getElementById('result-sub').textContent   = `${wName} の勝ち！`;
    }
    document.getElementById('result-overlay').classList.add('show');
  }

  function _flashErr(id, msg) {
    const el = document.getElementById(id);
    el.placeholder = msg;
    el.classList.add('input-error');
    setTimeout(() => { el.placeholder = ''; el.classList.remove('input-error'); }, 2000);
  }

  function _setLoading(id, v) {
    const b = document.getElementById(id);
    b.disabled = v;
    b.dataset.orig = b.dataset.orig || b.textContent;
    b.textContent = v ? '接続中…' : b.dataset.orig;
  }

  return { init };

})();

window.addEventListener('DOMContentLoaded', () => UI.init());