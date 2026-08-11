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

  var BIOMES = [
    { sky: ['#0a1030', '#1b2a5e', '#2d4a7c'], hill1: '#0b1330', hill2: '#131f47', fog: 'rgba(90,130,200,0.10)', star: 0.9 },
    { sky: ['#2a1442', '#5b2a5e', '#a9527a'], hill1: '#1d0f2e', hill2: '#301a44', fog: 'rgba(255,150,180,0.09)', star: 0.35 },
    { sky: ['#08282c', '#0f4a4a', '#1d7a68'], hill1: '#062024', hill2: '#0c3436', fog: 'rgba(140,255,220,0.09)', star: 0.55 },
    { sky: ['#161033', '#243a7a', '#2f7f9c'], hill1: '#0d0b24', hill2: '#171a3e', fog: 'rgba(120,255,240,0.12)', star: 1.0 }
  ];

  var STR = {
    es: {
      tap: 'Toca para volar', best: 'Mejor', skins: 'Luces', back: 'Volver',
      retry: 'Otra vez', revive: 'Seguir', dbl: 'Doble polen', locked: 'Bloqueada',
      use: 'Usar', inUse: 'En uso', newBest: 'Nuevo record', missions: 'Objetivos',
      mGates: 'Cruza {n} puertas', mPollen: 'Junta {n} motas', mRuns: 'Juega {n} partidas',
      done: 'Listo', ad: 'Anuncio'
    },
    en: {
      tap: 'Tap to fly', best: 'Best', skins: 'Lights', back: 'Back',
      retry: 'Again', revive: 'Continue', dbl: 'Double pollen', locked: 'Locked',
      use: 'Use', inUse: 'In use', newBest: 'New best', missions: 'Goals',
      mGates: 'Pass {n} gates', mPollen: 'Collect {n} motes', mRuns: 'Play {n} runs',
      done: 'Done', ad: 'Ad'
    }
  };

  /* ============================ estado global ============================ */

  var cv = document.getElementById('c');
  var ctx = cv.getContext('2d', { alpha: false });

  var V = { pxW: 0, pxH: 0, u: 1, w: 0, h: 0, dpr: 1 };

  var S = {
    mode: 'menu',        // menu | play | dead | skins
    lang: 'en',
    t: 0,
    paused: false,
    booted: false,

    bird: { y: 50, vy: 0, rot: 0, flapT: 0 },
    gates: [],
    motes: [],
    parts: [],
    scrollX: 0,
    speed: CFG.speed0,

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
    adPending: false
  };

  function T(k) { return (STR[S.lang] || STR.en)[k] || STR.en[k] || k; }

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

  function biome() {
    return BIOMES[Math.floor(S.passed / CFG.biomeEvery) % BIOMES.length];
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
    return { x: x, cy: cy, gap: g, passed: false, wob: rnd(0, 6.28), cap: Math.random() < 0.5 };
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

  var stars = [];
  function initStars() {
    stars.length = 0;
    for (var i = 0; i < 90; i++) {
      stars.push({ x: Math.random(), y: Math.random() * 0.75, s: rnd(0.35, 1.1), ph: rnd(0, 6.28) });
    }
  }

  function drawBackground() {
    var B = biome();
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
    var sway = Math.sin(S.t * 1.1 + g.wob) * X(0.35);

    var grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#123227');
    grad.addColorStop(0.45, '#1e5741');
    grad.addColorStop(1, '#0e2a20');

    // tallo superior
    ctx.fillStyle = grad;
    rrect(x + sway * 0.4, -X(6), w, X(top) + X(6), X(2.2)); ctx.fill();
    // tallo inferior
    rrect(x - sway * 0.4, X(bot), w, X(playH() - bot) + X(6), X(2.2)); ctx.fill();

    // borde luminoso en los labios del hueco
    var glow = ctx.createLinearGradient(0, X(top) - X(2), 0, X(top));
    glow.addColorStop(0, 'rgba(120,255,200,0)');
    glow.addColorStop(1, 'rgba(120,255,200,0.55)');
    ctx.fillStyle = glow;
    ctx.fillRect(x + sway * 0.4, X(top) - X(2), w, X(2));

    var glow2 = ctx.createLinearGradient(0, X(bot), 0, X(bot) + X(2));
    glow2.addColorStop(0, 'rgba(120,255,200,0.55)');
    glow2.addColorStop(1, 'rgba(120,255,200,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(x - sway * 0.4, X(bot), w, X(2));

    // sombrerito de hongo en un lado, para que no sean dos tubos iguales
    if (g.cap) {
      ctx.fillStyle = '#2b6b4e';
      rrect(x - X(1.1) + sway * 0.4, X(top) - X(1.6), w + X(2.2), X(1.9), X(0.9)); ctx.fill();
      ctx.fillStyle = '#2b6b4e';
      rrect(x - X(1.1) - sway * 0.4, X(bot) - X(0.3), w + X(2.2), X(1.9), X(0.9)); ctx.fill();
    }
  }

  function drawMote(m) {
    var pulse = 0.75 + 0.25 * Math.sin(S.t * 3.4 + m.ph);
    var r = X(m.v > 1 ? 2.0 : 1.25) * pulse;
    var x = X(m.x), y = X(m.y + Math.sin(S.t * 2 + m.ph) * 0.5);
    var c = m.v > 1 ? '#ffd45e' : '#fff0b8';

    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, m.v > 1 ? 'rgba(255,212,94,0.55)' : 'rgba(255,240,184,0.4)');
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

    // halo
    var g = ctx.createRadialGradient(x, y, 0, x, y, r * 5.5);
    g.addColorStop(0, sk.glow + 'cc');
    g.addColorStop(0.35, sk.glow + '55');
    g.addColorStop(1, sk.glow + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r * 5.5, 0, 6.2832); ctx.fill();

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

  function text(str, x, y, size, color, align, weight) {
    ctx.font = (weight || '700') + ' ' + fontPx(size) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function shadowText(str, x, y, size, color, align) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = X(0.8);
    ctx.shadowOffsetY = X(0.25);
    text(str, x, y, size, color, align);
    ctx.restore();
  }

  function button(id, wx, wy, ww, wh, label, opts) {
    opts = opts || {};
    var x = X(wx), y = X(wy), w = X(ww), h = X(wh);
    S.buttons.push({ id: id, x: x, y: y, w: w, h: h, on: opts.on });

    ctx.save();
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = X(1.6);
    }
    ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.13)';
    rrect(x, y, w, h, X(1.6)); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = opts.border || 'rgba(255,255,255,0.28)';
    ctx.lineWidth = Math.max(1, X(0.16));
    rrect(x, y, w, h, X(1.6)); ctx.stroke();

    text(label, x + w / 2, y + h / 2, opts.size || 2.6, opts.fg || '#ffffff');
  }

  function pollenIcon(x, y, r) {
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
    shadowText('LUMEN', cx, X(V.h * 0.26), 8.5, '#fff6d6');
    shadowText(T('tap'), cx, X(V.h * 0.36), 3, 'rgba(255,255,255,0.75)');
    shadowText(T('best') + ' ' + S.save.best, cx, X(V.h * 0.43), 3, 'rgba(255,255,255,0.55)');

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
      text(missionLabel(m), X(x + 2), X(y + 2.1), 2.1, 'rgba(255,255,255,0.9)', 'left');
      text('+' + m.rw, X(x + w - 2), X(y + 2.1), 2.1, '#ffe08a', 'right');
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
      button('revive', bx, y, bw, 7, T('revive') + '   ▶ ' + T('ad'), {
        bg: 'rgba(120,255,200,0.18)', border: 'rgba(120,255,200,0.5)', glow: 'rgba(120,255,200,0.4)'
      });
      y += 8.6;
    }
    if (!S.doubledThisRun && S.runPollen > 0) {
      button('double', bx, y, bw, 7, T('dbl') + '   ▶ ' + T('ad'), {
        bg: 'rgba(255,212,94,0.16)', border: 'rgba(255,212,94,0.5)', glow: 'rgba(255,212,94,0.35)'
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
    ctx.font = '700 ' + fontPx(size) + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    var tw = ctx.measureText(S.toast.text).width;
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

  function boot() {
    resize();
    initStars();

    S.lang = (function () {
      var l = (navigator.language || 'en').toLowerCase();
      return l.indexOf('es') === 0 ? 'es' : 'en';
    })();

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
