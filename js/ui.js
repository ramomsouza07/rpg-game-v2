/* ===========================================================
   GAME UI + NETWORK LAYER
   =========================================================== */

var ws     = null;
var myId   = null;   /* my connection id */
var myChar = null;   /* my character data (client-side copy) */
var inCb   = false;  /* are we in combat? */
var myTk   = false;  /* is it my turn? */
var rLoc   = 'Vila Pacifica'; /* current room location */

/* ---- helpers ---- */
function $(id) { return document.getElementById(id); }
function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }
function screen(id) { document.querySelectorAll('.screen').forEach(function(s){s.classList.remove('active');}); $(id).classList.add('active'); }
function diceAnim(t) { $('dice-result').textContent = t || '\u{1F3B2}'; $('dice-overlay').classList.remove('hidden'); setTimeout(function(){$('dice-overlay').classList.add('hidden');}, 800); }
function txt(id,v) { var e=$(id); if(e) e.textContent=v; }

/* ---- Logging ---- */
var gameLog = []; /* persistent log history */

function elog(msg, type) {
  var e = $('exp-log'); if(!e) return;
  var d = document.createElement('div');
  d.className = 'll ' + (type||'');
  d.textContent = msg;
  e.appendChild(d);
  e.scrollTop = e.scrollHeight;
  /* save to history */
  gameLog.push({msg: msg, type: type||''});
  if (gameLog.length > 200) gameLog.shift();
  renderLogHist();
}

function renderLogHist() {
  var el = $('log-hist');
  if (!el) return;
  el.innerHTML = '';
  var show = gameLog.slice(-50);
  for (var i=0; i<show.length; i++) {
    var entry = show[i];
    var d = document.createElement('div');
    d.className = 'lh-item lh-' + (entry.type || 'info');
    d.textContent = entry.msg;
    el.appendChild(d);
  }
  el.scrollTop = el.scrollHeight;
}

function clog(msg, type) {
  var e = $('cb-log'); if(!e) return;
  var d = document.createElement('div');
  d.className = 'll ' + (type||'');
  d.textContent = msg;
  e.appendChild(d);
  e.scrollTop = e.scrollHeight;
}

/* ---- Chat ---- */
function chatMsg(name, text) {
  for (var i=0;i<2;i++) {
    var id = i===0 ? 'clog-exp' : 'clog-cb';
    var e = $(id);
    if (e && e.offsetParent !== null) {
      var d = document.createElement('div');
      d.className = 'cl';
      d.innerHTML = '<span class="cn">' + esc(name) + ':</span> ' + esc(text);
      e.appendChild(d); e.scrollTop = e.scrollHeight;
      return;
    }
  }
}

function esc(s) { var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

function sendChat() {
  if (!ws || ws.readyState !== 1) return;
  var inp = $('cinp-exp');
  if (inp && inp.offsetParent !== null && inp.value.trim()) {
    ws.send(JSON.stringify({type:'chat', text: inp.value.trim()}));
    inp.value = ''; return;
  }
  inp = $('cinp-cb');
  if (inp && inp.offsetParent !== null && inp.value.trim()) {
    ws.send(JSON.stringify({type:'chat', text: inp.value.trim()}));
    inp.value = '';
  }
}

/* ===========================================================
   LOBBY
   =========================================================== */

function doConnect() {
  var name = $('inp-name').value.trim();
  if (!name) { $('err-conn').textContent = 'Digite seu nome!'; return; }
  $('err-conn').textContent = '';

  var st = $('conn-st');
  st.textContent = 'Conectando...';
  st.className = 'st connecting';

  if (ws && ws.readyState < 2) { ws.onclose = null; ws.close(); ws = null; }

  var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  ws = new WebSocket(proto + location.host);

  ws.onopen = function() {
    ws.send(JSON.stringify({type: 'join', name: name}));
  };
  ws.onerror = function() {
    st.textContent = 'Erro na conexao';
    st.className = 'st error';
  };
  ws.onclose = function() {
    st.textContent = 'Desconectado';
    st.className = 'st disconnected';
  };
  ws.onmessage = function(ev) {
    var msg; try { msg = JSON.parse(ev.data); } catch(e) { return; }
    onMsg(msg);
  };
}

function showLobby2() {
  hide('step1');
  show('step2');
  $('welcome').textContent = $('inp-name').value;
  refreshRooms();
}

function refreshRooms() {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({type:'list_rooms'}));
}

