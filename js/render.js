const Render = (() => {

  let canvas, ctx, W, H;

  function init(el) {
    canvas = el;
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    const { COLS, ROWS, CELL, PAD } = CFG;
    W = COLS * CELL + PAD * 2;
    H = ROWS * CELL + PAD * 2;
    canvas.width  = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    fitCanvas();
  }

  function fitCanvas() {
    const { COLS, ROWS, CELL, PAD } = CFG;
    const rawW = COLS * CELL + PAD * 2;
    const rawH = ROWS * CELL + PAD * 2;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isDesktop = vw >= 768;
    let maxW, maxH;
    if (isDesktop) {
      maxW = Math.min(vw * 0.5, 480);
      maxH = Math.min(vh - 160, 600);
    } else {
      maxW = vw - 24;
      maxH = vh * 0.48;
    }
    const scale = Math.min(maxW / rawW, maxH / rawH, 1);
    canvas.style.width  = (rawW * scale) + 'px';
    canvas.style.height = (rawH * scale) + 'px';
  }

  // 内部座標 → Canvas座標
  // myIndex=1(後手)の場合、盤を上下反転して表示
  function _toDisplay(col, row, myIndex) {
    const { COLS, ROWS } = CFG;
    if (myIndex === 1) {
      return { dc: COLS - 1 - col, dr: ROWS - 1 - row };
    }
    return { dc: col, dr: row };
  }

  function cellCenter(col, row, myIndex) {
    const { dc, dr } = _toDisplay(col, row, myIndex);
    return {
      x: CFG.PAD + dc * CFG.CELL + CFG.CELL / 2,
      y: CFG.PAD + dr * CFG.CELL + CFG.CELL / 2,
    };
  }

  // Canvas座標 → 内部座標
  function hitCell(cx, cy, myIndex) {
    const { PAD, CELL, COLS, ROWS } = CFG;
    let dc = Math.floor((cx - PAD) / CELL);
    let dr = Math.floor((cy - PAD) / CELL);
    if (dc < 0 || dc >= COLS || dr < 0 || dr >= ROWS) return null;
    if (myIndex === 1) {
      dc = COLS - 1 - dc;
      dr = ROWS - 1 - dr;
    }
    return { col: dc, row: dr };
  }

  function draw(state, myIndex, ui) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    _drawBg();
    if (ui.highlightCells) _drawHighlights(ui.highlightCells, myIndex);
    if (ui.placeCells)     _drawPlaceHighlights(ui.placeCells, myIndex);
    if (ui.lastActionCell) _drawLastActionHighlight(ui.lastActionCell, myIndex);
    _drawPieces(state, myIndex, ui);
  }

  function _drawBg() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   '#fff0f8');
    grad.addColorStop(0.5, '#f5faff');
    grad.addColorStop(1,   '#fff0f8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  function _drawLastActionHighlight(cell, myIndex) {
    const { CELL } = CFG;
    const { x, y } = cellCenter(cell.col, cell.row, myIndex);
    const m = 2;
    // 黄色の強調リング
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth   = 3.5;
    ctx.setLineDash([6, 3]);
    _roundRect(x - CELL/2 + m, y - CELL/2 + m, CELL - m*2, CELL - m*2, 10);
    ctx.stroke();
    ctx.setLineDash([]);
    // 薄い黄色背景
    ctx.fillStyle = 'rgba(255,209,102,0.18)';
    _roundRect(x - CELL/2 + m, y - CELL/2 + m, CELL - m*2, CELL - m*2, 10);
    ctx.fill();
  }

  function _drawHighlights(cells, myIndex) {
    const { CELL } = CFG;
    const color  = myIndex === 1 ? CFG.HIGHLIGHT_GOTE : CFG.HIGHLIGHT_SENTE;
    const border = myIndex === 1 ? CFG.HL_BORDER_GOTE : CFG.HL_BORDER_SENTE;
    for (const { col, row } of cells) {
      const { x, y } = cellCenter(col, row, myIndex);
      const m = 4;
      ctx.fillStyle = color;
      _roundRect(x - CELL/2 + m, y - CELL/2 + m, CELL-m*2, CELL-m*2, 8); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = 1.5;
      _roundRect(x - CELL/2 + m, y - CELL/2 + m, CELL-m*2, CELL-m*2, 8); ctx.stroke();
      ctx.fillStyle = border;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
    }
  }

  function _drawPlaceHighlights(cells, myIndex) {
    const { CELL } = CFG;
    const color  = myIndex === 1 ? 'rgba(91,200,245,0.12)' : 'rgba(255,107,157,0.12)';
    const border = myIndex === 1 ? 'rgba(91,200,245,0.45)' : 'rgba(255,107,157,0.45)';
    for (const { col, row } of cells) {
      const { x, y } = cellCenter(col, row, myIndex);
      const m = 4;
      ctx.fillStyle = color;
      _roundRect(x - CELL/2 + m, y - CELL/2 + m, CELL-m*2, CELL-m*2, 8); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.setLineDash([4,3]);
      _roundRect(x - CELL/2 + m, y - CELL/2 + m, CELL-m*2, CELL-m*2, 8); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function _drawPieces(state, myIndex, ui) {
    for (let i = 0; i < 2; i++) {
      const p    = state.players[i];
      const isMe = i === myIndex || myIndex === -1 && i === 0;
      // 自分の駒 = 正立、相手の駒 = 180度反転
      const flip = (myIndex === -1) ? (i === 1) : (i !== myIndex);

      _drawPiece(
        p.boss.col, p.boss.row, myIndex,
        CFG.PIECES[0],
        i === 0 ? CFG.COLOR_SENTE : CFG.COLOR_GOTE,
        i === 0 ? CFG.GLOW_SENTE  : CFG.GLOW_GOTE,
        flip,
        state.turn === i && !state.over,
        ui.selectedPiece && ui.selectedPiece.type === 'boss' && ui.selectedPiece.pIdx === i,
        true
      );

      for (const f of p.field) {
        _drawPiece(
          f.col, f.row, myIndex,
          f,
          i === 0 ? CFG.COLOR_SENTE : CFG.COLOR_GOTE,
          i === 0 ? CFG.GLOW_SENTE  : CFG.GLOW_GOTE,
          flip,
          state.turn === i && !state.over,
          ui.selectedPiece && ui.selectedPiece.type === 'field' && ui.selectedPiece.pIdx === i && ui.selectedPiece.id === f.id,
          false
        );
      }
    }
  }

  function _drawPiece(col, row, myIndex, piece, color, glow, flip, isTurn, isSelected, isBoss) {
    const { CELL } = CFG;
    const { x: cx, y: cy } = cellCenter(col, row, myIndex);
    const r = isBoss ? CELL * 0.38 : CELL * 0.3;

    ctx.save();

    if (isSelected) {
      ctx.fillStyle = color + '33';
      ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI*2); ctx.fill();
    }

    ctx.shadowColor = glow;
    ctx.shadowBlur  = isTurn ? (isBoss ? 26 : 18) : 8;

    ctx.strokeStyle = color;
    ctx.lineWidth   = isSelected ? 3 : (isBoss ? 3 : 2);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();

    const grad = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, 1, cx, cy, r);
    grad.addColorStop(0, color + 'dd');
    grad.addColorStop(1, color + '44');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI*2); ctx.fill();

    ctx.shadowBlur  = 0;
    ctx.shadowColor = 'transparent';
    const fontSize = isBoss ? Math.round(r * 1.15) : Math.round(r * 1.1);
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`;
    ctx.fillStyle = '#000000';
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(cx, cy);
    if (flip) ctx.rotate(Math.PI);
    ctx.fillText(piece.emoji, 0, 0);

    ctx.restore();
  }

  function _roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  return { init, draw, hitCell, fitCanvas, cellCenter };

})();