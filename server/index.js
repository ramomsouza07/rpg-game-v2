/* ===========================================================
   MULTIPLAYER WEBSOCKET SERVER
   =========================================================== */
var WebSocketServer = require('ws').WebSocketServer;
var http = require('http');
var fs = require('fs');
var path = require('path');

var PORT = process.env.PORT || 3000;

/* ---- static files ---- */
var MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json'
};

var srv = http.createServer(function(req, res) {
  var fp = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  fp = path.join(__dirname, '..', fp);
  var ext = path.extname(fp);
  if (!MIME[ext]) { res.writeHead(404); res.end(); return; }
  fs.readFile(fp, function(err, data) {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {'Content-Type': MIME[ext]});
    res.end(data);
  });
});

var wss = new WebSocketServer({ server: srv });

/* ---- data ---- */
var ENEMIES = [
  {name:'Goblin',     hp:7,  ac:13, atk:3, dmg:'1d6',    xp:25,  gold:'1d6+2'},
  {name:'Orc',        hp:15, ac:14, atk:5, dmg:'1d8+2',  xp:50,  gold:'2d6+5'},
  {name:'Esqueleto',  hp:13, ac:13, atk:4, dmg:'1d6+2',  xp:50,  gold:'1d10'},
  {name:'Lobo',       hp:11, ac:12, atk:3, dmg:'1d6+1',  xp:50,  gold:'0'},
  {name:'Slime',      hp:10, ac:8,  atk:2, dmg:'1d4+1',  xp:25,  gold:'1d4'},
  {name:'Bandido',    hp:16, ac:14, atk:4, dmg:'1d8+1',  xp:50,  gold:'3d6+10'},
  {name:'Ogro',       hp:30, ac:11, atk:5, dmg:'1d12+2', xp:100, gold:'4d6+5'},
  {name:'Dragao Jovem', hp:60, ac:16, atk:8, dmg:'2d8+4', xp:300, gold:'10d10+20'}
];

var LOCS = [
  {name:'Floresta Sombria', type:'forest',  chance:0.4},
  {name:'Masmorra Antiga',  type:'dungeon', chance:0.5},
  {name:'Vila Pacifica',    type:'village', chance:0.08},
  {name:'Montanha Gelada',  type:'mountain',chance:0.3},
  {name:'Pantano Verde',    type:'swamp',   chance:0.4}
];

var HIT_D = {guerreiro:10, mago:6, ladino:8, clerigo:8, ranger:10};
var PRIM  = {guerreiro:'for',  mago:'int', ladino:'des', clerigo:'sab', ranger:'des'};

/* ---- dice utils ---- */
function d(n) { return Math.floor(Math.random() * n) + 1; }
function mod(v) { return Math.floor((v - 10) / 2); }
function roll(expr) {
  var m = String(expr).match(/(\d+)?d(\d+)\s*([+-]\s*\d+)?/);
  if (!m) return 0;
  var cnt = parseInt(m[1] || '1');
  var sides = parseInt(m[2]);
  var bonus = parseInt((m[3]||'0').replace(/\s/g,''));
  var t = 0;
  for (var i=0; i<cnt; i++) t += d(sides);
  return t + bonus;
}

/* ---- state ---- */
var rooms = new Map();
var nextRm = 1;

/* ===========================================================
   ROOM CLASS
   =========================================================== */
function Room(id, name, host) {
  this.id = id;
  this.name = name;
  this.host = host;
  this.conns = [];         /* { id, ws, name, char } */
  this.loc = 'Vila Pacifica';
  this.combat = null;
  this.enemyTimer = null;
}

Room.prototype.add = function(c) { this.conns.push(c); };
Room.prototype.rm = function(ws) { this.conns = this.conns.filter(function(c){return c.ws!==ws;}); };
Room.prototype.byId = function(cid) { for(var i=0;i<this.conns.length;i++) if(this.conns[i].id===cid) return this.conns[i]; return null; };