function renderRoomList(list) {
  var el = $('ll-rooms');
  el.innerHTML = '';
  if (!list || !list.length) { el.innerHTML = '<div class="empty">Nenhuma sala disponivel.</div>'; return; }
  for (var i=0; i<list.length; i++) {
    var r = list[i];
    var d = document.createElement('div');
    d.className = 'room-item';
    d.innerHTML = '<div><div class="rm-name">' + esc(r.name || 'Sala '+r.id) + '</div>' +
      '<div class="rm-meta">' + r.players + '/' + r.max + ' jogadores \u00b7 ' + esc(r.location||'') + '</div></div>' +
      '<button class="btn-sm">Entrar</button>';
    d.querySelector('button').onclick = (function(rid){
      return function() {
        var payload = {type:'join_room', roomId: rid};
        if (myChar) payload.character = myChar;
        ws.send(JSON.stringify(payload));
      };
    })(r.id);
    el.appendChild(d);
  }
}

/* ===========================================================
   NETWORK MESSAGE HANDLER
   =========================================================== */

function onMsg(m) {
  switch (m.type) {

    case 'joined':
      myId = m.id;
      var st = $('conn-st');
      st.textContent = 'Conectado!';
      st.className = 'st connected';
      showLobby2();
      break;

    case 'room_list':
      renderRoomList(m.rooms || []);
      break;

    case 'room_created':
      screen('scr-char');
      CC.init();
      break;

    case 'room_state':
    case 'room_joined':
      if (m.room) {
        rLoc = m.room.location || 'Vila Pacifica';
      }
      if (m.players) renderSidebar(m.players);
      if (m.type === 'room_state' && m.combat) {
        inCb = true;
        showCombatScreen(m.combat);
      }
      if (m.type === 'room_state' && !m.combat && myChar) {
        inCb = false;
        showExploreScreen();
      }
      /* sync my character data from server (gold, xp, inventory, hp, level) */
      if (m.players) {
        for (var i = 0; i < m.players.length; i++) {
          var p = m.players[i];
          if (p.char && p.name === myChar.name) {
            myChar.hp = Math.max(p.char.hp || 0, 0);
            myChar.maxHp = p.char.maxHp || myChar.maxHp;
            myChar.gold = p.char.gold || 0;
            myChar.xp = p.char.xp || 0;
            myChar.level = p.char.level || 1;
            if (p.char.inventory) myChar.inventory = p.char.inventory;
            redrawTopBar();
          }
        }
      }
      break;

    case 'chat':
      chatMsg(m.name, m.text);
      break;

    case 'player_joined':
      elog(m.name + ' entrou no grupo.', 'info');
      break;

    case 'player_left':
      elog(m.name + ' saiu do grupo.', 'info');
      break;

    case 'rest':
      (m.log||[]).forEach(function(t){ elog(t, 'heal'); });
      break;

    case 'travel':
      rLoc = m.location;
      txt('tb-loc', rLoc);
      setScene(rLoc);
      elog('Grupo viajou para ' + rLoc + '.', 'info');
      break;

    case 'char_update':
      if (myChar) {
        myChar.hp = Math.max(m.hp || 0, 0);
        myChar.maxHp = m.maxHp || myChar.maxHp;
        myChar.gold = m.gold || 0;
        myChar.xp = m.xp || 0;
        myChar.level = m.level || 1;
        if (m.inventory) myChar.inventory = m.inventory;
        redrawTopBar();
        /* update explore buttons since inventory changed */
        if (!inCb) renderExploreBtns();
      }
      break;

    case 'combat_started':
      inCb = true;
      elog('Inimigos apareceram!', 'dmg');
      if (m.combat) showCombatScreen(m.combat);
      break;

    case 'combat_update':
      if (m.combat) redrawCombat(m.combat);
      /* sync my char copy */
      syncMyChar(m.combat);
      break;

    case 'your_turn':
      if (m.cid === myId) {
        myTk = true;
        enableCombatBtns();
        $('turn-ind').textContent = '\u25b6 SEU TURNO';
        $('turn-ind').className = 'yours';
      }
      break;

    case 'enemy_turn':
      myTk = false;
      disableCombatBtns();
      $('turn-ind').textContent = 'Turno do inimigo...';
      $('turn-ind').className = 'waiting';
      break;

    case 'error':
      alert(m.msg);
      break;
  }
}

