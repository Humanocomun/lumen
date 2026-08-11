/*
 * Carga de imagenes y tipografia de mapa de bits.
 *
 * Regla de oro: el juego NUNCA espera por los assets. Se dibuja igual con el arte
 * procedural desde el primer fotograma, y los sprites entran cuando llegan. Asi el
 * requisito de "jugable en menos de 5 segundos" no depende de la red.
 */
(function (global) {
  'use strict';

  var IMG = {};        // nombre -> HTMLImageElement ya cargado
  var listo = {};      // nombre -> true

  function cargar(manifiesto, alTerminar, alProgresar) {
    var claves = Object.keys(manifiesto);
    var total = claves.length, hechos = 0;
    if (!total) { if (alTerminar) alTerminar(); return; }

    claves.forEach(function (k) {
      var im = new Image();
      im.onload = function () {
        IMG[k] = im; listo[k] = true;
        hechos++;
        if (alProgresar) alProgresar(hechos / total);
        if (hechos === total && alTerminar) alTerminar();
      };
      im.onerror = function () {
        // Un asset que falta no rompe nada: se sigue con el dibujo procedural.
        console.warn('asset no disponible: ' + manifiesto[k]);
        hechos++;
        if (alProgresar) alProgresar(hechos / total);
        if (hechos === total && alTerminar) alTerminar();
      };
      im.src = manifiesto[k];
    });
  }

  /* ---------------- tintado de sprites ---------------- */
  /*
   * Devuelve una copia coloreada de una imagen, conservando el sombreado y el contorno.
   *
   * El truco es 'multiply': multiplicar por un color claro tine las zonas claras y deja
   * las oscuras oscuras, que es justo lo que hace que siga pareciendo el mismo dibujo y
   * no una silueta plana. Despues 'destination-in' devuelve el alfa original, porque el
   * fillRect habia pintado tambien el vacio.
   *
   * Se cachea por imagen+color: tintar en cada fotograma seria carisimo.
   */
  var _tintes = {};
  var _tintesOrden = [];

  function tinte(img, color, fuerza) {
    if (!img) return null;
    if (fuerza === undefined) fuerza = 1;
    var clave = (img.src || 'img') + '|' + color + '|' + fuerza;
    if (_tintes[clave]) return _tintes[clave];

    var c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    var x = c.getContext('2d');

    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.globalAlpha = fuerza;
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);

    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);

    _tintes[clave] = c;
    _tintesOrden.push(clave);
    while (_tintesOrden.length > 24) delete _tintes[_tintesOrden.shift()];
    return c;
  }

  /* ---------------- tipografia de mapa de bits ---------------- */
  /*
   * La hoja viene como mascara: blanco solido con alfa = tinta. Para pintarla de un
   * color se tinta la hoja ENTERA una sola vez por color y se cachea; despues cada
   * letra es un blit. Tintar letra por letra en cada fotograma seria carisimo.
   */

  var Fuente = {
    hoja: null,
    met: null,
    _cache: {},
    _orden: [],

    init: function (img, metricas) {
      this.hoja = img;
      this.met = metricas;
      this._cache = {};
      this._orden = [];
    },

    lista: function () { return !!(this.hoja && this.met); },

    _tintada: function (color) {
      if (this._cache[color]) return this._cache[color];

      var c = document.createElement('canvas');
      c.width = this.hoja.width;
      c.height = this.hoja.height;
      var x = c.getContext('2d');
      x.drawImage(this.hoja, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);

      this._cache[color] = c;
      this._orden.push(color);
      // Techo de memoria: con mas de 12 colores algo se esta usando mal.
      while (this._orden.length > 12) {
        delete this._cache[this._orden.shift()];
      }
      return c;
    },

    // Espacio entre letras y ancho del espacio, como fraccion del alto de mayuscula.
    _kern: 0.10,
    _espacio: 0.34,

    ancho: function (texto, alto) {
      if (!this.lista()) return 0;
      var esc = alto / this.met.altoCaja;
      var w = 0;
      for (var i = 0; i < texto.length; i++) {
        var ch = texto[i].toUpperCase();
        if (ch === ' ') { w += this.met.altoCaja * this._espacio * esc; continue; }
        var g = this.met.glifos[ch];
        if (!g) { w += this.met.altoCaja * this._espacio * esc; continue; }
        w += g.w * esc + this.met.altoCaja * this._kern * esc;
      }
      return Math.max(0, w - this.met.altoCaja * this._kern * esc);
    },

    /*
     * Escribe `texto` con el alto de mayuscula en `alto` pixeles.
     * (x, y) es el punto de anclaje; `align` puede ser 'left' | 'center' | 'right'
     * y `baseline` 'alphabetic' | 'middle'.
     */
    dibujar: function (ctx, texto, x, y, alto, color, align, baseline) {
      if (!this.lista()) return false;

      var esc = alto / this.met.altoCaja;
      var hoja = this._tintada(color || '#ffffff');
      var total = this.ancho(texto, alto);

      var px = x;
      if (align === 'center') px = x - total / 2;
      else if (align === 'right') px = x - total;

      var linea = y;
      if (baseline === 'middle') linea = y + alto / 2;

      for (var i = 0; i < texto.length; i++) {
        var ch = texto[i].toUpperCase();
        if (ch === ' ') { px += this.met.altoCaja * this._espacio * esc; continue; }
        var g = this.met.glifos[ch];
        if (!g) { px += this.met.altoCaja * this._espacio * esc; continue; }

        // `bajo` es cuanto cae la base del glifo por debajo de la linea de escritura:
        // 0 en las mayusculas, positivo en la coma y los parentesis, negativo en el
        // guion y las comillas. De ahi sale el techo del sprite.
        var top = linea + (g.bajo - g.h) * esc;
        ctx.drawImage(hoja, g.x, g.y, g.w, g.h,
                      px, top, g.w * esc, g.h * esc);
        px += g.w * esc + this.met.altoCaja * this._kern * esc;
      }
      return true;
    }
  };

  global.ASSETS = { IMG: IMG, listo: listo, cargar: cargar, tinte: tinte, Fuente: Fuente };
})(window);
