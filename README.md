# Boot Room FC

A football game built to the aesthetic spec in [`PROMPT.md`](./PROMPT.md) — the
EA SPORTS FC 26 design language reverse-engineered from published imagery and
encoded as hard tokens, with entirely original clubs, players and competitions.

The visual reference, with the signature components rebuilt live in CSS, is in
[`docs/aesthetic.html`](./docs/aesthetic.html).

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run check    # token lint + typecheck + tests
npm run build    # production build
```

## Controls

Everything is playable on a gamepad or a keyboard; no mouse is required.

| | Gamepad | Keyboard |
|---|---|---|
| Navigate | D-pad / left stick | Arrows or WASD |
| Confirm / switch player | ✕ / A | Enter, Space |
| Back | ○ / B | Esc |
| Change tab | L1 / R1 | Q / E |
| Restore defaults | △ / Y | R |
| Pass | □ / X | J |
| Shoot | △ / Y | K |
| Sprint | R2 / RT | Shift |

An untouched controller hands the ball back to the AI, so a match plays itself
rather than stalling — which is also how the balance tests measure it.

## Layout

```
src/
  sim/      deterministic match simulation — fixed timestep, no DOM
    match.ts   state and the step loop
    ball.ts    physics: quadratic drag, Magnus, bounce, roll
    rules.ts   out of play, offside, fouls, restarts
    replay.ts  rolling position buffer for goal replays
  render/   three.js scene, broadcast camera, the grade pass
  ui/
    tokens/ theme.css — the single source of truth for every colour
    primitives/ FocusRow, Panel, Crest, Glyph, TileArt
    screens/  Hub, Settings, Squad, Match
    hud/      the broadcast HUD
  world/    seeded generation of clubs, crests, kits, players
  input/    gamepad + keyboard, mapped to semantic actions
```

Two rules hold the design together, and both are enforced rather than trusted:

- **Every colour resolves through `src/ui/tokens/theme.css`.** `npm run
  lint:tokens` fails the build on a literal anywhere else.
- **The simulation never touches the renderer.** `src/sim` imports no DOM and
  no three.js, so a match can be stepped headlessly — which is what the tests
  do, and what a season simulator will do later.

## Original identity

Every club, competition, player, crest and kit is generated from a seed. There
are no real-world names anywhere in the codebase or its data, and no
placeholders, because a placeholder eventually ships. Change the seed in
`src/state/world.ts` and you get a different football world.

The typefaces are freely-licensed stand-ins for the proprietary originals, and
they are self-hosted rather than fetched from a font CDN at runtime.