/* ===========================================================
   EXPLORE SCREEN
   =========================================================== */

function showExploreScreen() {
  inCb = false; myTk = false;
  screen('scr-explore');
  redrawTopBar();
  setScene(rLoc);
  txt('tb-loc', rLoc);
  renderExploreBtns();
  /* clear log but keep it visible */
  if ($('exp-log')) $('exp-log').innerHTML = '';
  elog('Voce esta em ' + rLoc + '.', 'info');
}

function redrawTopBar() {
  if (!myChar) return;
  txt('tb-name', myChar.name);
  txt('tb-info', myChar.raceName + ' ' + myChar.className + ' Nv.' + myChar.level);
  txt('tb-hp', 'HP: ' + myChar.hp + '/' + myChar.maxHp);
  txt('tb-gold', 'Ouro: ' + myChar.gold);
  txt('tb-xp', 'XP: ' + (myChar.xp||0));
}

function renderExploreBtns() {
  var bar = $('exp-acts'); bar.innerHTML = '';
  var acts = [
    {label: 'Explorar', act: 'explore'},
    {label: 'Descansar', act: 'rest'},
    {label: 'Viajar',   act: 'travel'}
  ];
  for (var i=0; i<acts.length; i++) {
    (function(a) {
      var b = document.createElement('button');
      b.className = 'act-btn';
      b.textContent = a.label;
      b.onclick = function() {
        if (a.act === 'explore') {
          ws.send(JSON.stringify({type:'explore'}));
          elog('Explorando a area...', 'info');
        } else if (a.act === 'rest') {
          ws.send(JSON.stringify({type:'rest'}));
        } else {
          doTravel();
        }
      };
      bar.appendChild(b);
    })(acts[i]);
  }
}

function doTravel() {
  var locs = [
    'Vila Pacifica',
    'Floresta Sombria',
    'Masmorra Antiga',
    'Montanha Gelada',
    'Pantano Verde'
  ];
  var ans = prompt('Para onde deseja viajar?\n\n' +
    '1. Vila Pacifica\n' +
    '2. Floresta Sombria\n' +
    '3. Masmorra Antiga\n' +
    '4. Montanha Gelada\n' +
    '5. Pantano Verde\n\n' +
    'Digite o numero:');
  var idx = parseInt(ans) - 1;
  if (idx >= 0 && idx < locs.length && ws && ws.readyState === 1) {
    ws.send(JSON.stringify({type:'travel', location: locs[idx]}));
  }
}

function renderSidebar(players) {
  var el = $('sb-players');
  if (!el) return;
  el.innerHTML = '';
  for (var i=0; i<players.length; i++) {
    var p = players[i];
    var c = p.char;
    if (!c || !c.name) continue;
    var pct = c.maxHp > 0 ? Math.round(100 * c.hp / c.maxHp) : 0;
    var cls = CLASSES[c.classKey];
    var hc = pct > 60 ? '' : pct > 30 ? 'low' : 'crit';
    var d = document.createElement('div');
    d.className = 'sp';
    d.innerHTML = '<div class="sp-avatar">' + c.name.charAt(0).toUpperCase() + '</div>' +
      '<div class="sp-info">' +
        '<div class="sp-name">' + esc(c.name) + '</div>' +
        '<div class="sp-detl">' + (cls?cls.icon:'') + ' ' + esc(c.raceName||'') + ' ' + esc(c.className||'') + ' Nv.' + (c.level||1) + '</div>' +
        '<div class="shp"><div class="shp-fill ' + hc + '" style="width:' + pct + '%"></div></div>' +
      '</div>';
    el.appendChild(d);
  }
}

/* ===========================================================
   COMBAT SCREEN
   =========================================================== */

