const Network = (() => {

  let _sb = null;
  let _ch = null;
  let _roomCode = '';
  let _myIndex  = -1;

  // コールバック
  let _onOpponentJoined = null;
  let _onGameAction     = null;
  let _onOpponentLeft   = null;
  let _onSpectateSync   = null;
  let _onSpectatorJoined = null;
  let _onForcedSpectate = null;

  function init() {
    _sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
  }

  function _genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function createRoom(name) {
    _roomCode = _genCode();
    _myIndex  = 0;
    await _connect(name);
    return _roomCode;
  }

  async function joinRoom(code, name) {
    _roomCode = code.toUpperCase().trim();
    _myIndex  = 1;
    await _connect(name);
    return _myIndex;
  }

  async function spectateRoom(code) {
    _roomCode = code.toUpperCase().trim();
    _myIndex  = -1;
    await _connect(null);
    await _ch.send({ type: 'broadcast', event: 'spectator_join', payload: {} });
  }

  async function _connect(name) {
    if (_ch) await _sb.removeChannel(_ch);
    _ch = _sb.channel(`mori:${_roomCode}`, { config: { broadcast: { self: false } } });

    _ch.on('broadcast', { event: 'player_join' }, ({ payload }) => {
      if (_myIndex === 0 && _onOpponentJoined) _onOpponentJoined(payload.name, null);
    });

    _ch.on('broadcast', { event: 'join_ack' }, ({ payload }) => {
      if (_myIndex === 1 && _onOpponentJoined) _onOpponentJoined(payload.hostName, payload.firstTurn);
    });

    _ch.on('broadcast', { event: 'room_full' }, () => {
      if (_myIndex === 1 && _onForcedSpectate) {
        _myIndex = -1;
        _onForcedSpectate();
        _ch.send({ type: 'broadcast', event: 'spectator_join', payload: {} });
      }
    });

    _ch.on('broadcast', { event: 'game_action' }, ({ payload }) => {
      if (_onGameAction) _onGameAction(payload);
    });

    _ch.on('broadcast', { event: 'player_leave' }, () => {
      if (_onOpponentLeft) _onOpponentLeft();
    });

    _ch.on('broadcast', { event: 'state_sync' }, ({ payload }) => {
      if (_myIndex === -1 && _onSpectateSync) _onSpectateSync(payload.state, payload.nameA, payload.nameB);
    });

    _ch.on('broadcast', { event: 'spectator_join' }, () => {
      if (_myIndex === 0 && _onSpectatorJoined) _onSpectatorJoined();
    });

    await new Promise((res, rej) => {
      _ch.subscribe(s => {
        if (s === 'SUBSCRIBED') res();
        if (s === 'CHANNEL_ERROR') rej(new Error('チャンネル接続失敗'));
      });
    });

    if (_myIndex === 1) {
      await _ch.send({ type: 'broadcast', event: 'player_join', payload: { name } });
    }
  }

  async function ackJoin(hostName, firstTurn) {
    await _ch.send({ type: 'broadcast', event: 'join_ack', payload: { hostName, firstTurn } });
  }

  async function sendRoomFull() {
    if (_ch) await _ch.send({ type: 'broadcast', event: 'room_full', payload: {} });
  }

  async function sendStateSync(state, nameA, nameB) {
    if (_ch) await _ch.send({ type: 'broadcast', event: 'state_sync', payload: { state, nameA, nameB } });
  }

  async function sendAction(action) {
    if (_ch) await _ch.send({ type: 'broadcast', event: 'game_action', payload: action });
  }

  async function leave() {
    if (!_ch) return;
    await _ch.send({ type: 'broadcast', event: 'player_leave', payload: {} }).catch(() => {});
    await _sb.removeChannel(_ch);
    _ch = null;
  }

  function onOpponentJoined(fn)  { _onOpponentJoined  = fn; }
  function onGameAction(fn)      { _onGameAction      = fn; }
  function onOpponentLeft(fn)    { _onOpponentLeft    = fn; }
  function onSpectateSync(fn)    { _onSpectateSync    = fn; }
  function onSpectatorJoined(fn) { _onSpectatorJoined = fn; }
  function onForcedSpectate(fn)  { _onForcedSpectate  = fn; }
  function getMyIndex()          { return _myIndex;  }
  function getRoomCode()         { return _roomCode; }

  return {
    init, createRoom, joinRoom, spectateRoom,
    ackJoin, sendRoomFull, sendStateSync, sendAction, leave,
    onOpponentJoined, onGameAction, onOpponentLeft, onSpectateSync,
    onSpectatorJoined, onForcedSpectate,
    getMyIndex, getRoomCode,
  };

})();