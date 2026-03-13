const UI = (() => {

  let gameState    = null;
  let myIndex      = -1;
  let myTurn       = false;
  let playerNames  = ['', ''];
  let _gameStarted = false;

  let selected       = null;
  let highlightCells = [];
  let placeCells     = [];
  let lastActionCell = null; // 最後の一手のセル座標

  const canvas = document.getElementById('game-canvas');

  // 駒の移動説明
  const MOVE_DESC = {
    bear:   '8方向1マス',
    wolf:   '8方向1マス',
    fox:    '上下左右1マス',
    tanuki: '斜め1マス',
    boar:   '上下左右∞マス',
    rabbit: 'L字（飛越可）',
  };

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

  function _clearUrl() { history.replaceState(null, '', location.pathname); }

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
        myIndex = 0; _gameStarted = false;
        _setUrl(code);
        document.getElementById('room-code-display').textContent = code;
        showScreen('screen-waiting');
        setStatus('相手の参加を待っています…');
      } catch (e) {
        console.error('ルーム作成エラー:', e);
        alert('ルーム作成失敗: ' + e.message + '\n\nSupabaseへの接続に失敗した可能性があります。ページを再読み込みして再試行してください。');
      } finally { _setLoading('btn-create', false); }
    });

    document.getElementById('btn-join').addEventListener('click', async () => {
      const name = document.getElementById('input-name').value.trim();
      const code = document.getElementById('input-room-code').value.trim();
      if (!name) { _flashErr('input-name', '名前を入力してください'); return; }
      if (!code) { _flashErr('input-room-code', 'ルームコードを入力してください'); return; }
      playerNames[1] = name;
      localStorage.setItem('mt_player_name', name);
      _setLoading('btn-join', true); _setUrl(code);
      try { myIndex = await Network.joinRoom(code, name); }
      catch (e) { alert('参加失敗: ' + e.message); _setLoading('btn-join', false); }
    });

    document.getElementById('btn-spectate').addEventListener('click', async () => {
      const code = document.getElementById('input-room-code').value.trim();
      if (!code) { _flashErr('input-room-code', 'ルームコードを入力してください'); return; }
      _setLoading('btn-spectate', true); _setUrl(code);
      try {
        await Network.spectateRoom(code);
        myIndex = -1; showScreen('screen-waiting'); setStatus('観戦を待っています…');
      } catch (e) { alert('観戦失敗: ' + e.message); _setLoading('btn-spectate', false); }
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
      Network.leave(); _clearUrl();
      document.getElementById('result-overlay').classList.remove('show');
      document.getElementById('board-view-banner').classList.remove('show');
      gameState = null; myIndex = -1; selected = null;
      highlightCells = []; placeCells = [];
      playerNames = ['', '']; _gameStarted = false;
      document.getElementById('input-room-code').value = '';
      showScreen('screen-lobby');
    });

    document.getElementById('btn-view-board').addEventListener('click', () => {
      document.getElementById('result-overlay').classList.remove('show');
      document.getElementById('board-view-banner').classList.add('show');
    });

    document.getElementById('btn-back-result').addEventListener('click', () => {
      document.getElementById('board-view-banner').classList.remove('show');
      document.getElementById('result-overlay').classList.add('show');
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
      myIndex = -1; _setLoading('btn-join', false);
      showScreen('screen-waiting'); setStatus('満員のため観戦モードに切り替えました…');
    });

    Network.onSpectatorJoined(() => {
      if (!gameState || myIndex !== 0) return;
      Network.sendStateSync(gameState, playerNames[0], playerNames[1]);
    });

    Network.onSpectateSync((state, nameA, nameB) => {
      gameState = Game.deepClone(state); myIndex = -1;
      playerNames[0] = nameA; playerNames[1] = nameB;
      showScreen('screen-game');
      _redraw(); _updateInfo(); _updateStatus();
      _setLoading('btn-spectate', false);
    });

    Network.onGameAction(action => _applyRemote(action));

    Network.onGameOver(winner => {
      if (!gameState || gameState.over) return;
      gameState = Game.deepClone(gameState);
      gameState.over   = true;
      gameState.winner = winner;
      _updateInfo(); _updateStatus(); _refreshHandPanel(); _redraw();
      setTimeout(() => _showResult(), 2000);
    });

    Network.onOpponentLeft(() => {
      if (myIndex === -1 || !gameState || gameState.over) return;
      Network.leave(); _clearUrl(); _gameStarted = false;
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
    _updateInfo(); _updateStatus(); _refreshHandPanel(); _redraw();
  }

  function _bindCanvas() {
    canvas.addEventListener('click', e => {
      if (!gameState || !myTurn || gameState.over) return;
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      const cell = Render.hitCell((e.clientX - rect.left)*sx, (e.clientY - rect.top)*sy, myIndex);
      if (cell) _onCellClick(cell.col, cell.row);
    });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!gameState || !myTurn || gameState.over) return;
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      const cell = Render.hitCell((t.clientX - rect.left)*sx, (t.clientY - rect.top)*sy, myIndex);
      if (cell) _onCellClick(cell.col, cell.row);
    }, { passive: false });
  }

  function _onCellClick(col, row) {
    const p   = gameState.players[myIndex];
    const occ = Game.buildOccupied(gameState);
    const at  = occ.get(Game.pk(col, row));

    // 手札選択中 → 配置先クリック
    if (selected && selected.type === 'hand') {
      if (placeCells.some(c => c.col === col && c.row === row)) {
        _doAction({ type: 'place', pieceId: selected.id, col, row }); return;
      }
    }

    // 駒選択中 → 移動先クリック
    if (selected && (selected.type === 'boss' || selected.type === 'field')) {
      if (highlightCells.some(c => c.col === col && c.row === row)) {
        const action = selected.type === 'boss'
          ? { type: 'move', subtype: 'boss', col, row }
          : { type: 'move', subtype: 'field', pieceId: selected.id, col, row };
        _doAction(action); return;
      }
    }

    // 自分の駒をクリック → 選択
    if (at && at.pIdx === myIndex) {
      const pieceType = at.type === 'boss' ? 'bear' : at.piece.id;
      const newSel = at.type === 'boss'
        ? { type: 'boss', pIdx: myIndex }
        : { type: 'field', pIdx: myIndex, id: at.piece.id };

      if (selected && selected.type === newSel.type && selected.id === newSel.id) {
        selected = null; highlightCells = []; placeCells = [];
      } else {
        selected = newSel; placeCells = [];
        highlightCells = Game.legalMovesForPiece(col, row, pieceType, occ, myIndex, p);
      }
      _redraw(); return;
    }

    selected = null; highlightCells = []; placeCells = [];
    _redraw();
  }

  function onHandCardClick(pieceId) {
    if (!myTurn || !gameState || gameState.over) return;
    const actions = Game.getLegalActions(gameState, myIndex);

    if (selected && selected.type === 'hand' && selected.id === pieceId) {
      selected = null; placeCells = []; highlightCells = []; _redraw(); return;
    }

    selected = { type: 'hand', pIdx: myIndex, id: pieceId };
    highlightCells = [];
    placeCells = actions
      .filter(a => a.type === 'place' && a.pieceId === pieceId)
      .map(a => ({ col: a.col, row: a.row }));
    _redraw(); _refreshHandPanel();
  }

  function onReturnPiece(pieceId) {
    if (!myTurn || !gameState || gameState.over) return;
    const legal = Game.getLegalActions(gameState, myIndex);
    const canReturn = legal.some(a => a.type === 'return' && a.pieceId === pieceId);
    if (!canReturn) {
      _shakeCard(pieceId);
      return;
    }
    _doAction({ type: 'return', pieceId });
  }

  function _shakeCard(pieceId) {
    if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
    // 自分のパネルのみ
    const panels = myIndex === -1 ? ['hand-your', 'hand-your-mobile'] : ['hand-your', 'hand-your-mobile'];
    for (const panelId of panels) {
      const panel = document.getElementById(panelId);
      if (!panel) continue;
      for (const card of panel.querySelectorAll('.hand-card--field')) {
        if (card.dataset.pieceId === pieceId) {
          card.classList.add('shake-error');
          setTimeout(() => card.classList.remove('shake-error'), 600);
        }
      }
    }
  }

  function _doAction(action) {
    const actorIdx = myIndex;
    _recordLastAction(action, actorIdx, gameState);
    gameState = Game.applyAction(gameState, myIndex, action);
    Network.sendAction(action);
    selected = null; highlightCells = []; placeCells = [];
    _afterAction();
    if (gameState.over) Network.sendGameOver(gameState.winner);
  }

  function _applyRemote(action) {
    if (!gameState || gameState.over) return;
    const actorIdx = myIndex === -1 ? gameState.turn : 1 - myIndex;
    _recordLastAction(action, actorIdx, gameState);
    gameState = Game.applyAction(gameState, actorIdx, action);
    selected = null; highlightCells = []; placeCells = [];
    _afterAction();
  }

  // 最後の一手を「どのプレイヤーのどの駒」として記録
  function _recordLastAction(action, actorIdx, state) {
    if (action.type === 'move') {
      if (action.subtype === 'boss') {
        lastActionCell = { pIdx: actorIdx, type: 'boss' };
      } else {
        lastActionCell = { pIdx: actorIdx, type: 'field', pieceId: action.pieceId };
      }
    } else if (action.type === 'place') {
      lastActionCell = { pIdx: actorIdx, type: 'field', pieceId: action.pieceId };
    } else {
      lastActionCell = null;
    }
  }

  function _afterAction() {
    _updateInfo(); _updateStatus(); _refreshHandPanel(); _redraw();
    if (gameState.over) {
      // 最後の一手をハイライトしたまま2秒待ってから結果表示
      setTimeout(() => _showResult(), 2000);
    }
  }

  function _redraw() {
    if (!gameState) return;
    // lastActionCellの駒IDから現在の座標を解決
    let resolvedLastCell = null;
    if (lastActionCell) {
      const p = gameState.players[lastActionCell.pIdx];
      if (lastActionCell.type === 'boss') {
        resolvedLastCell = { col: p.boss.col, row: p.boss.row };
      } else {
        const f = p.field.find(f => f.id === lastActionCell.pieceId);
        if (f) resolvedLastCell = { col: f.col, row: f.row };
      }
    }
    Render.draw(gameState, myIndex, { highlightCells, placeCells, selectedPiece: selected, lastActionCell: resolvedLastCell });
  }

  function _updateInfo() {
    if (!gameState) return;
    const meIdx  = myIndex === -1 ? 0 : myIndex;
    const oppIdx = 1 - meIdx;
    const pMe  = gameState.players[meIdx];
    const pOpp = gameState.players[oppIdx];
    document.getElementById('your-name').textContent        = pMe.name  || '---';
    document.getElementById('opp-name').textContent         = pOpp.name || '---';
    document.getElementById('your-hand-count').textContent  = pMe.hand.length;
    document.getElementById('opp-hand-count').textContent   = pOpp.hand.length;
    document.getElementById('your-field-count').textContent = pMe.field.length;
    document.getElementById('opp-field-count').textContent  = pOpp.field.length;
    document.getElementById('your-panel').classList.toggle('panel-active', gameState.turn === meIdx);
    document.getElementById('opp-panel').classList.toggle('panel-active',  gameState.turn === oppIdx);
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
    const meIdx  = myIndex === -1 ? 0 : myIndex;
    const oppIdx = 1 - meIdx;

    // ラベル更新
    const yourLabel = document.getElementById('hand-label-your');
    const oppLabel  = document.getElementById('hand-label-opp');
    if (yourLabel) yourLabel.textContent = myIndex === -1 ? '先手の手札' : 'あなたの手札';
    if (oppLabel)  oppLabel.textContent  = myIndex === -1 ? '後手の手札' : '相手の手札';

    // PC用パネル
    _buildHandPanel('hand-your', meIdx,  myIndex !== -1);
    _buildHandPanel('hand-opp',  oppIdx, false);
    // スマホ用パネル
    _buildHandPanel('hand-your-mobile', meIdx,  myIndex !== -1);
    _buildHandPanel('hand-opp-mobile',  oppIdx, false);
  }

  function _buildHandPanel(panelId, pIdx, isMe) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.innerHTML = '';
    const p     = gameState.players[pIdx];
    const color = pIdx === 0 ? CFG.COLOR_SENTE : CFG.COLOR_GOTE;

    // 手札駒
    for (const piece of p.hand) {
      const card = document.createElement('div');
      card.className = 'hand-card';
      const isSel = isMe && selected && selected.type === 'hand' && selected.id === piece.id;
      if (isSel) card.classList.add('selected');
      if (!isMe || !myTurn || gameState.over) card.classList.add('disabled');
      card.style.borderColor = color;
      const desc = MOVE_DESC[piece.id] || '';
      card.innerHTML =
        `<span class="card-emoji">${piece.emoji}</span>` +
        `<span class="card-name">${piece.name}</span>` +
        `<span class="card-move">${desc}</span>`;
      if (isMe && myTurn && !gameState.over) {
        card.addEventListener('click', () => onHandCardClick(piece.id));
      }
      panel.appendChild(card);
    }

    // 盤上の駒
    for (const f of p.field) {
      const card = document.createElement('div');
      card.className = 'hand-card hand-card--field';
      card.dataset.pieceId = f.id;
      if (!isMe || !myTurn || gameState.over) card.classList.add('disabled');
      const desc = MOVE_DESC[f.id] || '';
      card.innerHTML =
        `<span class="card-emoji">${f.emoji}</span>` +
        `<span class="card-name">${f.name}</span>` +
        `<span class="card-move">${desc}</span>` +
        `<span class="card-field-badge">盤上</span>`;
      if (isMe && myTurn && !gameState.over) {
        card.addEventListener('click', () => onReturnPiece(f.id));
        card.title = '手持ちに戻す';
      }
      panel.appendChild(card);
    }

    if (panel.children.length === 0) {
      panel.innerHTML = '<div class="hand-empty">手札なし</div>';
    }
  }

  function _showResult() {
    const w = gameState.winner;
    if (w === -1) {
      // 引き分け
      document.getElementById('result-title').textContent = '🤝 引き分け';
      document.getElementById('result-sub').textContent   = '両方のたいしょうが動けなくなりました';
    } else {
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
    }
    document.getElementById('result-overlay').classList.add('show');
  }

  function _flashErr(id, msg) {
    const el = document.getElementById(id);
    el.placeholder = msg; el.classList.add('input-error');
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