Room.prototype.bc = function(msg, skip) {
  var s = JSON.stringify(msg);
  for (var i=0; i<this.conns.length; i++) {
    var c = this.conns[i];
    if (c.ws !== skip && c.ws.readyState === 1) c.ws.send(s);
  }
};

Room.prototype.sendState = function(ws) {
  ws.send(JSON.stringify({
    type: 'room_state',
    room: { id: this.id, name: this.name, location: this.loc },
    players: this.conns.map(function(c){ return { id:c.id, name:c.name, char:c.char }; }),
    combat: this.combat ? this.sanitizeCombat() : null
  }));
};

Room.prototype.bcastState = function() {
  for (var i=0; i<this.conns.length; i++) this.sendState(this.conns[i].ws);
};

/* ---- encounter ---- */
Room.prototype.getEncounter = function() {
  var lvl = 1;
  if (this.conns.length) {
    var s = 0;
    for (var i=0;i<this.conns.length;i++) s += (this.conns[i].char.level||1);
    lvl = Math.max(1, Math.round(s / this.conns.length));
  }
  var pool = ENEMIES.filter(function(_,i){ return i<5||i<7&&lvl>=3||lvl>=5; });
  var n = Math.min(1 + Math.floor(lvl/3), 2);
  var res = [];
  for (var i=0; i<n; i++) {
    var t = JSON.parse(JSON.stringify(pool[d(pool.length)-1]));
    t._init = d(20);
    res.push(t);
  }
  return res;
};

/* ---- combat START ---- */
Room.prototype.startCombat = function(enemyTpls) {
  var self = this;

  var players = this.conns.map(function(c) {
    return {
      cid: c.id,
      name: c.name,
      cls: c.char.classKey || 'guerreiro',
      hp: c.char.hp || 10,
      maxHp: c.char.maxHp || 10,
      ac: c.char.ac || 10,
      attr: JSON.parse(JSON.stringify(c.char.attributes||{})),
      init: d(20) + mod((c.char.attributes.des||10)),
      isP: true
    };
  });

  var enemies = enemyTpls.map(function(e, i) {
    var ehp = e.hp || 10;
    return {
      idx: i,
      name: e.name,
      hp: ehp,
      maxHp: e.maxHp || ehp,
      ac: e.ac,
      atk: e.atk,
      dmg: e.dmg,
      xp: e.xp,
      gold: e.gold,
      init: e._init || d(20),
      isP: false
    };
  });

  var all = players.concat(enemies);
  all.sort(function(a,b){ return b.init - a.init; });

  this.combat = {
    es: enemyTpls,
    order: all,
    ti: 0,
    log: [{ msg:'Combate iniciado!', type:'info' }],
    alive: true
  };

  /* signal first turn */
  setTimeout(function(){ self.signalTurn(); }, 400);
};

/* ---- turn signaling ---- */
Room.prototype.signalTurn = function() {
  if (!this.combat || !this.combat.alive) return;
  var cur = this.combat.order[this.combat.ti];
  if (!cur) return;
  if (cur.isP) {
    this.bc({ type:'your_turn', cid: cur.cid });
    this.bcastCombatUpdate();
  } else {
    this.bc({ type:'enemy_turn' });
    this.processEnemy();
  }
};

