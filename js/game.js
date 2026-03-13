const Game = (() => {

  function pk(col, row) { return `${col},${row}`; }

  function createState(nameA, nameB, firstTurn = 0) {
    const { COLS, ROWS, PIECES } = CFG;
    const midCol = Math.floor(COLS / 2);
    const midRow = Math.floor(ROWS / 2);
    return {
      players: [
        { name: nameA, boss: { col: midCol, row: midRow + 1 }, hand: PIECES.slice(1).map(p => ({ ...p })), field: [] },
        { name: nameB, boss: { col: midCol, row: midRow     }, hand: PIECES.slice(1).map(p => ({ ...p })), field: [] },
      ],
      turn: firstTurn,
      firstTurn,
      over: false,
      winner: null,
    };
  }

  function buildOccupied(state) {
    const map = new Map();
    for (let i = 0; i < 2; i++) {
      const p = state.players[i];
      map.set(pk(p.boss.col, p.boss.row), { pIdx: i, type: 'boss', piece: CFG.PIECES[0] });
      for (const f of p.field) map.set(pk(f.col, f.row), { pIdx: i, type: 'field', piece: f });
    }
    return map;
  }

  const DIRS = {
    up:[0,-1], down:[0,1], left:[-1,0], right:[1,0],
    ul:[-1,-1], ur:[1,-1], dl:[-1,1], dr:[1,1],
  };
  const ALL8          = ['up','down','left','right','ul','ur','dl','dr'];
  const ALL4_STRAIGHT = ['up','down','left','right'];
  const ALL4_DIAG     = ['ul','ur','dl','dr'];

  function inBounds(col, row) { return col >= 0 && col < CFG.COLS && row >= 0 && row < CFG.ROWS; }

  function step(col, row, dir) {
    const [dc, dr] = DIRS[dir];
    return { col: col + dc, row: row + dr };
  }

  // 指定プレイヤーの全駒座標リスト
  function getAllPieces(player) {
    return [{ col: player.boss.col, row: player.boss.row }, ...player.field.map(f => ({ col: f.col, row: f.row }))];
  }

  // BFS連結チェック
  function isConnected(pieces) {
    if (pieces.length <= 1) return true;
    const set = new Set(pieces.map(p => pk(p.col, p.row)));
    const visited = new Set();
    const queue = [pieces[0]];
    visited.add(pk(pieces[0].col, pieces[0].row));
    while (queue.length) {
      const cur = queue.shift();
      for (const dir of ALL8) {
        const nb = step(cur.col, cur.row, dir);
        const k = pk(nb.col, nb.row);
        if (set.has(k) && !visited.has(k)) { visited.add(k); queue.push(nb); }
      }
    }
    return visited.size === pieces.length;
  }

  // bounding box チェック: 全駒(+新座標)が4×4以内か
  function withinBBox(pieces) {
    if (pieces.length === 0) return true;
    const cols = pieces.map(p => p.col);
    const rows = pieces.map(p => p.row);
    return (Math.max(...cols) - Math.min(...cols) < 4) && (Math.max(...rows) - Math.min(...rows) < 4);
  }

  // いずれかの駒（自分・相手問わず）と辺/角接触しているか
  function touchesAny(col, row, occupied, excludeKey) {
    for (const dir of ALL8) {
      const nb = step(col, row, dir);
      const k = pk(nb.col, nb.row);
      if (k === excludeKey) continue;
      if (occupied.has(k)) return true;
    }
    return false;
  }

  function legalMovesForPiece(col, row, pieceType, occupied, pIdx, player) {
    const moves = [];

    // たいしょう: 自由に8方向1マス
    if (pieceType === 'bear') {
      for (const dir of ALL8) {
        const { col: nc, row: nr } = step(col, row, dir);
        if (!inBounds(nc, nr)) continue;
        const who = occupied.get(pk(nc, nr));
        if (who && who.pIdx === pIdx) continue;   // 味方マス不可
        if (who && who.type === 'boss') continue;  // 相手ボス不可
        moves.push({ col: nc, row: nr });
      }
      return moves;
    }

    // 移動後の連結チェック用: 移動元を除いた残り自駒
    const myPiecesWithout = getAllPieces(player).filter(p => !(p.col === col && p.row === row));

    const _tryAdd = (nc, nr) => {
      if (!inBounds(nc, nr)) return;
      const who = occupied.get(pk(nc, nr));
      if (who && who.pIdx === pIdx) return;       // 味方マス不可
      if (who && who.type === 'boss') return;      // 相手ボス不可（乗れない）

      // 移動後の自駒リスト
      const afterPieces = [...myPiecesWithout, { col: nc, row: nr }];

      // 連結維持チェック
      if (!isConnected(afterPieces)) return;

      // 移動後に駒と接触しているか
      const occAfter = new Map(occupied);
      occAfter.delete(pk(col, row));
      occAfter.delete(pk(nc, nr));  // 敵駒を取る場合も除く
      if (!touchesAny(nc, nr, occAfter, pk(nc, nr))) return;

      moves.push({ col: nc, row: nr });
    };

    // wolf: 8方向1マス
    if (pieceType === 'wolf') {
      for (const dir of ALL8) { const n = step(col, row, dir); _tryAdd(n.col, n.row); }
    }

    // fox: 上下左右1マス
    if (pieceType === 'fox') {
      for (const dir of ALL4_STRAIGHT) { const n = step(col, row, dir); _tryAdd(n.col, n.row); }
    }

    // tanuki: 斜め1マス
    if (pieceType === 'tanuki') {
      for (const dir of ALL4_DIAG) { const n = step(col, row, dir); _tryAdd(n.col, n.row); }
    }

    // boar: 上下左右スライダー
    if (pieceType === 'boar') {
      for (const dir of ALL4_STRAIGHT) {
        let c = col, r = row;
        while (true) {
          const { col: nc, row: nr } = step(c, r, dir);
          if (!inBounds(nc, nr)) break;
          const who = occupied.get(pk(nc, nr));
          if (who) {
            if (who.pIdx !== pIdx) _tryAdd(nc, nr); // 敵は取れる（止まる）
            break;
          }
          _tryAdd(nc, nr);
          c = nc; r = nr;
        }
      }
    }

    // rabbit: L字
    if (pieceType === 'rabbit') {
      for (const [dc, dr] of [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]]) {
        _tryAdd(col + dc, row + dr);
      }
    }

    return moves;
  }

  // ═══════════════════════════════════════════════
  // 合法アクション一覧
  // ═══════════════════════════════════════════════
  function getLegalActions(state, pIdx) {
    const p   = state.players[pIdx];
    const ep  = state.players[1 - pIdx];
    const occ = buildOccupied(state);
    const actions = [];

    // ── 移動 ──────────────────────────────────────
    // たいしょう
    for (const m of legalMovesForPiece(p.boss.col, p.boss.row, 'bear', occ, pIdx, p))
      actions.push({ type: 'move', subtype: 'boss', col: m.col, row: m.row });

    // フィールド駒
    for (const f of p.field)
      for (const m of legalMovesForPiece(f.col, f.row, f.id, occ, pIdx, p))
        actions.push({ type: 'move', subtype: 'field', pieceId: f.id, col: m.col, row: m.row });

    // ── 配置 ──────────────────────────────────────
    if (p.hand.length > 0) {
      const myPieces = getAllPieces(p);
      const epBoss   = ep.boss;

      // 候補セル: 自分の駒に辺/角接触 かつ 空き
      const adjSet = new Set();
      for (const mp of myPieces) {
        for (const dir of ALL8) {
          const { col: nc, row: nr } = step(mp.col, mp.row, dir);
          if (!inBounds(nc, nr) || occ.has(pk(nc, nr))) continue;
          adjSet.add(pk(nc, nr));
        }
      }

      for (const key of adjSet) {
        const [c, r] = key.split(',').map(Number);

        // 相手たいしょうの辺4マスには置けない
        const dC = Math.abs(c - epBoss.col);
        const dR = Math.abs(r - epBoss.row);
        if ((dC === 0 && dR === 1) || (dC === 1 && dR === 0)) continue;

        // 4×4 bounding box 制約
        const afterPieces = [...myPieces, { col: c, row: r }];
        if (!withinBBox(afterPieces)) continue;

        for (const h of p.hand)
          actions.push({ type: 'place', pieceId: h.id, col: c, row: r });
      }
    }

    // ── 戻す ──────────────────────────────────────
    // 戻した後も残り全駒が連結である場合のみ
    for (const f of p.field) {
      const after = getAllPieces(p).filter(q => !(q.col === f.col && q.row === f.row));
      if (isConnected(after))
        actions.push({ type: 'return', pieceId: f.id });
    }

    return actions;
  }

  // ═══════════════════════════════════════════════
  // アクション適用
  // ═══════════════════════════════════════════════
  function applyAction(state, pIdx, action) {
    const next = deepClone(state);
    const p  = next.players[pIdx];
    const ep = next.players[1 - pIdx];

    if (action.type === 'move') {
      if (action.subtype === 'boss') {
        _captureAt(ep, action.col, action.row);
        p.boss.col = action.col; p.boss.row = action.row;
      } else {
        const f = p.field.find(x => x.id === action.pieceId);
        _captureAt(ep, action.col, action.row);
        f.col = action.col; f.row = action.row;
      }
    }

    if (action.type === 'place') {
      const idx = p.hand.findIndex(h => h.id === action.pieceId);
      const piece = p.hand.splice(idx, 1)[0];
      piece.col = action.col; piece.row = action.row;
      p.field.push(piece);
    }

    if (action.type === 'return') {
      const idx = p.field.findIndex(f => f.id === action.pieceId);
      const piece = p.field.splice(idx, 1)[0];
      delete piece.col; delete piece.row;
      p.hand.push(piece);
      next.turn = 1 - pIdx;
      return next;
    }

    _checkWin(next, pIdx);
    if (!next.over) {
      _autoCenterAll(next);
      next.turn = 1 - pIdx;
    }
    return next;
  }

  // 全駒のbounding boxを計算して盤面中央に収まるようシフトする
  function _autoCenterAll(state) {
    const { COLS, ROWS } = CFG;
    // 全駒の座標を収集
    const allPieces = [];
    for (const p of state.players) {
      allPieces.push({ col: p.boss.col, row: p.boss.row });
      for (const f of p.field) allPieces.push({ col: f.col, row: f.row });
    }
    if (allPieces.length === 0) return;

    const minC = Math.min(...allPieces.map(p => p.col));
    const maxC = Math.max(...allPieces.map(p => p.col));
    const minR = Math.min(...allPieces.map(p => p.row));
    const maxR = Math.max(...allPieces.map(p => p.row));

    // 現在の中心
    const centerC = (minC + maxC) / 2;
    const centerR = (minR + maxR) / 2;

    // 目標は盤面中央
    const targetC = (COLS - 1) / 2;
    const targetR = (ROWS - 1) / 2;

    // 整数シフト量
    const dc = Math.round(targetC - centerC);
    const dr = Math.round(targetR - centerR);

    if (dc === 0 && dr === 0) return;

    // 全駒をシフト
    for (const piece of allPieces) {
      const nc = piece.col + dc;
      const nr = piece.row + dr;
      if (!inBounds(nc, nr)) return; // はみ出す場合はシフトしない
    }

    // 実際にシフト
    for (const p of state.players) {
      p.boss.col += dc; p.boss.row += dr;
      for (const f of p.field) { f.col += dc; f.row += dr; }
    }
  }

  function _captureAt(enemyPlayer, col, row) {
    const idx = enemyPlayer.field.findIndex(f => f.col === col && f.row === row);
    if (idx !== -1) {
      const piece = enemyPlayer.field.splice(idx, 1)[0];
      delete piece.col; delete piece.row;
      enemyPlayer.hand.push(piece);
    }
  }

  // 勝利条件: いずれかのたいしょうの上下左右4マスがすべて埋まった
  function _checkWin(state, actorIdx) {
    const occ = buildOccupied(state);
    for (let victim = 0; victim < 2; victim++) {
      const ep = state.players[victim];
      let blocked = 0;
      for (const dir of ALL4_STRAIGHT) {
        const { col: nc, row: nr } = step(ep.boss.col, ep.boss.row, dir);
        if (!inBounds(nc, nr) || occ.has(pk(nc, nr))) blocked++;
      }
      if (blocked === 4) {
        state.over   = true;
        state.winner = 1 - victim; // 囲まれた側の相手が勝者
        return;
      }
    }
  }

  function deepClone(state) { return JSON.parse(JSON.stringify(state)); }

  return {
    createState, getLegalActions, applyAction,
    buildOccupied, legalMovesForPiece, getAllPieces, isConnected, withinBBox,
    deepClone, pk, inBounds, step,
  };

})();