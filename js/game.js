const Game = (() => {

  // 盤面キー
  function pk(col, row) { return `${col},${row}`; }

  // 初期状態を生成
  function createState(nameA, nameB, firstTurn = 0) {
    const { COLS, ROWS, PIECES } = CFG;
    const midCol = Math.floor(COLS / 2);

    const p0 = {
      name: nameA,
      boss: { col: midCol, row: ROWS - 1, flip: false },
      hand: PIECES.slice(1).map(p => ({ ...p })),
      field: [],
    };
    const p1 = {
      name: nameB,
      boss: { col: midCol, row: 0, flip: true },
      hand: PIECES.slice(1).map(p => ({ ...p })),
      field: [],
    };

    return {
      players: [p0, p1],
      turn: firstTurn,
      firstTurn,
      over: false,
      winner: null,
      phase: 'play',
    };
  }

  // 盤上の全駒マップを生成（衝突判定用）
  function buildOccupied(state) {
    const map = new Map();
    for (let i = 0; i < 2; i++) {
      const p = state.players[i];
      map.set(pk(p.boss.col, p.boss.row), { pIdx: i, type: 'boss', piece: CFG.PIECES[0] });
      for (const f of p.field) {
        map.set(pk(f.col, f.row), { pIdx: i, type: 'field', piece: f });
      }
    }
    return map;
  }

  // 移動方向デルタ
  const DIRS = {
    up:    [  0, -1 ],
    down:  [  0,  1 ],
    left:  [ -1,  0 ],
    right: [  1,  0 ],
    ul:    [ -1, -1 ],
    ur:    [  1, -1 ],
    dl:    [ -1,  1 ],
    dr:    [  1,  1 ],
  };

  const ALL8          = ['up','down','left','right','ul','ur','dl','dr'];
  const ALL4_STRAIGHT = ['up','down','left','right'];
  const ALL4_DIAG     = ['ul','ur','dl','dr'];

  function inBounds(col, row) {
    return col >= 0 && col < CFG.COLS && row >= 0 && row < CFG.ROWS;
  }

  function step(col, row, dir) {
    const [dc, dr] = DIRS[dir];
    return { col: col + dc, row: row + dr };
  }

  // 合法移動先を返す
  // pieceType: 'bear' | 'wolf' | 'fox' | 'tanuki' | 'boar' | 'rabbit'
  function legalMovesForPiece(col, row, pieceType, flip, occupied, pIdx) {
    const moves = [];
    const occ = occupied;

    // bear / wolf: 8方向1マス
    if (pieceType === 'bear' || pieceType === 'wolf') {
      for (const dir of ALL8) {
        const { col: nc, row: nr } = step(col, row, dir);
        if (!inBounds(nc, nr)) continue;
        const who = occ.get(pk(nc, nr));
        if (who && who.pIdx === pIdx) continue;
        moves.push({ col: nc, row: nr });
      }
    }

    // fox: 上下左右1マス
    if (pieceType === 'fox') {
      for (const dir of ALL4_STRAIGHT) {
        const { col: nc, row: nr } = step(col, row, dir);
        if (!inBounds(nc, nr)) continue;
        const who = occ.get(pk(nc, nr));
        if (who && who.pIdx === pIdx) continue;
        moves.push({ col: nc, row: nr });
      }
    }

    // tanuki: 斜め1マス
    if (pieceType === 'tanuki') {
      for (const dir of ALL4_DIAG) {
        const { col: nc, row: nr } = step(col, row, dir);
        if (!inBounds(nc, nr)) continue;
        const who = occ.get(pk(nc, nr));
        if (who && who.pIdx === pIdx) continue;
        moves.push({ col: nc, row: nr });
      }
    }

    // boar: 上下左右スライダー（∞マス）
    if (pieceType === 'boar') {
      for (const dir of ALL4_STRAIGHT) {
        let c = col, r = row;
        while (true) {
          const { col: nc, row: nr } = step(c, r, dir);
          if (!inBounds(nc, nr)) break;
          const who = occ.get(pk(nc, nr));
          if (who) {
            if (who.pIdx !== pIdx) moves.push({ col: nc, row: nr });
            break;
          }
          moves.push({ col: nc, row: nr });
          c = nc; r = nr;
        }
      }
    }

    // rabbit: ナイト（L字、飛び越し可）
    if (pieceType === 'rabbit') {
      const knightMoves = [
        [-2,-1],[-2,1],[2,-1],[2,1],
        [-1,-2],[-1,2],[1,-2],[1,2],
      ];
      for (const [dc, dr] of knightMoves) {
        const nc = col + dc, nr = row + dr;
        if (!inBounds(nc, nr)) continue;
        const who = occ.get(pk(nc, nr));
        if (who && who.pIdx === pIdx) continue;
        moves.push({ col: nc, row: nr });
      }
    }

    return moves;
  }

  // 合法アクション一覧
  function getLegalActions(state, pIdx) {
    const p = state.players[pIdx];
    const occ = buildOccupied(state);
    const actions = [];

    // ボス移動
    const bMoves = legalMovesForPiece(p.boss.col, p.boss.row, 'bear', p.boss.flip, occ, pIdx);
    for (const m of bMoves) {
      actions.push({ type: 'move', subtype: 'boss', col: m.col, row: m.row });
    }

    // フィールド駒移動
    for (const f of p.field) {
      const fMoves = legalMovesForPiece(f.col, f.row, f.id, f.flip, occ, pIdx);
      for (const m of fMoves) {
        actions.push({ type: 'move', subtype: 'field', pieceId: f.id, col: m.col, row: m.row });
      }
    }

    // 手札から配置
    for (const h of p.hand) {
      const myPieces = [p.boss, ...p.field];
      const adjSet = new Set();
      for (const mp of myPieces) {
        for (const dir of ALL8) {
          const { col: nc, row: nr } = step(mp.col, mp.row, dir);
          if (!inBounds(nc, nr)) continue;
          if (occ.has(pk(nc, nr))) continue;
          adjSet.add(pk(nc, nr));
        }
      }
      const ep = state.players[1 - pIdx];
      for (const key of adjSet) {
        const [c, r] = key.split(',').map(Number);
        if (Math.abs(c - ep.boss.col) <= 1 && Math.abs(r - ep.boss.row) <= 1) continue;
        actions.push({ type: 'place', pieceId: h.id, col: c, row: r });
      }
    }

    // フィールド駒を手持ちに戻す
    for (const f of p.field) {
      actions.push({ type: 'return', pieceId: f.id });
    }

    return actions;
  }

  // アクション適用
  function applyAction(state, pIdx, action) {
    const next = deepClone(state);
    const p = next.players[pIdx];
    const ep = next.players[1 - pIdx];

    if (action.type === 'move') {
      if (action.subtype === 'boss') {
        _captureAt(ep, action.col, action.row);
        p.boss.col = action.col;
        p.boss.row = action.row;
      } else {
        const f = p.field.find(x => x.id === action.pieceId);
        _captureAt(ep, action.col, action.row);
        f.col = action.col;
        f.row = action.row;
      }
    }

    if (action.type === 'place') {
      const idx = p.hand.findIndex(h => h.id === action.pieceId);
      const piece = p.hand.splice(idx, 1)[0];
      piece.col = action.col;
      piece.row = action.row;
      piece.flip = pIdx === 1;
      p.field.push(piece);
    }

    if (action.type === 'return') {
      const idx = p.field.findIndex(f => f.id === action.pieceId);
      const piece = p.field.splice(idx, 1)[0];
      delete piece.col; delete piece.row; delete piece.flip;
      p.hand.push(piece);
      next.turn = 1 - pIdx;
      return next;
    }

    _checkWin(next, pIdx);
    if (!next.over) next.turn = 1 - pIdx;
    return next;
  }

  function _captureAt(enemyPlayer, col, row) {
    const idx = enemyPlayer.field.findIndex(f => f.col === col && f.row === row);
    if (idx !== -1) {
      const piece = enemyPlayer.field.splice(idx, 1)[0];
      delete piece.col; delete piece.row; delete piece.flip;
      enemyPlayer.hand.push(piece);
    }
  }

  function _checkWin(state, actorIdx) {
    const ep = state.players[1 - actorIdx];
    const occ = buildOccupied(state);
    let blocked = 0;
    for (const dir of ALL4_STRAIGHT) {
      const { col: nc, row: nr } = step(ep.boss.col, ep.boss.row, dir);
      if (!inBounds(nc, nr) || occ.has(pk(nc, nr))) blocked++;
    }
    if (blocked === 4) {
      state.over = true;
      state.winner = actorIdx;
    }
  }

  function deepClone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  return {
    createState, getLegalActions, applyAction,
    buildOccupied, legalMovesForPiece, deepClone, pk, inBounds,
  };

})();