function showCombatScreen(data) {
  inCb = true; myTk = false;
  screen('scr-combat');
  $('cb-log').innerHTML = '';
  redrawCombat(data);
  disableCombatBtns();
  /* show combat log from server data */
  if (data && data.log) {
    for (var i=0; i<data.log.length; i++) {
      var e = data.log[i];
      clog(e.msg, e.type || 'info');
    }
  }
}

function redrawCombat(data) {
  if (!data) return;

  /* sides */
  var sp = $('cv-players'); sp.innerHTML = '<h4>Jogadores</h4>';
  var se = $('cv-enemies'); se.innerHTML = '<h4>Inimigos</h4>';
  var turnName = data.turnName || '';

  if (data.order) {
    for (var i=0; i<data.order.length; i++) {
      var u = data.order[i];
      if (!u.isP && u.hp <= 0) continue; /* hide dead enemies */
      var pct = u.maxHp > 0 ? Math.round(100 * u.hp / u.maxHp) : 0;
      var hc = pct > 60 ? '' : pct > 30 ? 'low' : 'crit';
      var onTurn = u.name === turnName;
      var d = document.createElement('div');
      d.className = 'cu' + (u.isP ? '' : ' enmy') + (onTurn ? ' turn-on' : '');
      var ico = u.isP ? '\u{1F9D1}' : (ENEMY_ICONS[u.name] || '\u{1F479}');
      d.innerHTML = '<div class="cu-ico">' + ico + '</div>' +
        '<div class="cu-info">' +
          '<div class="cu-nm">' + esc(u.name) + '</div>' +
          '<div class="cu-hp">' + Math.max(u.hp,0) + '/' + u.maxHp + '</div>' +
          '<div class="hp"><div class="hp-f ' + hc + '" style="width:' + pct + '%"></div></div>' +
        '</div>';
      (u.isP ? sp : se).appendChild(d);
    }
  }

  /* sidebar */
  renderCombatSidebar(data.ps || []);
  /* sync my char */
  syncMyChar(data);
}

function renderCombatSidebar(ps) {
  var el = $('sb-cb-players');
  if (!el) return;
  el.innerHTML = '';
  for (var i=0; i<ps.length; i++) {
    var p = ps[i];
    var pct = p.maxHp > 0 ? Math.round(100 * p.hp / p.maxHp) : 0;
    var hc = pct > 60 ? '' : pct > 30 ? 'low' : 'crit';
    var cls = CLASSES[p.cls] || CLASSES.guerreiro;
    var d = document.createElement('div');
    d.className = 'sp';
    d.innerHTML = '<div class="sp-avatar">' + (p.name||'?').charAt(0).toUpperCase() + '</div>' +
      '<div class="sp-info">' +
        '<div class="sp-name">' + esc(p.name) + '</div>' +
        '<div class="sp-detl">' + (cls.icon||'') + ' ' + esc(cls.name||'') + '</div>' +
        '<div class="shp"><div class="shp-fill ' + hc + '" style="width:' + pct + '%"></div></div>' +
      '</div>';
    el.appendChild(d);
  }
}

function syncMyChar(data) {
  if (!myChar || !data) return;
  if (data.ps) {
    for (var i=0; i<data.ps.length; i++) {
      var p = data.ps[i];
      if (p.name === myChar.name) {
        myChar.hp = Math.max(p.hp, 0);
        myChar.maxHp = p.maxHp;
        if (p.cls) myChar.classKey = p.cls;
      }
    }
  }
  redrawTopBar();
}

function enableCombatBtns() {
  myTk = true;
  var bar = $('cb-acts');
  bar.innerHTML = '';

  var acts = [
    {t:'roll_attack', l:'\u{1F3B2} Rolar d20 + Atacar'},
    {t:'defend',      l:'\u{1F6E1} Defender'},
    {t:'flee',        l:'\u{1F3C3} Fugir'}
  ];
  if (myChar && (myChar.classKey === 'mago' || myChar.classKey === 'clerigo')) {
    acts.push({t:'spell', l:'\u2728 Magia'});
  }
  if (myChar && myChar.inventory && myChar.inventory.indexOf('Pocao') >= 0) {
    acts.push({t:'potion', l:'\u{1F9EA} Pocao'});
  }

  for (var i=0; i<acts.length; i++) {
    (function(a) {
      var b = document.createElement('button');
      b.className = 'act-btn active';
      b.textContent = a.l;
      b.onclick = function() {
        if (!myTk) return;
        myTk = false;
        /* disable all buttons */
        bar.querySelectorAll('.act-btn').forEach(function(bb){
          bb.disabled = true;
          bb.classList.remove('active');
        });
        /* dice animation for attacks/spells */
        if (a.t === 'roll_attack' || a.t === 'spell') {
          diceAnim();
        }
        ws.send(JSON.stringify({
          type: 'combat_action',
          action: { type: a.t, target: 0 }
        }));
      };
      bar.appendChild(b);
    })(acts[i]);
  }
}

