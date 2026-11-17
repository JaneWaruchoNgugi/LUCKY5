# Lucky Five

A browser ball game prototype. Numbered balls (1–75) slide past a marker on a timer, and each ball carries a multiplier. Before the next ball, pick a colour group:

| Group | Colour | Numbers |
|---|---|---|
| B | Blue | 1–15 |
| I | Red | 16–30 |
| N | Grey | 31–45 |
| G | Green | 46–60 |
| O | Orange | 61–75 |

If the ball that lands is in your group, you win your bet × that ball's multiplier.

Multiplier odds: 1.55× 40%, 3.2× 25%, 5× 15%, 8× 10%, 12× 6%, 25× 3%, 50× 1% (average 4.94×, about 98.8% return to player).

## Features

- Rounds run automatically: 5 s betting window, slide, 2 s result.
- Manual and Auto betting (10 / 25 / 50 / 100 rounds).
- Bet input (default KES 10, any amount up to your balance) with − / + and quick amounts (10, 20, 50, 100, 200).
- Canvas-drawn rail with a row of previous results, plus a round log.
- Sounds made with the Web Audio API (no audio files), with a settings menu: on/off, volume, and separate switches for rolling ticks, countdown beeps, win/loss sounds and button clicks.
- A Settings menu (gear icon) with How to play, a balance reset and the sound controls.
- A 7-step How to play tour that opens on the first visit and again from Settings.
- Keyboard: B, I, N, G, O pick a group; Space places or cancels a bet in Manual.
- Results come from HMAC-SHA256(server seed, "client seed:nonce") via the Web Crypto API.

## Tech

React 18 and TypeScript (strict), built with Vite. Tests use Vitest.

The round clock lives in `GameEngine`, a plain TypeScript class outside React, so a re-render can never restart a round. Components read the slices they need with `useGame(selector)`, which wraps `useSyncExternalStore`.

```
src/
  main.tsx                 entry: creates Sound and GameEngine, mounts <App>
  App.tsx                  page layout, tour state, keyboard shortcuts
  components/
    layout/                Header, Wallet (balance), SettingsMenu (gear menu)
    stage/                 Stage (canvas rail), Countdown, YourPick, ResultBanner
    bet/                   BetPanel, ModeTabs, BetAmount, ColourPicks, AutoRounds, PlayButton
    log/                   RoundLog
    tour/                  Tour overlay and its steps
    common/                Chips (pick tag and drawn-ball chip)
  context/GameContext.tsx  engine, sound and tour controls for components
  hooks/                   useGame (store selector), useShortcuts (B I N G O, Space)
  game/
    engine.ts              round clock, bets and payouts (no DOM)
    fair.ts                seeded results, multiplier table, PRNG for the decoy balls
    state.ts               saved balance and history (localStorage)
    format.ts              group names, number formatting
    theme.ts               group, multiplier and rail colours
    types.ts               shared types
  canvas/rail.ts           canvas renderer for the balls and the "Previous" row
  audio/                   sound.ts (Web Audio effects and caller), music.ts (background loop)
  lib/dom.ts               sleep, reduced-motion check
  styles/global.css
tests/fair.test.ts         odds, determinism and helpers
```

## Run it

```
npm install
npm run dev          # local dev server
npm run typecheck
npm test
npm run build        # production build in dist/
npm run build:single # also writes dist/lucky-five.html, one self-contained file
```

## Note

This prototype uses demo KES only. Balances have no cash value and nothing is deposited or withdrawn. Taking real money would need a gambling licence and a payment provider. The server seed is generated in the browser here, so a live version would need to move it to a server.
