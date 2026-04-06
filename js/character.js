/* ================================================
   CHARACTER CREATION
   ================================================ */
const CC = {
  pts: 27,
  race: null,
  cls: null,
  /* base values (before racial bonuses) */
  base: { for: 8, des: 8, con: 8, int: 8, sab: 8, car: 8 },

  /* -- reset -- */
  init() {
    this.pts = 27;
    this.race = null;
    this.cls = null;
    this.base = { for: 8, des: 8, con: 8, int: 8, sab: 8, car: 8 };
    this._drawRaces();
    this._drawClasses();
    this._drawAttrs();
    this._summary();
    this._ready();
  },

  /* cost to raise from current value to current+1 */
  _cost(v) {
    if (v >= 15) return Infinity;
    if (v <= 13) return 1;
    return 2;  /* 14->15 costs 2 */
  },

  /* return final value including racial bonus */
  _final(attr) {
    return this.base[attr] + (this.race ? (RACES[this.race].bonuses?.[attr] || 0) : 0);
  },

  /* -- draw race cards -- */
  _drawRaces() {
    var el = document.getElementById('cc-races');
    el.innerHTML = '';
    for (var k in RACES) {
      var r = RACES[k];
      var d = document.createElement('div');
      d.className = 'opt-card' + (this.race === k ? ' sel' : '');
      d.innerHTML = '<div class="opt-name">' + (r.icon || '') + ' ' + r.name + '</div>' +
                    '<div class="opt-desc">' + r.description + '</div>';
      d._key = k;
      d.onclick = function() { CC.race = this._key; CC._drawRaces(); CC._drawAttrs(); CC._summary(); CC._ready(); };
      el.appendChild(d);
    }
  },

  /* -- draw class cards -- */
  _drawClasses() {
    var el = document.getElementById('cc-classes');
    el.innerHTML = '';
    for (var k in CLASSES) {
      var c = CLASSES[k];
      var d = document.createElement('div');
      d.className = 'opt-card' + (this.cls === k ? ' sel' : '');
      d.innerHTML = '<div class="opt-name">' + (c.icon || '') + ' ' + c.name + '</div>' +
                    '<div class="opt-desc">' + c.description + '</div>';
      d._key = k;
      d.onclick = function() { CC.cls = this._key; CC._drawClasses(); CC._summary(); CC._ready(); };
      el.appendChild(d);
    }
  },

  /* -- draw attribute rows -- */
  _drawAttrs() {
    var el = document.getElementById('cc-attrs');
    el.innerHTML = '';
    var attrs = ['for', 'des', 'con', 'int', 'sab', 'car'];
    var names = ATTR_NAMES;

    for (var i = 0; i < attrs.length; i++) {
      var k = attrs[i];
      var bv = this.base[k];
      var fv = this._final(k);  /* includes race bonus */
      var rb = (this.race && RACES[this.race].bonuses && RACES[this.race].bonuses[k]) || 0;
      var m = Math.floor((fv - 10) / 2);
      var mStr = (m >= 0 ? '+' : '') + m;

      var row = document.createElement('div');
      row.className = 'atr';

      var displayVal = rb > 0 ? bv + ' <span style="color:var(--tx2)">+' + rb + ' = ' + fv + '</span>' : bv;

      row.innerHTML =
        '<span class="aN">' + names[k] + '</span>' +
        '<div class="btns">' +
        '  <button' + (bv <= 7 ? ' disabled' : '') + ' data-a="' + k + '" data-d="-1">\u2212</button>' +
        '  <span class="val">' + displayVal + '</span>' +
        '  <button' +
        (this._cost(bv) > this.pts || bv >= 15 ? ' disabled' : '') +
        ' data-a="' + k + '" data-d="1">+</button>' +
        '</div>' +
        '<span class="mod">' + mStr + '</span>';

      el.appendChild(row);
    }

    document.getElementById('cc-pts').textContent = 'Pontos: ' + this.pts;

    /* attach button handlers */
    var btns = el.querySelectorAll('.btns button');
    for (var j = 0; j < btns.length; j++) {
      btns[j].onclick = (function(e) {
        var attr = e.target.dataset.a;
        var dir = parseInt(e.target.dataset.d);
        if (dir === 1) CC._inc(attr);
        else CC._dec(attr);
      }).bind(null, { target: btns[j] });
    }
  },

  _inc(k) {
    var c = this._cost(this.base[k]);
    if (c > this.pts || this.base[k] >= 15) return;
    this.pts -= c;
    this.base[k]++;
    this._refresh();
  },

  _dec(k) {
    if (this.base[k] <= 7) return;
    /* refund equals the cost to go from current-1 to current */
    this.pts += this._cost(this.base[k] - 1);
    this.base[k]--;
    this._refresh();
  },

  _refresh() {
    this._drawAttrs();
    this._summary();
    this._ready();
  },

  /* -- summary display -- */
  _summary() {
    var el = document.getElementById('cc-summary');
    if (!this.race || !this.cls) { el.classList.remove('vis'); return; }
    el.classList.add('vis');

    var race = RACES[this.race];
    var cls = CLASSES[this.cls];
    var rb = race.bonuses || {};
    var conVal = this.base.con + (rb.con || 0);
    var desVal = this.base.des + (rb.des || 0);
    var hp = cls.hitDie + Math.floor((conVal - 10) / 2);
    var ca = 10 + Math.floor((desVal - 10) / 2);

    var h = '<b>' + (race.icon||'') + ' ' + race.name + ' \u2014 ' + (cls.icon||'') + ' ' + cls.name + '</b><br>';
    h += 'HP: ' + hp + ' | CA: ' + ca + '<br>';

    var attrs = ['for', 'des', 'con', 'int', 'sab', 'car'];
    for (var i = 0; i < attrs.length; i++) {
      var k = attrs[i];
      var fv = this._final(k);
      var m = Math.floor((fv - 10) / 2);
      h += ATTR_NAMES[k] + ': <b>' + fv + '</b> (' + (m >= 0 ? '+' : '') + m + ')  ';
    }
    el.innerHTML = h;
  },

  _ready() {
    document.getElementById('cc-play').disabled = !(this.race && this.cls);
  },

  /* -- build final character data -- */
  build(name) {
    var race = RACES[this.race];
    var cls = CLASSES[this.cls];
    var fa = {};
    for (var k in ATTR_NAMES) {
      fa[k] = this.base[k] + (race.bonuses?.[k] || 0);
    }
    var conMod = Math.floor((fa.con - 10) / 2);
    var hp = Math.max(cls.hitDie + conMod, 1);
    return {
      name: name,
      race: this.race,
      classKey: this.cls,
      level: 1,
      xp: 0,
      hp: hp,
      maxHp: hp,
      ac: 10 + Math.floor((fa.des - 10) / 2),
      attributes: fa,
      gold: 0,
      inventory: [],
      className: cls.name,
      raceName: race.name,
      hitDie: cls.hitDie
    };
  }
};
