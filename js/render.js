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
      maxW = Math.min(vw * 0.55, 520);
      maxH = Math.min(vh - 160, 700);
    } else {
      maxW = vw - 32;
      maxH = vh * 0.52;
    }
    const scale = Math.min(maxW / rawW, maxH / rawH, 1);
    canvas.style.width  = (rawW * scale) + 'px';
    canvas.style.height = (rawH * scale) + 'px';
  }

  function cellCenter(col, row) {
    return {
      x: CFG.PAD + col * CFG.CELL + CFG.CELL / 2,
      y: CFG.PAD + row * CFG.CELL + CFG.CELL / 2,
    };
  }

  function hitCell(cx, cy) {
    const { PAD, CELL, COLS, ROWS } = CFG;
    const col = Math.floor((cx - PAD) / CELL);
    const row = Math.floor((cy - PAD) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  function draw(state, myIndex, ui) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    _drawBg();
    if (ui.highlightCells) _drawHighlights(ui.highlightCells, myIndex);
    if (ui.placeCells)     _drawPlaceHighlights(ui.placeCells, myIndex);
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

  function _drawHighlights(cells, myIndex) {
    const { CELL, PAD } = CFG;
    const color  = myIndex === 0 ? CFG.HIGHLIGHT_SENTE : CFG.HIGHLIGHT_GOTE;
    const border = myIndex === 0 ? CFG.HL_BORDER_SENTE : CFG.HL_BORDER_GOTE;
    for (const { col, row } of cells) {
      const x = PAD + col * CELL, y = PAD + row * CELL, m = 4;
      ctx.fillStyle = color;
      _roundRect(x+m, y+m, CELL-m*2, CELL-m*2, 8); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = 1.5;
      _roundRect(x+m, y+m, CELL-m*2, CELL-m*2, 8); ctx.stroke();
      ctx.fillStyle = border;
      ctx.beginPath(); ctx.arc(x+CELL/2, y+CELL/2, 4, 0, Math.PI*2); ctx.fill();
    }
  }

  function _drawPlaceHighlights(cells, myIndex) {
    const { CELL, PAD } = CFG;
    const color  = myIndex === 0 ? 'rgba(255,107,157,0.12)' : 'rgba(91,200,245,0.12)';
    const border = myIndex === 0 ? 'rgba(255,107,157,0.45)' : 'rgba(91,200,245,0.45)';
    for (const { col, row } of cells) {
      const x = PAD + col * CELL, y = PAD + row * CELL, m = 4;
      ctx.fillStyle = color;
      _roundRect(x+m, y+m, CELL-m*2, CELL-m*2, 8); ctx.fill();
      ctx.strokeStyle = border; ctx.lineWidth = 1.5; ctx.setLineDash([4,3]);
      _roundRect(x+m, y+m, CELL-m*2, CELL-m*2, 8); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function _drawPieces(state, myIndex, ui) {
    for (let i = 0; i < 2; i++) {
      const p = state.players[i];

      // ボス駒
      _drawPiece(
        p.boss.col, p.boss.row,
        CFG.PIECES[0],  // { id:'bear', emoji:'🐻', ... }
        i === 0 ? CFG.COLOR_SENTE : CFG.COLOR_GOTE,
        i === 0 ? CFG.GLOW_SENTE  : CFG.GLOW_GOTE,
        p.boss.flip,
        state.turn === i && !state.over,
        ui.selectedPiece && ui.selectedPiece.type === 'boss' && ui.selectedPiece.pIdx === i,
        true
      );

      // フィールド駒
      for (const f of p.field) {
        _drawPiece(
          f.col, f.row, f,
          i === 0 ? CFG.COLOR_SENTE : CFG.COLOR_GOTE,
          i === 0 ? CFG.GLOW_SENTE  : CFG.GLOW_GOTE,
          f.flip,
          state.turn === i && !state.over,
          ui.selectedPiece && ui.selectedPiece.type === 'field' &&
            ui.selectedPiece.pIdx === i && ui.selectedPiece.id === f.id,
          false
        );
      }
    }
  }

  function _drawPiece(col, row, piece, color, glow, flip, isTurn, isSelected, isBoss) {
    const { CELL } = CFG;
    const { x: cx, y: cy } = cellCenter(col, row);
    const r = isBoss ? CELL * 0.38 : CELL * 0.3;

    ctx.save();

    // 選択リング
    if (isSelected) {
      ctx.fillStyle = color + '33';
      ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI*2); ctx.fill();
    }

    // グロー
    ctx.shadowColor = glow;
    ctx.shadowBlur  = isTurn ? (isBoss ? 26 : 18) : 8;

    // 外リング
    ctx.strokeStyle = color;
    ctx.lineWidth   = isSelected ? 3 : (isBoss ? 3 : 2);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();

    // 塗り
    const grad = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, 1, cx, cy, r);
    grad.addColorStop(0, color + 'dd');
    grad.addColorStop(1, color + '44');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, Math.PI*2); ctx.fill();

    // 絵文字
    ctx.shadowBlur = 0;
    const fontSize = isBoss ? Math.round(r * 1.15) : Math.round(r * 1.1);
    ctx.font = `${fontSize}px serif`;
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

  return { init, draw, hitCell, fitCanvas };

})();