function disableCombatBtns() {
  myTk = false;
  var bar = $('cb-acts');
  if (bar) {
    bar.querySelectorAll('.act-btn').forEach(function(b){
      b.disabled = true;
      b.classList.remove('active');
    });
  }
}

/* ===========================================================
   SCENES
   =========================================================== */
var LOC_MAP = {
  'Floresta Sombria': 'forest',
  'Masmorra Antiga':  'dungeon',
  'Vila Pacifica':    'village',
  'Montanha Gelada':  'mountain',
  'Pantano Verde':    'swamp'
};

function setScene(loc) {
  var bg = $('scene-bg'); if (!bg) return;
  var t = LOC_MAP[loc] || 'village';
  bg.className = 'scene-bg scene-' + t;
  bg.innerHTML = sceneHTML(t);
}

function sceneHTML(t) {
  if (t === 'forest')
    return '<div class="moon"></div>' +
      '<div class="tree t1"></div><div class="tree t2"></div><div class="tree t3"></div>' +
      '<div class="ff f1"></div><div class="ff f2"></div><div class="ff f3"></div>';
  return '';
}

/* ===========================================================
   INIT
   =========================================================== */
document.addEventListener('DOMContentLoaded', function() {
  /* Lobby */
  $('btn-conn').onclick = doConnect;
  $('inp-name').onkeydown = function(e) { if (e.key === 'Enter') doConnect(); };

  $('btn-mkroom').onclick = function() {
    var n = $('inp-room').value.trim() || 'Minha Sala';
    ws.send(JSON.stringify({type:'create_room', name:n}));
  };

  $('btn-refresh').onclick = refreshRooms;

  /* Chat */
  $('cinp-exp').onkeydown = function(e) { if (e.key === 'Enter') sendChat(); };
  $('cinp-cb').onkeydown  = function(e) { if (e.key === 'Enter') sendChat(); };
  $('cbtn-exp').onclick = sendChat;
  $('cbtn-cb').onclick  = sendChat;

  /* Char creation init */
  CC.init();

  $('btn-roll').onclick = function() {
    CC.base = {for:8,des:8,con:8,int:8,sab:8,car:8};
    CC.pts = 27;
    var keys = ['for','des','con','int','sab','car'];
    /* Round-robin random distribution */
    while (CC.pts > 0) {
      var shuffled = keys.slice().sort(function(){return Math.random()-0.5;});
      var did = false;
      for (var i=0; i<shuffled.length; i++) {
        var k = shuffled[i];
        if (CC.base[k] >= 15) continue;
        var cost = CC._cost(CC.base[k]);
        if (cost <= CC.pts) {
          CC.base[k]++;
          CC.pts -= cost;
          did = true;
        }
      }
      if (!did) break;
    }
    CC._refresh();
  };

  $('cc-play').onclick = function() {
    var nm = $('inp-cname').value.trim();
    if (!nm) { $('err-cname').textContent = 'Digite o nome do personagem!'; return; }
    if (!CC.race || !CC.cls) { $('err-cname').textContent = 'Escolha raca e classe!'; return; }
    $('err-cname').textContent = '';
    myChar = CC.build(nm);
    ws.send(JSON.stringify({type:'set_character', character:myChar}));
    showExploreScreen();
  };

  /* Restart */
  $('btn-restart').onclick = function() {
    myChar = null; inCb = false; myTk = false;
    CC.init();
    hide('step2'); show('step1');
    screen('scr-lobby');
  };
});
