/*
 * Piloto automatico de QA para Lumen.
 * Se pega en la consola del navegador (o se inyecta con Playwright) y juega solo,
 * apuntando al centro del hueco siguiente. Sirve para medir dificultad, verificar
 * que el bucle no se rompe y que los botones de fin de partida responden.
 *
 * OJO: requiere que la pestana este EN PRIMER PLANO. Si esta oculta, el navegador
 * baja requestAnimationFrame a ~2 fps y la prueba miente (el juego "muere solo").
 *
 * Uso:  await lumenQA({ runs: 5, maxMs: 60000 })
 */
window.lumenQA = async function (opts) {
  opts = opts || {};
  var maxRuns = opts.runs || 5;
  var maxMs = opts.maxMs || 60000;

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var L = window.__lumen;
  if (!L) return { error: 'sin __lumen: el juego no arranco' };

  var S = L.S, V = L.V, cv = document.getElementById('c');

  function click(id) {
    var b = null;
    for (var i = 0; i < S.buttons.length; i++) if (S.buttons[i].id === id) b = S.buttons[i];
    if (!b) return false;
    cv.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: (b.x + b.w / 2) / V.dpr,
      clientY: (b.y + b.h / 2) / V.dpr,
      bubbles: true
    }));
    return true;
  }

  // fps real, para saber si la medicion vale
  var fps = await new Promise(function (r) {
    var n = 0, t = performance.now();
    var tick = function () { n++; if (performance.now() - t < 1000) requestAnimationFrame(tick); else r(n); };
    requestAnimationFrame(tick);
  });

  if (S.mode === 'menu') cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5, bubbles: true }));
  await sleep(150);

  var runs = [], prev = S.mode, t0 = performance.now();

  while (performance.now() - t0 < maxMs && runs.length < maxRuns) {
    if (S.mode === 'play') {
      var bx = L.birdX(), target = L.playH() * 0.5;
      for (var i = 0; i < S.gates.length; i++) {
        var g = S.gates[i];
        if (g.x + L.CFG.gateW > bx - 0.5) { target = g.cy; break; }
      }
      if (S.bird.y > target - 2.5 && S.bird.vy > -18) L.flap();
    }

    if (S.mode === 'dead' && prev === 'play') {
      await sleep(400);
      var hasRevive = false, hasDouble = false;
      for (var j = 0; j < S.buttons.length; j++) {
        if (S.buttons[j].id === 'revive') hasRevive = true;
        if (S.buttons[j].id === 'double') hasDouble = true;
      }
      runs.push({
        puntaje: S.score, polen: S.runPollen,
        biomas: Math.floor(S.passed / L.CFG.biomeEvery),
        botones: { revive: hasRevive, doble: hasDouble }
      });
      click('retry');
      await sleep(300);
    }

    prev = S.mode;
    await sleep(16);
  }

  return {
    fps: fps,
    fiable: fps > 30,
    partidas: runs,
    mejor: S.save.best,
    polenTotal: S.save.coins,
    partidasTotales: S.save.runs,
    misiones: S.save.missions.map(function (m) { return m.t + ' ' + m.n + '/' + m.goal + (m.ok ? ' OK' : ''); }),
    mundo: { w: Math.round(V.w), h: Math.round(V.h) }
  };
};
