/*
 * Envoltura del SDK de YouTube Playables.
 * Basada en el helper oficial de la plantilla de Phaser (MIT), adaptada a script clasico
 * y ampliada con anuncios (interstitial / rewarded).
 *
 * Todo metodo es seguro fuera del entorno de Playables: si el SDK no esta, no revienta,
 * asi el juego se puede probar en local y en cualquier hosting.
 */
(function (global) {
  'use strict';

  var YT = {
    version: 'unloaded',
    inPlayablesEnv: false,

    _ref: null,
    _firstFrameReady: false,
    _gameReady: false,
    _language: 'unavailable',
    _unsetAudioCb: null,
    _adInFlight: false,

    boot: function (onLoaded) {
      var done = function () {
        if (global.ytgame) {
          YT._ref = global.ytgame;
          YT.version = YT._ref.SDK_VERSION;
          YT.inPlayablesEnv = YT._ref.IN_PLAYABLES_ENV;
        } else {
          console.warn('SDK de YouTube Playables no disponible (modo local).');
        }
        onLoaded();
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        done();
        return;
      }
      var check = function () {
        document.removeEventListener('DOMContentLoaded', check, true);
        global.removeEventListener('load', check, true);
        done();
      };
      if (!document.body) {
        global.setTimeout(check, 20);
      } else {
        document.addEventListener('DOMContentLoaded', check, true);
        global.addEventListener('load', check, true);
      }
    },

    isLoaded: function () { return !!(this._ref && this.inPlayablesEnv); },
    isFirstFrameReady: function () { return this._firstFrameReady; },
    isGameReady: function () { return this._gameReady; },
    isReady: function () { return this.isLoaded() && this._firstFrameReady && this._gameReady; },

    // Se llama en cuanto se pinta el primer fotograma con contenido real.
    firstFrameReady: function () {
      if (!this.isLoaded() || this._firstFrameReady) return;
      try { this._ref.game.firstFrameReady(); this._firstFrameReady = true; } catch (e) { this.logError(); }
    },

    // Se llama cuando el jugador ya puede interactuar. Siempre despues de firstFrameReady.
    gameReady: function () {
      if (!this.isLoaded() || this._gameReady) return;
      if (!this._firstFrameReady) { console.error('gameReady antes de firstFrameReady'); return; }
      try { this._ref.game.gameReady(); this._gameReady = true; } catch (e) { this.logError(); }
    },

    sendScore: function (score) {
      if (!this.isReady()) return;
      try { this._ref.engagement.sendScore({ value: score }); } catch (e) { /* no bloquea el juego */ }
    },

    setOnPause: function (cb) { if (this.isLoaded()) { try { this._ref.system.onPause(cb); } catch (e) {} } },
    setOnResume: function (cb) { if (this.isLoaded()) { try { this._ref.system.onResume(cb); } catch (e) {} } },

    isAudioEnabled: function () {
      if (!this.isLoaded()) return true;
      try { return this._ref.system.isAudioEnabled(); } catch (e) { return true; }
    },

    setAudioChangeCallback: function (cb) {
      if (!this.isLoaded()) return;
      try {
        if (this._unsetAudioCb) this._unsetAudioCb();
        this._unsetAudioCb = this._ref.system.onAudioEnabledChange(cb);
      } catch (e) {}
    },

    /* ---------- persistencia ---------- */
    // Dentro de Playables usa el almacenamiento del SDK; fuera, localStorage.
    loadData: function () {
      var self = this;
      return new Promise(function (resolve) {
        if (self.isLoaded()) {
          self._ref.game.loadData().then(function (raw) {
            if (!raw) { resolve(null); return; }
            try { resolve(JSON.parse(raw)); }
            catch (e) { self.logError(); resolve(null); }
          }).catch(function () { self.logError(); resolve(null); });
        } else {
          try { resolve(JSON.parse(localStorage.getItem('lumen.save') || 'null')); }
          catch (e) { resolve(null); }
        }
      });
    },

    saveData: function (data) {
      var self = this;
      return new Promise(function (resolve) {
        var json;
        try { json = JSON.stringify(data); } catch (e) { resolve(false); return; }
        // El SDK exige UTF-16 valido: fuera los sustitutos sueltos.
        json = json.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
                   .replace(/(^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/g, '$1');
        if (self.isLoaded()) {
          self._ref.game.saveData(json).then(function () { resolve(true); })
            .catch(function () { self.logError(); resolve(false); });
        } else {
          try { localStorage.setItem('lumen.save', json); resolve(true); } catch (e) { resolve(false); }
        }
      });
    },

    /* ---------- anuncios ---------- */
    // Interstitial: en un corte natural. Devuelve una promesa que siempre resuelve.
    interstitial: function () {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.isReady() || self._adInFlight) { resolve(false); return; }
        var api = self._ref.ads;
        if (!api || !api.requestInterstitialAd) { resolve(false); return; }
        self._adInFlight = true;
        api.requestInterstitialAd()
          .then(function () { self._adInFlight = false; resolve(true); })
          .catch(function () { self._adInFlight = false; resolve(false); });
      });
    },

    // Rewarded: el jugador lo pide a cambio de algo. resolve(true) => hay que dar el premio.
    rewarded: function (rewardId) {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.isReady() || self._adInFlight) { resolve(false); return; }
        var api = self._ref.ads;
        if (!api || !api.requestRewardedAd) { resolve(false); return; }
        self._adInFlight = true;
        api.requestRewardedAd(rewardId)
          .then(function () { self._adInFlight = false; resolve(true); })
          .catch(function () { self._adInFlight = false; resolve(false); });
      });
    },

    adBusy: function () { return this._adInFlight; },

    logError: function () { if (this.isLoaded()) { try { this._ref.health.logError(); } catch (e) {} } },
    logWarning: function () { if (this.isLoaded()) { try { this._ref.health.logWarning(); } catch (e) {} } }
  };

  global.YT = YT;
})(window);