/* ---- player action ---- */
Room.prototype.act = function(cid, action) {
  if (!this.combat || !this.combat.alive) return null;
  if (this.combat.order[this.combat.ti].cid !== cid) return null;
  if (!this.combat.order[this.combat.ti].isP) return null;

  var p = this.combat.order[this.combat.ti];
  var log = '';

  if (action.type === 'roll_attack') {
    var r20 = d(20);
    var pm = mod(p.attr[PRIM[p.cls]] || 10);
    var total = r20 + pm;
    var aliveE = this.combat.es.filter(function(e){return e.hp > 0;});
    log = p.name + ' rolou d20[' + r20 + ']' + ' mod:' + (pm>=0?'+':'')+pm + ' = ' + total;

    if (aliveE.length) {
      var tgt = aliveE[action.target || 0];
      if (r20 === 1) {
        log += ' — Falha critica! Errou!';
      } else if (r20 === 20 || total >= tgt.ac) {
        var dieType = p.cls === 'mago' ? '2d6' : p.cls === 'ranger' ? '1d8' : '1d10';
        var dmg = roll(dieType) + pm;
        if (r20 === 20) {
          dmg += roll(dieType);
          log = 'CRITICO! ' + log;
        }
        tgt.hp -= Math.max(dmg, 0);
        log += ' — Acertou ' + tgt.name + ': ' + dmg + ' dano!';
      } else {
        log += ' — Errou ' + tgt.name + ' (CA ' + tgt.ac + ')';
      }
    }

  } else if (action.type === 'defend') {
    var heal = roll('1d8') + mod(p.attr.con || 10);
    p.hp = Math.min(p.hp + heal, p.maxHp);
    log = p.name + ' se defende e recupera ' + Math.max(heal,0) + ' HP.';

  } else if (action.type === 'flee') {
    var fr = d(20) + mod(p.attr.des || 10);
    if (fr >= 13) {
      log = p.name + ' fugiu do combate!';
      this.combat.log.push({msg:log, type:'info'});
      this.syncHp();
      this.combat.alive = false;
      this.cleanupCombat();
      this.bcastState();
      return {ended:true};
    } else {
      log = p.name + ' nao conseguiu fugir.';
    }

  } else if (action.type === 'spell') {
    var aKey = p.cls === 'mago' ? 'int' : 'sab';
    var sMod = mod(p.attr[aKey]||10) + 2;
    var sr = d(20);
    var sTotal = sr + sMod;
    var eAlive = this.combat.es.filter(function(e){return e.hp>0;});
    if (!eAlive.length) {
      log = 'Sem alvos vivos.';
    } else if (sr === 1) {
      log = p.name + ': magia falhou (d20: 1)!';
    } else if (sr === 20 || sTotal >= eAlive[0].ac + 1) {
      var sDmg = roll('2d8') + sMod;
      eAlive[0].hp -= Math.max(sDmg, 0);
      log = p.name + ' lanca magia em ' + eAlive[0].name + ': ' + sDmg + ' dano!';
    } else {
      log = p.name + ': magia falhou (d20: ' + sr + ', total: ' + sTotal + ')!';
    }

  } else if (action.type === 'potion') {
    var conn = this.byId(cid);
    var inv = conn && conn.char && conn.char.inventory;
    if (inv && inv.indexOf('Pocao') >= 0) {
      inv.splice(inv.indexOf('Pocao'), 1);
      var pHeal = roll('4d4+4');
      p.hp = Math.min(p.hp + pHeal, p.maxHp);
      log = p.name + ' usa Pocao de Cura: +' + pHeal + ' HP!';
    } else {
      log = p.name + ' nao tem Pocao de Cura.';
    }
  }

  /* push log entry */
  var lType = 'info';
  if (log.indexOf('dano') >= 0 || log.indexOf('CRITICO') >= 0) lType = 'dmg';
  if (log.indexOf('recupera') >= 0 || log.indexOf('HP!') >= 0) lType = 'heal';
  this.combat.log.push({msg:log, type:lType});

  this.checkDeaths(cid);
  this.syncHp();

  /* check if combat ended from deaths */
  if (!this.combat.alive) {
    this.finishCombat();
    return {ended:true};
  }

  /* advance turn */
  this.advTurn();
  var sanitized = this.sanitizeCombat();
  this.bc({type:'combat_update', combat:sanitized});
  if (sanitized && sanitized.alive) this.bcastCharStats();

  /* next entity */
  var nxt = this.combat.order[this.combat.ti];
  if (nxt && nxt.isP) {
    this.bc({type:'your_turn', cid:nxt.cid});
  } else if (nxt && !nxt.isP) {
    this.bc({type:'enemy_turn'});
    var self = this;
    clearTimeout(this.enemyTimer);
    this.enemyTimer = setTimeout(function(){ self.processEnemy(); }, 1200);
  }

  return {ok:true};
};

