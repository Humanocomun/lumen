/*
 * LUMEN - una luciernaga cruzando el bosque de noche.
 * Prototipo para YouTube Playables.
 *
 * Reglas de plataforma respetadas a proposito:
 *  - Se adapta a CUALQUIER aspect ratio y al redimensionar sin perder el estado.
 *  - Tactil, mouse y teclado.
 *  - Sin links externos, sin boton de compartir, sin boton de salir, sin boton de mute
 *    (el audio lo manda YouTube via system.isAudioEnabled).
 *  - Esc cierra los paneles y no se bloquea.
 *  - Todo el arte es procedural: cero imagenes, bundle minusculo, carga instantanea.
 */
(function () {
  'use strict';

  /* ============================ configuracion ============================ */

  var CFG = {
    gravity: 205,
    flap: -63,
    vyMax: 118,
    speed0: 34,
    speedMax: 49,
    speedStep: 0.30,
    gateW: 8,
    gapFrom: 0.345,
    gapTo: 0.225,
    gapRamp: 26,
    birdR: 2.5,
    hitScale: 0.80,
    groundH: 9,
    biomeEvery: 12,
    reviveMinScore: 4,
    interstitialEvery: 3
  };

  var SKINS = [
    { id: 'lumen',  cost: 0,   glow: '#ffe08a', body: '#fff6d6', trail: '#ffd45e' },
    { id: 'menta',  cost: 25,  glow: '#7dffcf', body: '#e2fff5', trail: '#43e8b0' },
    { id: 'coral',  cost: 60,  glow: '#ff90a6', body: '#ffe4ea', trail: '#ff5c7c' },
    { id: 'cielo',  cost: 120, glow: '#8ec5ff', body: '#e2efff', trail: '#4f9dff' },
    { id: 'ambar',  cost: 200, glow: '#ffb347', body: '#ffe9cc', trail: '#ff8c1a' },
    { id: 'brasa',  cost: 350, glow: '#ff6b3d', body: '#ffd5c2', trail: '#ff3d1f' }
  ];

  // La niebla va como [r,g,b,a] y no como texto: asi se puede interpolar entre biomas.
  // `img` y `obs` enganchan el bioma con su fondo y su tipo de obstaculo: al avanzar
  // cambian juntos, que es lo que hace que el juego se sienta progresivo.
  var BIOMES = [
    { img: 'fondoNoche',  obs: 'obsHongo',   sky: ['#0a1030', '#1b2a5e', '#2d4a7c'], hill1: '#0b1330', hill2: '#131f47', fog: [90, 130, 200, 0.10], star: 0.9 },
    { img: 'fondoAlba',   obs: 'obsTronco',  sky: ['#2a1442', '#5b2a5e', '#a9527a'], hill1: '#1d0f2e', hill2: '#301a44', fog: [255, 150, 180, 0.09], star: 0.35 },
    { img: 'fondoBruma',  obs: 'obsCristal', sky: ['#08282c', '#0f4a4a', '#1d7a68'], hill1: '#062024', hill2: '#0c3436', fog: [140, 255, 220, 0.09], star: 0.55 },
    { img: 'fondoAurora', obs: 'obsTotem',   sky: ['#161033', '#243a7a', '#2f7f9c'], hill1: '#0d0b24', hill2: '#171a3e', fog: [120, 255, 240, 0.12], star: 1.0 }
  ];

  /*
   * Cada columna se corta en tres: la tapa (que sobresale y hace de labio del hueco),
   * una banda del medio que se repite para alargarla, y el resto se descarta.
   * Son fracciones de la imagen ya recortada, medidas con herramientas/ (no a ojo):
   *   tapa   - hasta donde llega el sombrero/capitel
   *   banda  - el tramo uniforme que se puede repetir sin que se note
   *   tallo  - que parte del ANCHO de la imagen es el tronco; el resto es voladizo
   */
  // La banda de cada uno se eligio deslizando una ventana por el tallo y quedandose con
  // la que menos se nota al empalmar consigo misma, no a ojo.
  var COLUMNAS = {
    obsHongo:   { tapa: 0.292, banda0: 0.540, banda1: 0.660, tallo: 0.395 },
    obsTronco:  { tapa: 0.262, banda0: 0.624, banda1: 0.743, tallo: 0.278 },
    obsCristal: { tapa: 0.285, banda0: 0.509, banda1: 0.628, tallo: 0.480 },
    obsTotem:   { tapa: 0.222, banda0: 0.458, banda1: 0.578, tallo: 0.491 }
  };

  // Cuanto tarda el cielo en pasar de un bioma al siguiente, en segundos.
  var BIOME_FADE = 4.0;

  /*
   * Todo el texto va en INGLES, sin excepciones: el catalogo de Playables se juega en
   * EE.UU., Reino Unido, Australia, India y la UE, y ahi el ingles es el minimo comun.
   * Ademas la hoja de tipografia no trae enes ni vocales acentuadas, asi que un texto
   * en espanol saldria con huecos.
   */
  var STR = {
    tap: 'Tap to fly', best: 'Best', skins: 'Lights', back: 'Back',
    retry: 'Again', revive: 'Continue', dbl: 'Double pollen', locked: 'Locked',
    use: 'Use', inUse: 'In use', newBest: 'New best', missions: 'Goals',
    mGates: 'Pass {n} gates', mPollen: 'Collect {n} motes', mRuns: 'Play {n} runs',
    done: 'Done', ad: 'Ad'
  };

  /* ============================ estado global ============================ */

  var cv = document.getElementById('c');
  var ctx = cv.getContext('2d', { alpha: false });

  var V = { pxW: 0, pxH: 0, u: 1, w: 0, h: 0, dpr: 1 };

  var S = {
    mode: 'menu',        // menu | play | dead | skins
    t: 0,
    paused: false,
    booted: false,

    bird: { y: 50, vy: 0, rot: 0, flapT: 0 },
    gates: [],
    motes: [],
    parts: [],
    scrollX: 0,
    speed: CFG.speed0,

    biomeIdx: 0,      // bioma del que venimos
    biomeNext: 0,     // bioma al que vamos
    biomeT: 1,        // 0..1, avance del fundido

    score: 0,
    runPollen: 0,
    passed: 0,
    revivedThisRun: false,
    doubledThisRun: false,
    shake: 0,
    deadT: 0,
    startT: 0,

    save: {
      best: 0, coins: 0, skin: 'lumen', owned: ['lumen'],
      runs: 0, missions: null
    },

    toast: null,
    buttons: [],
    pressed: null,      // id del boton que se esta pulsando, para hundir la placa
    adPending: false
  };

  function T(k) { return STR[k] || k; }

  /* ============================ utilidades ============================ */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function rrect(x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Todo el juego piensa en "unidades de mundo"; esto las lleva a pixeles.
  function X(u) { return u * V.u; }

  function skin() {
    for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === S.save.skin) return SKINS[i];
    return SKINS[0];
  }

  /* ---------- biomas con fundido ---------- */

  function hex2rgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function mixHex(a, b, t) {
    var A = hex2rgb(a), B = hex2rgb(b);
    return 'rgb(' + Math.round(lerp(A[0], B[0], t)) + ',' +
                    Math.round(lerp(A[1], B[1], t)) + ',' +
                    Math.round(lerp(A[2], B[2], t)) + ')';
  }

  function mixFog(a, b, t) {
    return 'rgba(' + Math.round(lerp(a[0], b[0], t)) + ',' +
                     Math.round(lerp(a[1], b[1], t)) + ',' +
                     Math.round(lerp(a[2], b[2], t)) + ',' +
                     (lerp(a[3], b[3], t)).toFixed(3) + ')';
  }

  // Devuelve el bioma ya mezclado. Mientras S.biomeT va de 0 a 1 el cielo, los cerros
  // y la niebla cruzan del bioma viejo al nuevo; nada cambia de golpe.
  var _biomeCache = { t: -1, i: -1, j: -1, v: null };
  function biome() {
    var i = S.biomeIdx, j = S.biomeNext, t = S.biomeT;
    if (_biomeCache.t === t && _biomeCache.i === i && _biomeCache.j === j) return _biomeCache.v;

    var A = BIOMES[i], B = BIOMES[j];
    var v;
    if (t >= 1 || i === j) {
      v = { sky: B.sky.map(function (c) { return mixHex(c, c, 0); }),
            hill1: mixHex(B.hill1, B.hill1, 0), hill2: mixHex(B.hill2, B.hill2, 0),
            fog: mixFog(B.fog, B.fog, 0), star: B.star };
    } else {
      // curva suave: entra y sale sin tirones
      var e = t * t * (3 - 2 * t);
      v = {
        sky: [mixHex(A.sky[0], B.sky[0], e), mixHex(A.sky[1], B.sky[1], e), mixHex(A.sky[2], B.sky[2], e)],
        hill1: mixHex(A.hill1, B.hill1, e),
        hill2: mixHex(A.hill2, B.hill2, e),
        fog: mixFog(A.fog, B.fog, e),
        star: lerp(A.star, B.star, e)
      };
    }
    _biomeCache = { t: t, i: i, j: j, v: v };
    return v;
  }

  function updateBiome(dt) {
    var quiere = Math.floor(S.passed / CFG.biomeEvery) % BIOMES.length;
    if (quiere !== S.biomeNext) {
      // arranca un fundido nuevo desde lo que se ve ahora mismo
      S.biomeIdx = S.biomeT >= 1 ? S.biomeNext : S.biomeIdx;
      S.biomeNext = quiere;
      S.biomeT = 0;
    }
    if (S.biomeT < 1) {
      S.biomeT = Math.min(1, S.biomeT + dt / BIOME_FADE);
      if (S.biomeT >= 1) S.biomeIdx = S.biomeNext;
    }
  }

  function playH() { return V.h - CFG.groundH; }

  function birdX() { return clamp(V.w * 0.30, 11, 42); }

  function gapH() {
    var t = clamp(S.passed / CFG.gapRamp, 0, 1);
    return playH() * lerp(CFG.gapFrom, CFG.gapTo, t);
  }

  function gateSpacing() { return clamp(V.w * 0.60, 29, 46); }

  /* ============================ layout ============================ */

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = Math.max(1, cv.clientWidth || window.innerWidth);
    var h = Math.max(1, cv.clientHeight || window.innerHeight);

    V.dpr = dpr;
    V.pxW = Math.round(w * dpr);
    V.pxH = Math.round(h * dpr);
    cv.width = V.pxW;
    cv.height = V.pxH;

    // Altura de mundo = 100 unidades por defecto. En pantallas muy angostas
    // "alejamos la camara" para que siempre se vea suficiente por delante,
    // y en ultrawide la limitamos para que no se vea medio nivel de golpe.
    var aspect = w / h;
    var wh = 100;
    if (wh * aspect < 52) wh = 52 / aspect;
    if (wh * aspect > 190) wh = 190 / aspect;

    V.h = wh;
    V.w = wh * aspect;
    V.u = V.pxH / V.h;

    // El estado (posiciones en unidades) no se toca: el juego sigue igual tras redimensionar.
  }

  /* ============================ mundo ============================ */

  function makeGate(x) {
    var g = gapH();
    var margin = playH() * 0.10;
    var cy = rnd(margin + g / 2, playH() - margin - g / 2);
    // El tipo de obstaculo se fija al nacer, con el bioma al que vamos. Asi el mundo
    // cambia de material a medida que entran puertas nuevas, en vez de mutar de golpe
    // las que ya estan en pantalla.
    return {
      x: x, cy: cy, gap: g, passed: false, wob: rnd(0, 6.28),
      cap: Math.random() < 0.5,
      obs: BIOMES[S.biomeNext].obs
    };
  }

  function resetRun(keepGates) {
    S.bird.y = playH() * 0.42;
    S.bird.vy = 0;
    S.bird.rot = 0;
    S.speed = CFG.speed0;
    S.score = 0;
    S.runPollen = 0;
    S.passed = 0;
    S.revivedThisRun = false;
    S.doubledThisRun = false;
    S.shake = 0;
    S.parts.length = 0;

    if (!keepGates) {
      S.gates.length = 0;
      S.motes.length = 0;
      var first = birdX() + V.w * 0.95;
      for (var i = 0; i < 5; i++) spawnGate(first + i * gateSpacing());
    }
  }

  function spawnGate(x) {
    var g = makeGate(x);
    S.gates.push(g);
    // Una mota en el centro del hueco, y a veces una grande arriesgada junto al borde.
    S.motes.push({ x: g.x + CFG.gateW / 2, y: g.cy, v: 1, got: false, ph: rnd(0, 6.28) });
    if (Math.random() < 0.18) {
      var side = Math.random() < 0.5 ? -1 : 1;
      S.motes.push({
        x: g.x + CFG.gateW / 2 + rnd(6, 11),
        y: clamp(g.cy + side * (g.gap / 2 - 2.2), 4, playH() - 4),
        v: 5, got: false, ph: rnd(0, 6.28)
      });
    }
  }

  function flap() {
    if (S.mode === 'menu') { startRun(); return; }
    if (S.mode !== 'play' || S.paused) return;
    S.bird.vy = CFG.flap;
    S.bird.flapT = 0.16;
    SFX.flap();
    for (var i = 0; i < 3; i++) puff(birdX() - 1.5, S.bird.y + rnd(-1, 1), skin().trail, 0.5);
  }

  function startRun() {
    resetRun(false);
    S.mode = 'play';
    S.startT = S.t;
    S.save.runs++;
    bumpMission('runs', 1);
    SFX.unlock();
  }

  function puff(x, y, color, scale) {
    S.parts.push({
      x: x, y: y, vx: rnd(-8, -2), vy: rnd(-7, 7),
      life: rnd(0.3, 0.7), max: 0.7, c: color, r: rnd(0.35, 0.9) * (scale || 1)
    });
  }

  function burst(x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = rnd(0, 6.28), s = rnd(6, power);
      S.parts.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rnd(0.4, 0.9), max: 0.9, c: color, r: rnd(0.4, 1.1)
      });
    }
  }

  /* ============================ objetivos ============================ */

  function newMissions() {
    var b = Math.max(6, Math.min(40, S.save.best || 8));
    return [
      { t: 'gates',  goal: Math.round(b * 0.7) + 3, n: 0, rw: 18, ok: false },
      { t: 'pollen', goal: 25 + Math.floor(Math.random() * 20), n: 0, rw: 22, ok: false },
      { t: 'runs',   goal: 3, n: 0, rw: 12, ok: false }
    ];
  }

  function bumpMission(kind, n) {
    var ms = S.save.missions;
    if (!ms) return;
    var allDone = true;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.t === kind && !m.ok) {
        m.n += n;
        if (m.n >= m.goal) {
          m.ok = true;
          S.save.coins += m.rw;
          showToast(T('done') + '  +' + m.rw, '#ffe08a');
          SFX.unlockSkin();
        }
      }
      if (!m.ok) allDone = false;
    }
    if (allDone) S.save.missions = newMissions();
  }

  function missionLabel(m) {
    var k = m.t === 'gates' ? 'mGates' : (m.t === 'pollen' ? 'mPollen' : 'mRuns');
    return T(k).replace('{n}', m.goal);
  }

  function showToast(text, color) {
    S.toast = { text: text, color: color || '#fff', life: 2.2, max: 2.2 };
  }

  /* ============================ logica ============================ */

  function update(dt) {
    S.t += dt;

    if (S.toast) { S.toast.life -= dt; if (S.toast.life <= 0) S.toast = null; }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 2.2);

    // particulas siempre vivas (tambien en menu, dan vida al fondo)
    for (var i = S.parts.length - 1; i >= 0; i--) {
      var p = S.parts[i];
      p.life -= dt;
      if (p.life <= 0) { S.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += 6 * dt; p.vx *= 0.98;
    }

    if (S.mode === 'dead') { S.deadT += dt; return; }
    if (S.mode !== 'play' || S.paused) return;

    updateBiome(dt);

    S.speed = Math.min(CFG.speedMax, CFG.speed0 + S.passed * CFG.speedStep);
    var dx = S.speed * dt;
    S.scrollX += dx;

    var b = S.bird;
    b.vy = clamp(b.vy + CFG.gravity * dt, -CFG.vyMax, CFG.vyMax);
    b.y += b.vy * dt;
    b.rot = clamp(b.vy / 130, -0.5, 1.0);
    if (b.flapT > 0) b.flapT -= dt;

    // estela
    if (Math.random() < 0.55) puff(birdX() - 1.2, b.y + rnd(-0.7, 0.7), skin().trail, 0.6);

    var bx = birdX();
    var r = CFG.birdR * CFG.hitScale;

    // techo y suelo
    if (b.y - r < 0) { b.y = r; b.vy = 0; }
    if (b.y + r >= playH()) { b.y = playH() - r; die(); return; }

    // puertas
    var last = 0;
    for (var g = 0; g < S.gates.length; g++) {
      var gt = S.gates[g];
      gt.x -= dx;
      if (gt.x > last) last = gt.x;

      if (!gt.passed && gt.x + CFG.gateW < bx) {
        gt.passed = true;
        S.score++;
        S.passed++;
        bumpMission('gates', 1);
        SFX.gate();
        if (S.passed % CFG.biomeEvery === 0) burst(bx + 6, playH() * 0.5, biome().fog, 14, 22);
      }

      if (gt.x < bx + r && gt.x + CFG.gateW > bx - r) {
        var top = gt.cy - gt.gap / 2;
        var bot = gt.cy + gt.gap / 2;
        if (b.y - r < top || b.y + r > bot) { die(); return; }
      }
    }
    while (S.gates.length && S.gates[0].x + CFG.gateW < -6) S.gates.shift();
    while (last < V.w + gateSpacing() * 2) { spawnGate(last + gateSpacing()); last += gateSpacing(); }

    // motas
    for (var m = S.motes.length - 1; m >= 0; m--) {
      var mo = S.motes[m];
      mo.x -= dx;
      if (mo.x < -6) { S.motes.splice(m, 1); continue; }
      if (mo.got) continue;
      var ddx = mo.x - bx, ddy = mo.y - b.y;
      var rr = CFG.birdR + (mo.v > 1 ? 2.4 : 1.7);
      if (ddx * ddx + ddy * ddy < rr * rr) {
        mo.got = true;
        S.runPollen += mo.v;
        bumpMission('pollen', mo.v);
        SFX.coin(S.runPollen);
        burst(mo.x, mo.y, mo.v > 1 ? '#ffd45e' : skin().glow, mo.v > 1 ? 14 : 6, 16);
        S.motes.splice(m, 1);
      }
    }
  }

  function die() {
    if (S.mode !== 'play') return;
    S.mode = 'dead';
    S.deadT = 0;
    S.shake = 1;
    SFX.hit();
    burst(birdX(), S.bird.y, skin().glow, 26, 30);

    S.save.coins += S.runPollen;
    if (S.score > S.save.best) {
      S.save.best = S.score;
      showToast(T('newBest') + ' ' + S.score, '#ffe08a');
    }
    YT.sendScore(S.score);
    persist();
  }

  function reallyRestart() {
    resetRun(false);
    S.mode = 'play';
    S.save.runs++;
    bumpMission('runs', 1);
  }

  // Interstitial en corte natural: al reintentar, cada N muertes.
  function restart() {
    if (S.adPending) return;
    var n = S.save.runs;
    if (n > 0 && n % CFG.interstitialEvery === 0 && S.score >= 3) {
      S.adPending = true;
      YT.interstitial().then(function () {
        S.adPending = false;
        reallyRestart();
      });
    } else {
      reallyRestart();
    }
  }

  function doRevive() {
    if (S.adPending || S.revivedThisRun) return;
    S.adPending = true;
    YT.rewarded('revive-run').then(function (ok) {
      S.adPending = false;
      if (!ok) { showToast(T('ad'), '#ff9c9c'); return; }
      S.revivedThisRun = true;
      // Limpia el tramo delante del jugador para no morir de nuevo al instante.
      var bx = birdX();
      for (var i = S.gates.length - 1; i >= 0; i--) {
        if (S.gates[i].x < bx + V.w * 0.55) S.gates.splice(i, 1);
      }
      for (var j = S.motes.length - 1; j >= 0; j--) {
        if (S.motes[j].x < bx + V.w * 0.55) S.motes.splice(j, 1);
      }
      var last = 0;
      for (var k = 0; k < S.gates.length; k++) last = Math.max(last, S.gates[k].x);
      if (last < V.w) { last = V.w * 0.9; spawnGate(last); }
      while (last < V.w + gateSpacing() * 2) { spawnGate(last + gateSpacing()); last += gateSpacing(); }

      S.bird.y = playH() * 0.42;
      S.bird.vy = CFG.flap * 0.5;
      S.mode = 'play';
      SFX.revive();
      burst(bx, S.bird.y, skin().glow, 22, 26);
    });
  }

  function doDouble() {
    if (S.adPending || S.doubledThisRun || S.runPollen <= 0) return;
    S.adPending = true;
    YT.rewarded('double-pollen').then(function (ok) {
      S.adPending = false;
      if (!ok) { showToast(T('ad'), '#ff9c9c'); return; }
      S.doubledThisRun = true;
      S.save.coins += S.runPollen;
      showToast('+' + S.runPollen, '#ffe08a');
      SFX.unlockSkin();
      persist();
    });
  }

  function buySkin(sk) {
    if (S.save.owned.indexOf(sk.id) >= 0) { S.save.skin = sk.id; persist(); SFX.gate(); return; }
    if (S.save.coins < sk.cost) { showToast(T('locked'), '#ff9c9c'); return; }
    S.save.coins -= sk.cost;
    S.save.owned.push(sk.id);
    S.save.skin = sk.id;
    SFX.unlockSkin();
    burst(V.w / 2, V.h / 2, sk.glow, 30, 30);
    persist();
  }

  var saveTimer = null;
  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { YT.saveData(S.save); }, 350);
  }

  /* ============================ dibujo ============================ */

  /* ---------- sprites ---------- */

  var IMG = ASSETS.IMG;

  /*
   * Dibuja una columna de obstaculo a partir de UNA sola imagen: pega la tapa en el
   * labio del hueco y repite la banda del medio hasta cubrir el largo que haga falta.
   *
   * `talloPx` es el ancho del TRONCO, que es el que choca. El sombrero sobresale por
   * fuera de esa medida, igual que en el dibujo: lo que se ve vuela un poco mas que lo
   * que mata, que es como se sienten bien estos juegos.
   * `haciaArriba` la hace crecer hacia el techo en vez de hacia el suelo.
   */
  function drawColumna(img, meta, xCentroPx, labioPx, largoPx, talloPx, haciaArriba) {
    if (largoPx <= 0) return;
    var iw = img.width, ih = img.height;

    var anchoPx = talloPx / meta.tallo;      // ancho de la imagen entera
    var esc = anchoPx / iw;
    var x = xCentroPx - anchoPx / 2;

    var hTapa = ih * meta.tapa;
    var y0 = ih * meta.banda0;
    var hBanda = Math.max(1, ih * meta.banda1 - y0);

    ctx.save();
    ctx.translate(x, labioPx);
    if (haciaArriba) ctx.scale(1, -1);

    var tapaPx = hTapa * esc;
    var paso = hBanda * esc;

    // El cuerpo va primero y arranca DEBAJO de donde ira la tapa; la tapa se dibuja
    // encima al final y se come la costura.
    var y = Math.max(0, tapaPx - 1);
    var guarda = 0;
    while (y < largoPx && guarda++ < 200) {
      var resto = Math.min(paso, largoPx - y);
      ctx.drawImage(img, 0, y0, iw, hBanda * (resto / paso), 0, y, anchoPx, resto);
      y += resto;
    }
    ctx.drawImage(img, 0, 0, iw, hTapa, 0, 0, anchoPx, tapaPx);

    ctx.restore();
  }

  // Fondo de bioma: dos imagenes superpuestas con la de destino subiendo de opacidad.
  // Es lo que hace que el cambio de bioma sea un amanecer y no un corte de luz.
  function drawFondoImg(nombre, alpha, par) {
    var img = IMG[nombre];
    if (!img || alpha <= 0.002) return false;

    // "cover": llena la pantalla sin deformar la imagen.
    var escala = Math.max(V.pxW / img.width, V.pxH / img.height);
    var w = img.width * escala, h = img.height * escala;
    var off = (-(S.scrollX * par) % w + w) % w;
    var y = (V.pxH - h) * 0.5;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -off, y, w, h);
    if (off > 0) ctx.drawImage(img, -off + w, y, w, h);
    ctx.restore();
    return true;
  }

  // Un fotograma de una tira horizontal de `n` celdas.
  function drawFrame(img, n, i, xPx, yPx, anchoPx, rot, alpha) {
    var cw = img.width / n;
    var esc = anchoPx / cw;
    var ch = img.height * esc;
    ctx.save();
    ctx.translate(xPx, yPx);
    if (rot) ctx.rotate(rot);
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, (i % n) * cw, 0, cw, img.height, -anchoPx / 2, -ch / 2, anchoPx, ch);
    ctx.restore();
  }

  var stars = [];
  function initStars() {
    stars.length = 0;
    for (var i = 0; i < 90; i++) {
      stars.push({ x: Math.random(), y: Math.random() * 0.75, s: rnd(0.35, 1.1), ph: rnd(0, 6.28) });
    }
  }

  function drawBackground() {
    var B = biome();

    // --- camino con imagenes: el bioma viejo abajo y el nuevo subiendo de opacidad ---
    var imgA = IMG[BIOMES[S.biomeIdx].img];
    var imgB = IMG[BIOMES[S.biomeNext].img];
    if (imgA || imgB) {
      var e = S.biomeT >= 1 ? 1 : S.biomeT * S.biomeT * (3 - 2 * S.biomeT);
      ctx.fillStyle = '#0a1030';
      ctx.fillRect(0, 0, V.pxW, V.pxH);
      drawFondoImg(BIOMES[S.biomeIdx].img, 1, 0.10);
      if (imgB && imgA !== imgB) drawFondoImg(BIOMES[S.biomeNext].img, e, 0.10);
      else if (!imgA) drawFondoImg(BIOMES[S.biomeNext].img, 1, 0.10);

      // Velo oscuro: hay biomas de cielo muy claro (la bruma) sobre los que el texto
      // blanco y los obstaculos se perderian. Esto garantiza contraste siempre.
      var velo = ctx.createLinearGradient(0, 0, 0, V.pxH);
      velo.addColorStop(0, 'rgba(6,10,24,0.34)');
      velo.addColorStop(0.45, 'rgba(6,10,24,0.16)');
      velo.addColorStop(1, 'rgba(6,10,24,0.42)');
      ctx.fillStyle = velo;
      ctx.fillRect(0, 0, V.pxW, V.pxH);
      return;
    }

    // --- respaldo dibujado a mano, si no hay imagenes ---
    var gr = ctx.createLinearGradient(0, 0, 0, V.pxH);
    gr.addColorStop(0, B.sky[0]);
    gr.addColorStop(0.55, B.sky[1]);
    gr.addColorStop(1, B.sky[2]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, V.pxW, V.pxH);

    // estrellas
    if (B.star > 0.05) {
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var tw = 0.55 + 0.45 * Math.sin(S.t * 1.6 + st.ph);
        ctx.globalAlpha = tw * B.star * 0.85;
        ctx.fillStyle = '#ffffff';
        var sx = (st.x * V.pxW + (-S.scrollX * 0.6 * V.u) % V.pxW + V.pxW) % V.pxW;
        ctx.fillRect(sx, st.y * V.pxH, st.s * V.dpr, st.s * V.dpr);
      }
      ctx.globalAlpha = 1;
    }

    // luna (el tamano cuelga de la dimension menor: no se agiganta en pantallas altas)
    var mx = V.pxW * 0.78, my = V.pxH * 0.14, mr = X(Math.min(V.w, V.h) * 0.055);
    var mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 3.2);
    mg.addColorStop(0, 'rgba(255,248,220,0.30)');
    mg.addColorStop(1, 'rgba(255,248,220,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, mr * 3.2, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,232,0.85)';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 6.2832); ctx.fill();

    hills(B.hill2, 0.18, V.h * 0.62, V.h * 0.10, 1.3);
    hills(B.hill1, 0.34, V.h * 0.72, V.h * 0.13, 0.9);

    // niebla
    var fg = ctx.createLinearGradient(0, X(V.h * 0.55), 0, V.pxH);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(1, B.fog);
    ctx.fillStyle = fg;
    ctx.fillRect(0, X(V.h * 0.55), V.pxW, V.pxH);
  }

  function hills(color, par, baseY, amp, freq) {
    var off = -(S.scrollX * par) % (V.w * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, V.pxH);
    var steps = 40;
    for (var i = 0; i <= steps; i++) {
      var wx = (i / steps) * V.w;
      var y = baseY + Math.sin((wx + off) * 0.06 * freq) * amp
                    + Math.sin((wx + off) * 0.021 * freq + 1.7) * amp * 0.6;
      ctx.lineTo(X(wx), X(y));
    }
    ctx.lineTo(V.pxW, V.pxH);
    ctx.closePath();
    ctx.fill();
  }

  function drawGate(g) {
    var top = g.cy - g.gap / 2;
    var bot = g.cy + g.gap / 2;
    var x = X(g.x), w = X(CFG.gateW);
    var cx = x + w / 2;
    var sway = Math.sin(S.t * 1.1 + g.wob) * X(0.35);

    var img = IMG[g.obs], meta = COLUMNAS[g.obs];

    if (img && meta) {
      drawColumna(img, meta, cx + sway * 0.4, X(top), X(top) + X(6), w, true);
      drawColumna(img, meta, cx - sway * 0.4, X(bot), X(playH() - bot) + X(6), w, false);
    } else {
      // Sin sprite: tallos dibujados a mano. El juego nunca se queda sin obstaculos.
      var grad = ctx.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, '#123227');
      grad.addColorStop(0.45, '#1e5741');
      grad.addColorStop(1, '#0e2a20');
      ctx.fillStyle = grad;
      rrect(x + sway * 0.4, -X(6), w, X(top) + X(6), X(2.2)); ctx.fill();
      rrect(x - sway * 0.4, X(bot), w, X(playH() - bot) + X(6), X(2.2)); ctx.fill();

      if (g.cap) {
        ctx.fillStyle = '#2b6b4e';
        rrect(x - X(1.1) + sway * 0.4, X(top) - X(1.6), w + X(2.2), X(1.9), X(0.9)); ctx.fill();
        rrect(x - X(1.1) - sway * 0.4, X(bot) - X(0.3), w + X(2.2), X(1.9), X(0.9)); ctx.fill();
      }
    }

    // Labios del hueco encendidos, latiendo: marcan por donde hay que pasar.
    //
    // Va en modo 'lighter' (suma luz) y con degradado radial. Con un rectangulo y
    // alfa normal se veia el recuadro pintado encima del sombrero, como un parche.
    // Sumando luz, lo transparente no aporta nada y no queda borde.
    var pulso = 0.34 + 0.22 * Math.sin(S.t * 2.6 + g.wob);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    labioLuz(cx + sway * 0.4, X(top), w, pulso);
    labioLuz(cx - sway * 0.4, X(bot), w, pulso);
    ctx.restore();
  }

  function labioLuz(cxPx, yPx, wPx, fuerza) {
    var r = wPx * 0.95;
    var g = ctx.createRadialGradient(cxPx, yPx, 0, cxPx, yPx, r);
    g.addColorStop(0, 'rgba(120,255,205,' + (fuerza * 0.75).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(90,220,180,' + (fuerza * 0.28).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(60,180,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cxPx, yPx, r, r * 0.55, 0, 0, 6.2832);
    ctx.fill();
  }

  function drawMote(m) {
    var x = X(m.x), y = X(m.y + Math.sin(S.t * 2 + m.ph) * 0.5);
    var grande = m.v > 1;

    if (IMG.mota) {
      // Cada mota lleva su propia fase para que no destellen todas al unisono.
      var f = Math.floor((S.t * 9 + m.ph * 2)) % 4;
      var alto = X(grande ? 7.5 : 5.0);
      // El halo va debajo del sprite: le da presencia sobre un fondo oscuro.
      var g0 = ctx.createRadialGradient(x, y, 0, x, y, alto * 0.9);
      g0.addColorStop(0, grande ? 'rgba(255,212,94,0.45)' : 'rgba(255,240,184,0.30)');
      g0.addColorStop(1, 'rgba(255,240,184,0)');
      ctx.fillStyle = g0;
      ctx.beginPath(); ctx.arc(x, y, alto * 0.9, 0, 6.2832); ctx.fill();

      drawFrame(IMG.mota, 4, f, x, y, alto * (IMG.mota.width / 4) / IMG.mota.height);
      return;
    }

    var pulse = 0.75 + 0.25 * Math.sin(S.t * 3.4 + m.ph);
    var r = X(grande ? 2.0 : 1.25) * pulse;
    var c = grande ? '#ffd45e' : '#fff0b8';

    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, grande ? 'rgba(255,212,94,0.55)' : 'rgba(255,240,184,0.4)');
    g.addColorStop(1, 'rgba(255,240,184,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 6.2832); ctx.fill();

    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  function drawBird() {
    var sk = skin();
    var x = X(birdX()), y = X(S.bird.y);
    var r = X(CFG.birdR);

    // En el menu la luciernaga hace de mascota: se para en el centro, entre el record
    // y la lista de objetivos, y flota. En su sitio de juego se montaba sobre el texto.
    if (S.mode === 'menu') {
      x = V.pxW / 2;
      y = X(V.h * 0.455) + X(Math.sin(S.t * 1.6) * 0.9);
      r = X(CFG.birdR * 1.25);
    }

    // halo: es lo que lleva el color de la "luz" elegida en la tienda
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 5.5);
    g.addColorStop(0, sk.glow + 'cc');
    g.addColorStop(0.35, sk.glow + '55');
    g.addColorStop(1, sk.glow + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 5.5, 0, 6.2832); ctx.fill();

    if (IMG.luciernaga) {
      // Aletea sola a ritmo constante y se acelera al saltar: el aleteo rapido es lo
      // que hace legible que el toque hizo algo.
      var vel = S.bird.flapT > 0 ? 26 : 11;
      var f = Math.floor(S.t * vel) % 4;
      drawFrame(IMG.luciernaga, 4, f, x, y, r * 4.6, S.bird.rot * 0.5);

      // Un punto de luz del color de la skin sobre el farolito de la cola.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var gb = ctx.createRadialGradient(x - r * 1.1, y + r * 0.35, 0, x - r * 1.1, y + r * 0.35, r * 1.5);
      gb.addColorStop(0, sk.glow + 'aa');
      gb.addColorStop(1, sk.glow + '00');
      ctx.fillStyle = gb;
      ctx.beginPath(); ctx.arc(x - r * 1.1, y + r * 0.35, r * 1.5, 0, 6.2832); ctx.fill();
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(S.bird.rot * 0.5);

    // alas: van detras del cuerpo, aletean siempre y se abren de golpe al saltar
    var flapAmt = S.bird.flapT > 0 ? (S.bird.flapT / 0.16) : 0;
    var flutter = Math.sin(S.t * 26) * 0.22;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    for (var s = -1; s <= 1; s += 2) {
      ctx.save();
      ctx.translate(-r * 0.15, s * r * 0.34);
      ctx.rotate(s * (0.30 + flapAmt * 0.85 + flutter));
      ctx.beginPath();
      ctx.ellipse(-r * 0.6, 0, r * 0.95, r * 0.36, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    // cuerpo
    ctx.fillStyle = sk.body;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.9, 0, 0, 6.2832); ctx.fill();

    // farolito
    ctx.fillStyle = sk.glow;
    ctx.beginPath(); ctx.arc(-r * 0.75, r * 0.25, r * 0.55, 0, 6.2832); ctx.fill();

    // ojo
    ctx.fillStyle = '#26303f';
    ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.18, r * 0.17, 0, 6.2832); ctx.fill();

    ctx.restore();
  }

  function drawGround() {
    var y = X(playH());
    var g = ctx.createLinearGradient(0, y, 0, V.pxH);
    g.addColorStop(0, '#0d2a1f');
    g.addColorStop(1, '#061710');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, V.pxW, V.pxH - y);

    ctx.strokeStyle = 'rgba(120,255,200,0.25)';
    ctx.lineWidth = Math.max(1, X(0.2));
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(V.pxW, y); ctx.stroke();

    // matas de pasto: triangulitos de alto variable, no una peineta de palitos
    var step = 1.5;
    var off = -(S.scrollX % step);
    ctx.fillStyle = 'rgba(105,215,160,0.30)';
    ctx.beginPath();
    for (var wx = off - step; wx < V.w + step; wx += step) {
      var seed = Math.sin((wx + S.scrollX) * 12.9898) * 43758.5453;
      seed = seed - Math.floor(seed);
      var h = 0.8 + seed * 1.9;
      var lean = (seed - 0.5) * 1.2;
      ctx.moveTo(X(wx - 0.32), y);
      ctx.lineTo(X(wx + lean), y - X(h));
      ctx.lineTo(X(wx + 0.32), y);
    }
    ctx.fill();
  }

  function drawParts() {
    for (var i = 0; i < S.parts.length; i++) {
      var p = S.parts[i];
      var a = p.life / p.max;
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(X(p.x), X(p.y), X(p.r) * a, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- interfaz ---------- */

  function fontPx(u) { return Math.max(9, X(u)); }

  // Escribe con la tipografia de mapa de bits si ya cargo; si no, con la del sistema.
  // El tamano se pasa en unidades de mundo, igual que todo lo demas.
  function text(str, x, y, size, color, align, weight) {
    if (ASSETS.Fuente.lista()) {
      // La hoja mide el alto de MAYUSCULA; una fuente del sistema mide el em entero,
      // que es como un 30% mas alto. Se compensa para que ambas se vean del mismo porte.
      if (ASSETS.Fuente.dibujar(ctx, String(str), x, y, fontPx(size) * 0.72,
                                color, align || 'center', 'middle')) return;
    }
    ctx.font = (weight || '700') + ' ' + fontPx(size) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function textWidth(str, size) {
    if (ASSETS.Fuente.lista()) return ASSETS.Fuente.ancho(String(str), fontPx(size) * 0.72);
    ctx.font = '700 ' + fontPx(size) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    return ctx.measureText(String(str)).width;
  }

  function shadowText(str, x, y, size, color, align) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = X(0.8);
    ctx.shadowOffsetY = X(0.25);
    text(str, x, y, size, color, align);
    ctx.restore();
  }

  /*
   * Placa de boton en TRES CORTES: las dos puntas se dibujan a su tamano natural y solo
   * se estira el trozo del medio. Escalar la imagen entera deformaria las enredaderas
   * de los extremos, que es lo que delata un boton estirado.
   */
  function drawPlaca(img, x, y, w, h) {
    var iw = img.width, ih = img.height;
    var punta = 0.26;                       // fraccion decorada de cada extremo
    var srcP = iw * punta;
    var dstP = Math.min(h * (srcP / ih), w * 0.45);

    ctx.drawImage(img, 0, 0, srcP, ih, x, y, dstP, h);
    ctx.drawImage(img, iw - srcP, 0, srcP, ih, x + w - dstP, y, dstP, h);
    var medio = iw - srcP * 2;
    if (medio > 0 && w - dstP * 2 > 0) {
      ctx.drawImage(img, srcP, 0, medio, ih, x + dstP, y, w - dstP * 2, h);
    }
  }

  // La tira de iconos son 4 celdas: 0 polen, 1 hoja, 2 anuncio, 3 estrella.
  var ICONO = { POLEN: 0, HOJA: 1, ANUNCIO: 2, ESTRELLA: 3 };

  function drawIcono(i, cxPx, cyPx, altoPx, alpha) {
    var img = IMG.iconos;
    if (!img) return false;
    var cw = img.width / 4;
    var esc = altoPx / img.height;
    var w = cw * esc;
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, i * cw, 0, cw, img.height,
                  cxPx - w / 2, cyPx - altoPx / 2, w, altoPx);
    ctx.restore();
    return true;
  }

  function button(id, wx, wy, ww, wh, label, opts) {
    opts = opts || {};
    var x = X(wx), y = X(wy), w = X(ww), h = X(wh);
    S.buttons.push({ id: id, x: x, y: y, w: w, h: h, on: opts.on });

    var pulsado = (S.pressed === id);
    var placa = pulsado ? (IMG.botonPulsado || IMG.boton) : IMG.boton;

    if (placa) {
      ctx.save();
      if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = X(1.4); }
      drawPlaca(placa, x, y, w, h);
      ctx.restore();
    } else {
      ctx.save();
      if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = X(1.6); }
      ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.13)';
      rrect(x, y, w, h, X(1.6)); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = opts.border || 'rgba(255,255,255,0.28)';
      ctx.lineWidth = Math.max(1, X(0.16));
      rrect(x, y, w, h, X(1.6)); ctx.stroke();
    }

    var size = opts.size || 2.6;
    var cyTxt = y + h / 2 + (pulsado ? X(0.25) : 0);   // el texto se hunde con la placa
    var fg = opts.fg || (placa ? '#4a2c12' : '#ffffff');

    if (opts.icono !== undefined && IMG.iconos) {
      var ih = h * 0.52;
      var tw = textWidth(label, size);
      var sep = X(1.0);
      var totalW = tw + sep + ih;
      text(label, x + w / 2 - totalW / 2, cyTxt, size, fg, 'left');
      drawIcono(opts.icono, x + w / 2 + totalW / 2 - ih / 2, cyTxt, ih);
    } else {
      text(label, x + w / 2, cyTxt, size, fg);
    }
  }

  function pollenIcon(x, y, r) {
    if (drawIcono(ICONO.POLEN, x, y, r * 3.4)) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
    g.addColorStop(0, 'rgba(255,212,94,0.5)');
    g.addColorStop(1, 'rgba(255,212,94,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 3, 0, 6.2832); ctx.fill();
    ctx.fillStyle = '#ffd45e';
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  function drawHUD() {
    // polen arriba a la derecha
    var px = V.pxW - X(3.2);
    pollenIcon(px, X(4.2), X(1.0));
    shadowText(String(S.save.coins), px - X(2.2), X(4.2), 2.7, '#ffe9b8', 'right');

    if (S.mode === 'play') {
      shadowText(String(S.score), V.pxW / 2, X(8), 8, '#ffffff');
    }
  }

  function drawMenu() {
    var cx = V.pxW / 2;

    var logo = IMG.logo;
    var yTitulo = X(V.h * 0.24);
    var abajoTitulo;                     // donde termina de verdad el titulo

    if (logo) {
      var lw = Math.min(V.pxW * 0.72, X(Math.min(V.w * 0.80, 58)));
      var lh = lw * logo.height / logo.width;
      // Late suave: es lo primero que se ve y da sensacion de que el juego esta vivo.
      var lat = 1 + 0.022 * Math.sin(S.t * 1.7);
      ctx.save();
      ctx.translate(cx, yTitulo);
      ctx.scale(lat, lat);
      ctx.drawImage(logo, -lw / 2, -lh / 2, lw, lh);
      ctx.restore();
      abajoTitulo = yTitulo + lh / 2;
    } else {
      shadowText('LUMEN', cx, yTitulo, 8.5, '#fff6d6');
      abajoTitulo = yTitulo + X(4.5);
    }

    // El texto cuelga del BORDE del titulo, no de una fraccion fija de la pantalla:
    // el logo cambia de alto segun el ancho y si no, se le monta encima.
    shadowText(T('tap'), cx, abajoTitulo + X(4.5), 3, 'rgba(255,255,255,0.78)');
    shadowText(T('best') + ' ' + S.save.best, cx, abajoTitulo + X(10), 3, 'rgba(255,255,255,0.55)');

    // objetivos
    var ms = S.save.missions || [];
    var top = V.h * 0.55;
    shadowText(T('missions'), cx, X(top - 3.2), 2.4, 'rgba(255,255,255,0.5)');
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      var y = top + i * 5.2;
      var w = Math.min(V.w * 0.8, 52);
      var x = V.w / 2 - w / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      rrect(X(x), X(y), X(w), X(4.2), X(1.2)); ctx.fill();
      var prog = clamp(m.n / m.goal, 0, 1);
      ctx.fillStyle = m.ok ? 'rgba(140,255,200,0.35)' : 'rgba(255,224,138,0.28)';
      rrect(X(x), X(y), X(w * prog), X(4.2), X(1.2)); ctx.fill();
      text(missionLabel(m), X(x + 2), X(y + 2.1), 2.1, 'rgba(255,255,255,0.92)', 'left');
      if (m.ok) {
        // Cumplido: estrella en vez de la recompensa. Se lee de un vistazo.
        if (!drawIcono(ICONO.ESTRELLA, X(x + w - 3), X(y + 2.1), X(3.4))) {
          text('+' + m.rw, X(x + w - 2), X(y + 2.1), 2.1, '#8effc8', 'right');
        }
      } else {
        text('+' + m.rw, X(x + w - 2), X(y + 2.1), 2.1, '#ffe08a', 'right');
      }
    }

    var bw = Math.min(V.w * 0.5, 30);
    button('skins', V.w / 2 - bw / 2, V.h * 0.86, bw, 6.4, T('skins'), { glow: 'rgba(255,224,138,0.5)' });
  }

  function drawDead() {
    ctx.fillStyle = 'rgba(6,10,24,0.62)';
    ctx.fillRect(0, 0, V.pxW, V.pxH);

    var cx = V.pxW / 2;
    var top = V.h * 0.24;
    shadowText(String(S.score), cx, X(top), 11, '#ffffff');
    shadowText(T('best') + ' ' + S.save.best, cx, X(top + 8), 2.8, 'rgba(255,255,255,0.6)');

    pollenIcon(cx - X(3), X(top + 14), X(1.1));
    shadowText('+' + S.runPollen, cx + X(1.5), X(top + 14), 3.2, '#ffe9b8', 'left');

    var bw = Math.min(V.w * 0.62, 38);
    var bx = V.w / 2 - bw / 2;
    var y = V.h * 0.52;

    if (!S.revivedThisRun && S.score >= CFG.reviveMinScore) {
      button('revive', bx, y, bw, 7.4, T('revive'), {
        icono: ICONO.ANUNCIO,
        bg: 'rgba(120,255,200,0.18)', border: 'rgba(120,255,200,0.5)', glow: 'rgba(120,255,200,0.45)'
      });
      y += 8.6;
    }
    if (!S.doubledThisRun && S.runPollen > 0) {
      button('double', bx, y, bw, 7.4, T('dbl'), {
        icono: ICONO.ANUNCIO, size: 2.3,
        bg: 'rgba(255,212,94,0.16)', border: 'rgba(255,212,94,0.5)', glow: 'rgba(255,212,94,0.4)'
      });
      y += 8.6;
    }
    button('retry', bx, y, bw, 7.4, T('retry'), { bg: 'rgba(255,255,255,0.16)', glow: 'rgba(255,255,255,0.3)' });
    y += 9;
    button('skins', bx + bw * 0.2, y, bw * 0.6, 5.6, T('skins'), { size: 2.3 });
  }

  function drawSkins() {
    ctx.fillStyle = 'rgba(6,10,24,0.86)';
    ctx.fillRect(0, 0, V.pxW, V.pxH);

    shadowText(T('skins'), V.pxW / 2, X(V.h * 0.12), 5, '#fff6d6');
    pollenIcon(V.pxW / 2 - X(4), X(V.h * 0.19), X(1.0));
    shadowText(String(S.save.coins), V.pxW / 2 + X(0.5), X(V.h * 0.19), 3, '#ffe9b8', 'left');

    var cols = V.w > 80 ? 3 : 2;
    var rows = Math.ceil(SKINS.length / cols);
    var cw = Math.min(V.w * 0.86, 78) / cols;
    var chh = Math.min(cw * 0.92, (V.h * 0.55) / rows);
    var startX = V.w / 2 - (cw * cols) / 2;
    var startY = V.h * 0.26;

    // Marco de madera detras de la rejilla: sin el, la tienda es una lista flotando.
    if (IMG.panel) {
      var mx = startX - cw * 0.22, my = startY - chh * 0.26;
      var mw = cw * cols + cw * 0.44, mh = chh * rows + chh * 0.52;
      ctx.drawImage(IMG.panel, X(mx), X(my), X(mw), X(mh));
    }

    for (var i = 0; i < SKINS.length; i++) {
      var sk = SKINS[i];
      var c = i % cols, r = Math.floor(i / cols);
      var x = startX + c * cw + 1, y = startY + r * chh + 1;
      var w = cw - 2, h = chh - 2;
      var owned = S.save.owned.indexOf(sk.id) >= 0;
      var cur = S.save.skin === sk.id;

      S.buttons.push({ id: 'skin:' + sk.id, x: X(x), y: X(y), w: X(w), h: X(h) });

      ctx.fillStyle = cur ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
      rrect(X(x), X(y), X(w), X(h), X(1.8)); ctx.fill();
      ctx.strokeStyle = cur ? sk.glow : 'rgba(255,255,255,0.16)';
      ctx.lineWidth = Math.max(1, X(0.22));
      rrect(X(x), X(y), X(w), X(h), X(1.8)); ctx.stroke();

      // muestra de la luciernaga
      var mx = X(x + w / 2), my = X(y + h * 0.40), mr = X(Math.min(w, h) * 0.13);
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4);
      g.addColorStop(0, sk.glow + (owned ? 'bb' : '33'));
      g.addColorStop(1, sk.glow + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, mr * 4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = owned ? sk.body : 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(mx, my, mr * 1.05, mr * 0.9, 0, 0, 6.2832); ctx.fill();
      ctx.fillStyle = owned ? sk.glow : 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(mx - mr * 0.75, my + mr * 0.25, mr * 0.5, 0, 6.2832); ctx.fill();

      var label = cur ? T('inUse') : (owned ? T('use') : String(sk.cost));
      if (!owned) {
        pollenIcon(mx - X(w * 0.10), X(y + h * 0.78), X(0.8));
        text(label, mx + X(w * 0.02), X(y + h * 0.78), 2.3, S.save.coins >= sk.cost ? '#ffe9b8' : 'rgba(255,255,255,0.35)', 'left');
      } else {
        text(label, mx, X(y + h * 0.78), 2.3, cur ? sk.glow : 'rgba(255,255,255,0.8)');
      }
    }

    var bw = Math.min(V.w * 0.5, 30);
    button('back', V.w / 2 - bw / 2, V.h * 0.86, bw, 6.4, T('back'), {});
  }

  function drawToast() {
    if (!S.toast) return;
    var a = clamp(S.toast.life / 0.5, 0, 1);
    ctx.globalAlpha = a;
    var y = X(V.h * 0.155);

    // La pildora se mide sobre el texto: nunca lo corta, en ningun idioma ni ancho.
    var size = 2.7;
    var tw = textWidth(S.toast.text, size);
    var w = Math.min(tw + X(5), V.pxW - X(4));
    var h = X(6);

    ctx.fillStyle = 'rgba(6,10,24,0.72)';
    rrect(V.pxW / 2 - w / 2, y - h / 2, w, h, X(1.6)); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, X(0.14));
    rrect(V.pxW / 2 - w / 2, y - h / 2, w, h, X(1.6)); ctx.stroke();

    text(S.toast.text, V.pxW / 2, y, size, S.toast.color);
    ctx.globalAlpha = 1;
  }

  function drawAdVeil() {
    if (!S.adPending) return;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, V.pxW, V.pxH);
    text('...', V.pxW / 2, V.pxH / 2, 6, '#ffffff');
  }

  function render() {
    S.buttons.length = 0;

    ctx.save();
    if (S.shake > 0) {
      var s = S.shake * X(1.4);
      ctx.translate(rnd(-s, s), rnd(-s, s));
    }

    drawBackground();
    for (var i = 0; i < S.gates.length; i++) drawGate(S.gates[i]);
    for (var m = 0; m < S.motes.length; m++) drawMote(S.motes[m]);
    drawParts();
    if (S.mode !== 'skins') drawBird();
    drawGround();

    ctx.restore();

    drawHUD();
    if (S.mode === 'menu') drawMenu();
    else if (S.mode === 'dead') drawDead();
    else if (S.mode === 'skins') drawSkins();
    drawToast();
    drawAdVeil();
  }

  /* ============================ entrada ============================ */

  function hit(px, py) {
    for (var i = S.buttons.length - 1; i >= 0; i--) {
      var b = S.buttons[i];
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
    }
    return null;
  }

  var prevMode = 'menu';

  function press(px, py) {
    SFX.unlock();
    if (S.adPending) return;

    var b = hit(px, py);
    if (b) {
      // Hunde la placa un instante: sin esto el boton se siente muerto.
      S.pressed = b.id;
      setTimeout(function () { if (S.pressed === b.id) S.pressed = null; }, 130);

      if (b.id === 'skins') { prevMode = S.mode; S.mode = 'skins'; return; }
      if (b.id === 'back')  { S.mode = prevMode === 'skins' ? 'menu' : prevMode; return; }
      if (b.id === 'retry') { restart(); return; }
      if (b.id === 'revive'){ doRevive(); return; }
      if (b.id === 'double'){ doDouble(); return; }
      if (b.id.indexOf('skin:') === 0) {
        var id = b.id.slice(5);
        for (var i = 0; i < SKINS.length; i++) if (SKINS[i].id === id) buySkin(SKINS[i]);
        return;
      }
    }

    if (S.mode === 'menu' || S.mode === 'play') flap();
    // En 'dead' no se reinicia con un toque suelto: evita reinicios accidentales
    // justo cuando aparecen los botones.
  }

  function onPointer(e) {
    e.preventDefault();
    var r = cv.getBoundingClientRect();
    var t = (e.touches && e.touches[0]) || e;
    press((t.clientX - r.left) * V.dpr, (t.clientY - r.top) * V.dpr);
  }

  cv.addEventListener('pointerdown', onPointer, { passive: false });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      // Requisito de plataforma: Esc cierra los paneles y NO se bloquea.
      if (S.mode === 'skins') S.mode = prevMode === 'skins' ? 'menu' : prevMode;
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
      e.preventDefault();
      if (S.mode === 'dead') { restart(); return; }
      if (S.mode === 'skins') return;
      SFX.unlock();
      flap();
    }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 60); });

  /* ============================ arranque ============================ */

  var lastT = 0, acc = 0;
  var STEP = 1 / 120;

  function frame(ts) {
    var now = ts / 1000;
    var dt = lastT ? Math.min(0.25, now - lastT) : 0;
    lastT = now;

    acc += dt;
    var guard = 0;
    while (acc >= STEP && guard++ < 12) { update(STEP); acc -= STEP; }

    render();

    if (!S.booted) {
      S.booted = true;
      // Primer fotograma con contenido real ya pintado.
      YT.firstFrameReady();
      YT.gameReady();
    }

    requestAnimationFrame(frame);
  }

  // Todo lo que el juego pinta si esta disponible. Si falta cualquiera de estos, se
  // dibuja el respaldo procedural: nunca es un error fatal.
  var MANIFIESTO = {
    logo:        'assets/logo.webp',
    fuente:      'assets/fuente.png',
    obsHongo:    'assets/obs-hongo.webp',
    obsTronco:   'assets/obs-tronco.webp',
    obsCristal:  'assets/obs-cristal.webp',
    obsTotem:    'assets/obs-totem.webp',
    fondoNoche:  'assets/fondo-noche.webp',
    fondoAlba:   'assets/fondo-alba.webp',
    fondoBruma:  'assets/fondo-bruma.webp',
    fondoAurora: 'assets/fondo-aurora.webp',
    luciernaga:  'assets/luciernaga.webp',
    mota:        'assets/mota.webp',
    boton:       'assets/boton.webp',
    botonPulsado:'assets/boton-pulsado.webp',
    panel:       'assets/panel.webp',
    iconos:      'assets/iconos.webp'
  };

  function boot() {
    resize();
    initStars();

    // Se cargan en paralelo y el juego NO espera: arranca dibujado a mano y los sprites
    // entran solos cuando llegan. Asi el "jugable en 5 segundos" no depende de la red.
    var fuenteLista = false;
    var engancharFuente = function () {
      if (!fuenteLista && IMG.fuente && window.FUENTE_DATOS) {
        ASSETS.Fuente.init(IMG.fuente, window.FUENTE_DATOS);
        fuenteLista = true;
      }
    };
    ASSETS.cargar(MANIFIESTO, engancharFuente, engancharFuente);

    YT.boot(function () {
      SFX.setEnabled(YT.isAudioEnabled());
      YT.setAudioChangeCallback(function (on) { SFX.setEnabled(on); });
      YT.setOnPause(function () { S.paused = true; });
      YT.setOnResume(function () { S.paused = false; });

      YT.loadData().then(function (d) {
        if (d && typeof d === 'object') {
          S.save.best = d.best || 0;
          S.save.coins = d.coins || 0;
          S.save.runs = d.runs || 0;
          S.save.owned = Array.isArray(d.owned) && d.owned.length ? d.owned : ['lumen'];
          S.save.skin = S.save.owned.indexOf(d.skin) >= 0 ? d.skin : 'lumen';
          S.save.missions = Array.isArray(d.missions) && d.missions.length ? d.missions : null;
        }
        if (!S.save.missions) S.save.missions = newMissions();
        resetRun(false);
        S.mode = 'menu';
      });

      resetRun(false);
      requestAnimationFrame(frame);
    });

    // Gancho de pruebas: permite pilotar el juego desde un script de QA.
    window.__lumen = { S: S, V: V, CFG: CFG, flap: flap, birdX: birdX, playH: playH };
  }

  boot();
})();
