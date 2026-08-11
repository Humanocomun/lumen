# Lumen

Una luciérnaga cruzando el bosque de noche. Un toque para volar.

Juego HTML5 hecho para **YouTube Playables**: sin dependencias, sin build, sin imágenes.
Todo el arte y el sonido son procedurales (Canvas 2D + WebAudio), así que el bundle pesa
unas decenas de KB y la partida arranca al instante.

**Jugar:** https://humanocomun.github.io/lumen/

## Controles

- Toque o clic para aletear.
- Espacio / Flecha arriba / W también.
- Esc cierra los paneles.

## Cómo está armado

| Archivo | Qué hace |
|---|---|
| `index.html` | Contenedor. Carga el SDK de Playables **antes** que el juego. |
| `src/yt.js` | Envoltura del SDK: ciclo de vida, guardado, idioma, audio y anuncios. Funciona igual fuera de YouTube. |
| `src/audio.js` | Efectos sintetizados con WebAudio. Cero archivos de audio. |
| `src/game.js` | El juego entero: física, mundo, meta-progresión y dibujo. |
| `qa/autopilot.js` | Piloto automático para probar dificultad y que el bucle no se rompa. |

## Requisitos de plataforma que ya cumple

- Se adapta a cualquier aspect ratio y al redimensionar sin perder el estado de la partida.
- No bloquea la orientación.
- Táctil, mouse y teclado.
- Sin links externos, sin botón de compartir, sin botón de salir, sin botón de mute
  (el audio lo manda YouTube vía `system.isAudioEnabled`).
- `firstFrameReady()` y luego `gameReady()`, en ese orden.
- Guardado con `game.saveData` / `game.loadData`, con respaldo en `localStorage` fuera de YouTube.
- Anuncios: interstitial en corte natural (al reintentar, cada 3 partidas) y rewarded
  opcionales (revivir y doblar el polen).

## Probar en local

```bash
python -m http.server 8123
# abrir http://127.0.0.1:8123/
```

Para el piloto automático, con la pestaña **en primer plano** (si está oculta, el navegador
baja `requestAnimationFrame` a ~2 fps y la prueba miente):

```js
await fetch('/qa/autopilot.js').then(r => r.text()).then(eval);
await lumenQA({ runs: 5 });
```

## Créditos

`src/yt.js` está basado en el helper `YouTubePlayables.js` de la plantilla oficial de
Phaser para YouTube Playables (MIT), reescrito como script clásico y ampliado con anuncios.
Ver `NOTICE`.

Todo lo demás es original.