/* ---- enemy turn ---- */
Room.prototype.processEnemy = function() {
  if (!this.combat || !this.combat.alive) return;
  var cur = this.combat.order[this.combat.ti];

  /* safety: skip if not enemy or dead */
  if (!cur || cur.isP || cur.hp <= 0) {
    this.advTurn();
    this.bcastCombatUpdate();
    var nxt = this.combat.order[this.combat.ti];
    if (nxt && nxt.isP) { this.bc({type:'your_turn', cid:nxt.cid}); }
    return;
  }

  var liveP = this.combat.order.filter(function(x){return x.isP && x.hp>0;});
  if (!liveP.length) {
    this.combat.alive = false;
    this.finishCombat();
    return;
  }

  var tgt = liveP[d(liveP.length)-1];
  var hr = d(20) + cur.atk;

  if (hr === 1) {
    this.combat.log.push({msg: cur.name + ' errou feio! (d20: 1)', type:'info'});
  } else if (hr >= tgt.ac) {
    var edmg = roll(cur.dmg);
    tgt.hp -= Math.max(edmg, 1);
    this.combat.log.push({msg: cur.name + ' ataca ' + tgt.name + ': ' + edmg + ' dano!', type:'dmg'});
  } else {
    this.combat.log.push({msg: cur.name + ' errou ' + tgt.name + '!', type:'info'});
  }

  this.syncHp();

  if (this.combat.order.filter(function(x){return x.isP;}).every(function(x){return x.hp<=0;})) {
    this.combat.alive = false;
    this.finishCombat();
    return;
  }

  this.advTurn();
  this.bcastCombatUpdate();

  var next = this.combat.order[this.combat.ti];
  if (next) {
    if (next.isP) {
      this.bc({type:'your_turn', cid:next.cid});
    } else {
      var self = this;
      clearTimeout(this.enemyTimer);
      this.enemyTimer = setTimeout(function(){ self.processEnemy(); }, 1200);
    }
  }
};

/* ---- advance turn (skip dead) ---- */
Room.prototype.advTurn = function() {
  if (!this.combat) return;
  var start = this.combat.ti;
  var len = this.combat.order.length;
  for (var i=1; i<=len; i++) {
    var idx = (this.combat.ti + i) % len;
    var x = this.combat.order[idx];
    if (x.hp > 0) { this.combat.ti = idx; return idx; }
  }
  /* all entities dead (shouldn't happen, but safety) */
  this.combat.alive = false;
};

/* ---- check deaths ---- */
Room.prototype.checkDeaths = function(killerCid) {
  var killer = this.byId(killerCid);
  for (var i = this.combat.es.length-1; i>=0; i--) {
    if (this.combat.es[i].hp <= 0) {
      var deadName = this.combat.es[i].name;
      this.combat.log.push({msg: deadName + ' foi derrotado!', type:'dmg'});
      if (killer && killer.char) {
        killer.char.xp = (killer.char.xp||0) + this.combat.es[i].xp;
        var g = roll(this.combat.es[i].gold || '1d4');
        if (g > 0) {
          killer.char.gold = (killer.char.gold||0) + g;
          this.combat.log.push({msg: '+' + g + ' ouro!', type:'gold'});
        }
      }
      this.combat.es.splice(i, 1);
      /* also remove from order array so turns don't reference dead */
      for (var j = this.combat.order.length-1; j>=0; j--) {
        if (!this.combat.order[j].isP && this.combat.order[j].name === deadName) {
          this.combat.order.splice(j, 1);
        }
      }
    }
  }

  /* all enemies dead? */
  if (this.combat.es.length === 0) {
    this.combat.alive = false;
    this.combat.log.push({msg:'Vitoria! Todos os inimigos derrotados!', type:'gold'});
    /* bonus xp for all participants */
    for (var i=0; i<this.conns.length; i++) {
      var pc = this.conns[i].char;
      if (pc) pc.xp = (pc.xp||0) + 20;
    }
  }

  /* all players dead? */
  if (this.combat.order.filter(function(x){return x.isP;}).every(function(x){return x.hp<=0;})) {
    this.combat.alive = false;
    this.combat.log.push({msg:'Derrota! Todo o grupo caiu.', type:'dmg'});
  }
};

