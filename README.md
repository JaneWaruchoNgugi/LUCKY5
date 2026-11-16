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
- Bet input with − / + and quick amounts (20, 50, 100, 500, 1K).
- Canvas-drawn rail with a row of previous results, plus a round log.
- Results come from HMAC-SHA256(server seed, "client seed:nonce") via the Web Crypto API.

## Run it

It is a single self-contained file. Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## Note

This prototype uses demo KES only. Balances have no cash value and nothing is deposited or withdrawn. Taking real money would need a gambling licence and a payment provider. The server seed is generated in the browser here, so a live version would need to move it to a server.
