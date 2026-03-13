const CFG = Object.freeze({

  // Supabase
  SUPABASE_URL : "https://tpkeypzlbckjjkeepwkt.supabase.co",
  SUPABASE_KEY : "sb_publishable_2_L2UyBcEZ9RarUN89OORw_j2fbVteP",

  // 盤面
  COLS : 5,
  ROWS : 5,

  // Canvas描画
  CELL : 80,
  PAD  : 16,

  // カラーパレット
  COLOR_SENTE      : "#ff8c69",
  COLOR_GOTE       : "#5bc8f5",
  GLOW_SENTE       : "rgba(255,140,105,0.5)",
  GLOW_GOTE        : "rgba(91,200,245,0.5)",
  HIGHLIGHT_SENTE  : "rgba(255,140,105,0.22)",
  HIGHLIGHT_GOTE   : "rgba(91,200,245,0.22)",
  HL_BORDER_SENTE  : "rgba(255,140,105,0.7)",
  HL_BORDER_GOTE   : "rgba(91,200,245,0.7)",
  BG_CANVAS        : "#f0f9ff",

  // 駒の種類
  PIECES : [
    { id: "bear",   name: "たいしょう", emoji: "🐻" },
    { id: "wolf",   name: "おおかみ",   emoji: "🐺" },
    { id: "fox",    name: "きつね",     emoji: "🦊" },
    { id: "tanuki", name: "たぬき",     emoji: "🦝" },
    { id: "boar",   name: "いのしし",   emoji: "🐗" },
    { id: "rabbit", name: "うさぎ",     emoji: "🐰" },
  ],
});