Room.prototype.syncHp = function() {
  for (var i=0; i<this.conns.length; i++) {
    var o = null;
    for (var j=0; j<this.combat.order.length; j++) {
      if (this.combat.order[j].cid === this.conns[i].id) { o = this.combat.order[j]; break; }
    }
    if (o) this.conns[i].char.hp = Math.max(o.hp, 0);
  }
};

Room.prototype.cleanupCombat = function() {
  this.syncHp();
  this.combat = null;
  clearTimeout(this.enemyTimer);
};

Room.prototype.finishCombat = function() {
  this.syncHp();
  this.cleanupCombat();
  this.bcastState();
};

/* ---- sanitize combat for sending to clients ---- */
Room.prototype.sanitizeCombat = function() {
  if (!this.combat) return null;
  var turnName = this.combat.order.length > this.combat.ti ? this.combat.order[this.combat.ti].name : '';
  return {
    log: this.combat.log.slice(-80),
    alive: this.combat.alive,
    es: this.combat.es.map(function(e){ return {name:e.name, hp:e.hp, maxHp:e.maxHp}; }),
    ps: this.combat.order.filter(function(x){return x.isP;}).map(function(x){return {name:x.name, hp:x.hp, maxHp:x.maxHp, cls:x.cls};}),
    order: this.combat.order.map(function(x){return {name:x.name, hp:x.hp, maxHp:x.maxHp, isP:x.isP};}),
    turnName: turnName
  };
};

/* ---- broadcast combat update without resetting screen ---- */
Room.prototype.bcastCombatUpdate = function() {
  var sanitized = this.sanitizeCombat();
  this.bc({type:'combat_update', combat:sanitized});
  this.bcastCharStats();
};

/* ---- broadcast char stats to all players ---- */
Room.prototype.bcastCharStats = function() {
  for (var i=0; i<this.conns.length; i++) {
    var c = this.conns[i];
    var ch = c.char || {};
    c.ws.send(JSON.stringify({
      type: 'char_update',
      hp: Math.max(ch.hp || 0, 0),
      maxHp: ch.maxHp || 10,
      gold: ch.gold || 0,
      xp: ch.xp || 0,
      level: ch.level || 1,
      inventory: ch.inventory || []
    }));
  }
};

