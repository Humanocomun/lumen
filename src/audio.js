/*
 * Sonido 100% sintetizado con WebAudio. Cero archivos de audio: el bundle no crece
 * y no hay licencias de terceros que justificar en la certificacion.
 * Respeta el estado de audio de YouTube (system.isAudioEnabled).
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(opts) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    var t0 = c.currentTime;
    var osc = c.createOscillator();
    var gain = c.createGain();

    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.from, t0);
    if (opts.to && opts.to !== opts.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
    }

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.vol || 0.5, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  function noise(dur, vol) {
    if (!enabled) return;
    var c = ensure();
    if (!c) return;
    if (c.state === 'suspended') c.resume();

    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);

    var src = c.createBufferSource();
    src.buffer = buf;
    var g = c.createGain();
    g.gain.value = vol || 0.35;
    var f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  global.SFX = {
    setEnabled: function (v) {
      enabled = !!v;
      if (master) master.gain.value = enabled ? 0.22 : 0;
    },
    unlock: function () {
      var c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    flap:  function () { tone({ type: 'sine',     from: 520, to: 760, dur: 0.09, vol: 0.28 }); },
    coin:  function (n) {
      var base = 880 * Math.pow(1.0595, Math.min(12, n || 0));
      tone({ type: 'triangle', from: base, to: base * 1.5, dur: 0.11, vol: 0.32 });
    },
    gate:  function () { tone({ type: 'sine', from: 660, to: 990, dur: 0.13, vol: 0.24 }); },
    hit:   function () { noise(0.28, 0.4); tone({ type: 'sawtooth', from: 210, to: 60, dur: 0.32, vol: 0.3 }); },
    unlockSkin: function () {
      tone({ type: 'triangle', from: 660,  to: 990,  dur: 0.14, vol: 0.3 });
      setTimeout(function () { tone({ type: 'triangle', from: 990, to: 1320, dur: 0.2, vol: 0.3 }); }, 110);
    },
    revive: function () {
      tone({ type: 'sine', from: 330, to: 880, dur: 0.35, vol: 0.3 });
    }
  };
})(window);