/* ---- explore ---- */
Room.prototype.explore = function(cid, ws) {
  if (this.combat) return;
  var loc = null;
  for (var i=0; i<LOCS.length; i++) { if (LOCS[i].name === this.loc) { loc = LOCS[i]; break; } }
  if (!loc) loc = LOCS[2]; /* Vila Pacifica */

  var c = this.byId(cid);
  if (!c) return;
  var ch = c.char || {};

  /* encounter check - 60% chance of exploration event, 40% of scaled encounter chance */
  if (Math.random() < loc.chance * 0.6) {
    var enemies = this.getEncounter();
    this.startCombat(enemies);
    this.bc({type:'combat_started', combat:this.sanitizeCombat()});
    return;
  }

  /* random events - many more varieties */
  var evts = [
    /* ---- peaceful ---- */
    function() { return {msg: 'O caminho e tranquilo. Nenhuma ameaca a vista.', type:'info'}; },
    function() { return {msg: c.name + ' observa a paisagem e sente uma brisa suave.', type:'info'}; },
    function() { return {msg: 'Passaros cantam a distancia. O ambiente e calmo.', type:'info'}; },
    /* ---- loot / gold ---- */
    function() {
      var g = roll('1d6+1');
      ch.gold = (ch.gold||0) + g;
      return {msg: c.name + ' encontrou uma bolsa com ' + g + ' de ouro!', type:'gold'};
    },
    function() {
      var g = roll('2d10+5');
      ch.gold = (ch.gold||0) + g;
      return {msg: 'Um bau escondido continha ' + g + ' de ouro!', type:'gold'};
    },
    function() {
      var g = roll('1d4');
      ch.gold = (ch.gold||0) + g;
      return {msg: c.name + ' achou algumas moedas no chao: +' + g + ' ouro.', type:'gold'};
    },
    /* ---- healing ---- */
    function() {
      var h = roll('1d6+2');
      ch.hp = Math.min((ch.hp||0) + h, ch.maxHp);
      return {msg: 'Uma fonte de agua curativa! +' + h + ' HP.', type:'heal'};
    },
    function() {
      var h = roll('1d4');
      ch.hp = Math.min((ch.hp||0) + h, ch.maxHp);
      return {msg: c.name + ' encontra ervas medicinais e se cura: +' + h + ' HP.', type:'heal'};
    },
    /* ---- XP discoveries ---- */
    function() {
      var r = d(20) + mod(ch.attributes && ch.attributes.int || 10);
      if (r >= 12) {
        ch.xp = (ch.xp||0) + 20;
        return {msg: c.name + ' decifrou inscricoes antigas! +20 XP.', type:'info'};
      }
      return {msg: c.name + ' encontrou runas mas nao conseguiu decifrar.', type:'info'};
    },
    function() {
      ch.xp = (ch.xp||0) + 10;
      return {msg: c.name + ' aprendeu algo novo explorando. +10 XP.', type:'info'};
    },
    function() {
      var r = d(20) + mod(ch.attributes && ch.attributes.sab || 10);
      if (r >= 13) {
        ch.xp = (ch.xp||0) + 25;
        return {msg: c.name + ' meditou e teve uma visao divina! +25 XP.', type:'info'};
      }
      return {msg: c.name + ' tentou meditar mas foi interrompido por ruidos.', type:'info'};
    },
    /* ---- traps and danger ---- */
    function() {
      var r = d(20) + mod(ch.attributes && ch.attributes.des || 10);
      if (r >= 12) {
        return {msg: c.name + ' percebeu uma armadilha e a desativou! +15 XP.', type:'info'};
      }
      var dmg = roll('1d6');
      ch.hp = Math.max((ch.hp||0) - dmg, 1);
      return {msg: c.name + ' caiu em uma armadilha! -' + dmg + ' HP!', type:'dmg'};
    },
    function() {
      var r = d(20) + mod(ch.attributes && ch.attributes.for || 10);
      if (r >= 14) {
        ch.xp = (ch.xp||0) + 15;
        return {msg: c.name + ' derrubou uma porta trancada com forca! +15 XP.', type:'info'};
      }
      return {msg: c.name + ' encontrou uma porta trancada mas nao conseguiu abrir.', type:'info'};
    },
    /* ---- items ---- */
    function() {
      if (ch.inventory && ch.inventory.indexOf('Pocao') < 0) {
        ch.inventory.push('Pocao');
        return {msg: c.name + ' encontrou uma Pocao de Cura!', type:'gold'};
      }
      return {msg: c.name + ' encontrou um pedestal vazio... alguem ja passou por aqui.', type:'info'};
    },
    function() {
      return {msg: c.name + ' achou um mapa antigo no chao. O grupo ganhou conhecimento da area.', type:'info'};
    },
    /* ---- atmosphere ---- */
    function() { return {msg: 'Marcas de garras nas paredes indicam perigo proximo...', type:'info'}; },
    function() { return {msg: 'Um vento frio sopra, trazendo um cheiro de enxofre.', type:'info'}; },
    function() { return {msg: 'Ossos espalhados pelo chao... melhor ficar atento.', type:'info'}; },
    function() { return {msg: c.name + ' ouve sons estranhos vindo da escuridao.', type:'info'}; },
    function() { return {msg: 'Tochas apagadas iluminam fracamente o corredor.', type:'info'}; },
    function() { return {msg: 'Pegadas frescas no chao... e recente.', type:'info'}; },
    /* ---- minor traps ---- */
    function() {
      var dmg = roll('1d3');
      ch.hp = Math.max((ch.hp||0) - dmg, 1);
      return {msg: c.name + ' pisou em um buraco! -' + dmg + ' HP.', type:'dmg'};
    },
    /* ---- skill checks ---- */
    function() {
      var r = d(20) + mod(ch.attributes && ch.attributes.car || 10);
      if (r >= 13) {
        ch.xp = (ch.xp||0) + 15;
        return {msg: c.name + ' convenceu um eremita a compartilhar segredos! +15 XP.', type:'info'};
      }
      return {msg: 'Um eremita se recusa a falar com o grupo.', type:'info'};
    },
  ];

  var result = evts[d(evts.length)-1]();
  this.bc({type:'explore_result', msg:result.msg, logType:result.type});
  this.bcastState();
};


/* ===========================================================
   CONNECTIONS
   =========================================================== */
wss.on('connection', function(ws) {
  var c = {id:'', ws:ws, name:'', room:null, char:null};

  ws.on('message', function(raw) {
    var msg; try { msg = JSON.parse(raw); } catch(e) { return; }

    switch (msg.type) {

      case 'join':
        c.id = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
        c.name = msg.name || 'Heroi';
        ws.send(JSON.stringify({type:'joined', id:c.id}));
        break;

      case 'list_rooms':
        ws.send(JSON.stringify({
          type: 'room_list',
          rooms: Array.from(rooms.values()).map(function(r){
            return {id:r.id, name:r.name, players:r.conns.length, max:4, location:r.loc, host:r.host};
          })
        }));
        break;

      case 'create_room':
        var nm = msg.name || 'Sala';
        var rm = new Room(nextRm++, nm, c.name);
        rooms.set(rm.id, rm);
        rm.add(c);
        c.room = rm;
        rm.bcastState();
        ws.send(JSON.stringify({type:'room_created', room:{id:rm.id, name:rm.name}}));
        break;

      case 'join_room':
        if (c.room) {
          c.room.bc({type:'player_left', name:c.name}, ws);
          c.room.rm(ws);
          c.room = null;
        }
        var target = rooms.get(msg.roomId);
        if (!target) { ws.send(JSON.stringify({type:'error', msg:'Sala nao encontrada.'})); break; }
        if (target.conns.length >= 4) { ws.send(JSON.stringify({type:'error', msg:'Sala cheia.'})); break; }
        if (msg.character) c.char = msg.character;
        target.add(c);
        c.room = target;
        target.sendState(ws);
        target.bc({type:'player_joined', name:c.name});
        break;

      case 'set_character':
        if (msg.character) c.char = msg.character;
        break;

      case 'chat':
        if (c.room) c.room.bc({type:'chat', name:c.name, text:msg.text});
        break;

      case 'explore':
        if (c.room) c.room.explore(c.id, ws);
        break;

      case 'rest':
        if (c.room && !c.room.combat) {
          for (var i=0; i<c.room.conns.length; i++) {
            var x = c.room.conns[i];
            if (x.char) {
              var h = Math.floor((x.char.maxHp||10) * 0.5);
              x.char.hp = Math.min((x.char.hp||0) + h, x.char.maxHp);
            }
          }
          c.room.bc({type:'rest', log:['Todos descansaram e recuperaram 50% HP.'], type:'rest'});
          c.room.bcastState();
        }
        break;

      case 'travel':
        if (c.room && !c.room.combat) {
          c.room.loc = msg.location;
          c.room.bc({type:'travel', location:msg.location});
          c.room.bcastState();
        }
        break;

      case 'combat_action':
        if (c.room && c.room.combat) c.room.act(c.id, msg.action);
        break;
    }
  });

  ws.on('close', function() {
    if (c.room) {
      c.room.bc({type:'player_left', name:c.name});
      c.room.rm(ws);
      if (c.room.conns.length === 0) rooms.delete(c.room.id);
      else c.room.bcastState();
    }
  });
});

srv.listen(PORT, function() {
  console.log('Servidor RPG rodando em http://localhost:' + PORT);
});
