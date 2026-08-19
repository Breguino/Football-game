# BUILD PROMPT — "Boot Room FC" (an FC 26-style football game)

> Hand this entire file back to Claude as the task. It is self-contained: it defines the
> product, the reverse-engineered visual language (with hard tokens), the screen specs,
> the tech stack, the build order, and the acceptance criteria. Read it top to bottom
> before writing code.

---

## 0. THE ASK IN ONE LINE

Build a playable football (soccer) game whose **presentation is indistinguishable in
feel from EA SPORTS FC 26** — the same broadcast-television grammar, the same near-black
menu system with iridescent focus states, the same chevron-cut scoreboard bug, the same
angular oblique display type — using entirely original clubs, players, kits and crests.

**Aesthetic fidelity is the primary success metric. Gameplay depth is the secondary one.**
A gorgeous, shallow build beats an ugly, deep one. Build the shell first, fill it after.

---

## 1. HARD CONSTRAINT — ORIGINAL IP ONLY

Everything in the FC 26 look that can be legally reproduced is *design language*: the
layout grammar, the palette, the geometry, the motion curves, the typographic scale.
Everything that cannot be reproduced is *identity*: club names, crests, kits, player
names and likenesses, league and competition marks, the EA/FC logos, and the F37
Foundry typefaces (Cruyff Sans / Marta) themselves.

So:

- **Invent the world.** Generate ~80–120 fictional clubs across 4–6 fictional leagues,
  each with a procedurally-built crest, a home/away kit, a 3-letter code, a primary and
  secondary colour, and a stadium. Generate fictional player names per nationality.
- **Never** ship a real club, competition, sponsor or player name — not even as
  placeholder data, because placeholders survive to production.
- **Substitute the fonts** with the free lookalikes named in §3.3.
- Do **not** download, embed or commit EA screenshots or assets. The aesthetic in this
  document is already fully encoded as numbers; you do not need the source images.

If you want a real-world flavour, do it the way football games without licences do it:
plausible invented names in the right linguistic register ("Rothbury United", "AS Cévennes",
"Nordvik BK") rather than thinly-veiled trademarks ("Real Madrid FC" → no).

---

## 2. SCOPE — THREE TIERS, BUILT IN ORDER

Do not start Tier 2 until Tier 1 passes its acceptance checks. Do not start Tier 3
until Tier 2 does.

### Tier 1 — "The Shell" (the aesthetic proof)
The whole front-end, plus a match that is playable but simple.
- Boot / attract sequence, main hub, squad screen, settings, match setup.
- Full match presentation layer: walkout, kickoff, HUD, replays, half-time, full-time.
- Match itself: 5-a-side, simplified physics, two human players or one vs. basic AI.
- **Exit criterion:** a stranger seeing a screenshot says "is that the new FC?"

### Tier 2 — "The Football"
- 11v11, full pitch, offside, fouls, set pieces (corners, free kicks, penalties, throw-ins).
- Real ball physics (spin, bounce, air drag), momentum-based dribbling, first-touch quality.
- Team AI: formations, roles, pressing lines, off-ball runs, defensive shape.
- Shooting model: finesse / driven / power shot with camera punch and zoom.
- Stamina, injuries, cards, substitutions, in-match tactics via d-pad.

### Tier 3 — "The Modes"
- Career: season simulation, table, fixtures, transfers, training, board expectations.
- A collection mode: packs, a card-item system, squad chemistry, objectives.
- Tournament / cup brackets, local multiplayer.

---

## 3. THE AESTHETIC — REVERSE-ENGINEERED SPEC

This section is the heart of the prompt. Treat these values as **normative**. They were
derived by sampling and measuring actual FC 26 UI captures (menu screens at 2048×1152,
in-match HUD at 2048×1152, brand key art). Where a number is given, use that number.

### 3.1 The seven rules that define the look

1. **The background is actually black.** Not "dark grey," not `#111`. FC 26 menus sit on
   `#000000` with a barely-visible, heavily-blurred stadium interior behind them
   (3–6% luminance: dark bronze structural beams, a few floodlight bokeh smudges,
   faint diagonal architecture). Panels float on top of the void.
2. **Colour is earned, never decorative.** The UI is monochrome — black, white, one
   grey — until something is *focused*, *live*, or *team-owned*. Then and only then does
   colour appear: the teal focus ring, the azure stamina line, the green skill pips,
   the club's own colours in the scoreboard.
3. **Light is the interaction.** Focus is not a colour fill; it is an **iridescent light
   leak** — a soft prismatic bleed (cyan → white → warm gold) escaping above and below the
   focused row, plus a 1.5px teal outline. It reads as refraction, not as a highlight box.
4. **Labels whisper, values shout.** Every settings row is `Sentence case regular label`
   on the left, `BOLD UPPERCASE VALUE` on the right. That single rhythm carries the
   entire menu system.
5. **Cuts, not corners.** The signature shape is the **chevron seam**: a `>` cut where two
   coloured blocks meet, at roughly 63°. It comes from the same triangle that sits above
   the controlled player's head. Use it in the scoreboard, in transitions, in dividers.
   Everything else is generously rounded (10px rows, 20px panels).
6. **The type leans forward.** Display type is a squarish geometric sans at a ~9–11°
   forward oblique, uppercase, tightly tracked, with flat angular terminals. Body/UI type
   is upright, humanist-geometric, very plain. Never mix the two roles.
7. **The match layer is television, not video game.** HUD elements are small, cornered,
   and mimic a real broadcast graphics package. Total HUD coverage is under 8% of screen
   area. The pitch is the picture.

### 3.2 Colour tokens

Ship these verbatim as CSS custom properties / a theme constant.

```
/* --- Surfaces (menu system) --- */
--fc-void:          #000000;  /* page background. yes, pure black */
--fc-bg-raised:     #0D0E12;  /* raised background beneath panels */
--fc-panel:         #1D1D27;  /* info panel / detail card fill (indigo-slate) */
--fc-panel-alt:     #252A40;  /* secondary panel, modal, tooltip */
--fc-row-focus:     #12141F;  /* focused list-row fill (dark navy) */
--fc-hairline:      rgba(255,255,255,0.10);  /* row dividers, 1px */
--fc-scrim:         rgba(0,0,0,0.62);        /* over-video scrim */

/* --- Text --- */
--fc-text:          #FFFFFF;  /* values, active tab, headings */
--fc-text-body:     #D8DAE2;  /* panel body copy */
--fc-text-muted:    #8A8C93;  /* inactive tabs, secondary labels */
--fc-text-dim:      #55575E;  /* disabled */

/* --- Accents (the only saturated colours in the UI) --- */
--fc-focus:         #2EC4B6;  /* focus ring / selected outline, teal-cyan */
--fc-stamina:       #34B6DA;  /* stamina line, azure */
--fc-positive:      #00E36B;  /* skill pips, "online" dots, success */
--fc-warn:          #FFC53D;
--fc-danger:        #E8455F;

/* --- The signature iridescence --- */
--fc-iridescent: linear-gradient(90deg,
    #35E0D0 0%, #9FEFE4 18%, #FFFFFF 40%,
    #FFE9B8 62%, #F3C88C 78%, #35E0D0 100%);

/* --- Brand / hero surfaces --- */
--fc-brand-ink:     #0B0E1A;  /* near-black navy behind aurora key art */
--fc-aurora-1:      #14D6A0;  /* green   */
--fc-aurora-2:      #1FC8C8;  /* teal    */
--fc-aurora-3:      #2A6FE0;  /* blue    */
--fc-aurora-4:      #9AE83A;  /* lime    */

/* --- Pitch / match --- */
--pitch-stripe-light: #5C7C34;
--pitch-stripe-dark:  #4B6B29;
--pitch-line:         rgba(242,245,238,0.92);
--night-fog:          rgba(120,150,190,0.10);
```

**Team colours are dynamic tokens.** Each club supplies `--team-primary`,
`--team-secondary`, `--team-ink` (readable text over primary). The scoreboard, the
player-indicator triangle and the radar markers all resolve from these — that is why the
static palette can afford to be so monochrome.

**The brand background** (splash, packs, hero cards): `--fc-brand-ink` base, 4–6 large
radial-gradient blobs of the aurora colours at 35–55% opacity, blurred 120px, plus a
subtle overlay of fine concentric contour lines (topographic / heat-map style) at 4%
white. That is the FC 26 marketing surface, reproduced.

### 3.3 Typography

The originals are F37 Cruyff Sans and F37 Marta — proprietary. Use these free stand-ins.

| Role | Font | Why it matches |
|---|---|---|
| **UI / body** (menu labels, tabs, panel copy) | **Rubik** 400/500/700 | Closest free match to the FC 26 menu face: geometric skeleton, humanist proportions, softly cut terminals |
| **Display / brand** (logos, mode titles, big numerals) | **Chakra Petch** 600/700, or **Saira SemiCondensed** 700 | Squarish geometric with angular notched joins; apply `transform: skewX(-9deg)` for the forward oblique |
| **Scoreboard numerals / timers** | **Saira Condensed** 800 | Heavy, condensed, unambiguous at small sizes |

Load from Google Fonts (permitted in artifacts and on the web). Always give a real
fallback stack: `'Rubik', 'Inter', system-ui, sans-serif`.

**Scale** (at 1080p; scale linearly with viewport):

```
display-xl   64px / 0.94 / 700 / uppercase / tracking -0.01em / skewX(-9deg)
display-l    40px / 1.00 / 700 / uppercase / tracking  0.00em / skewX(-9deg)
section      20px / 1.20 / 700 / uppercase / tracking  0.06em   (e.g. "CAMERA OPTIONS")
value        20px / 1.20 / 700 / uppercase / tracking  0.02em   (e.g. "TELE BROADCAST")
label        20px / 1.20 / 400 / sentence case                  (e.g. "Multiplayer Camera")
tab-active   19px / 1.20 / 700 / sentence case / #FFFFFF
tab-idle     19px / 1.20 / 400 / sentence case / #8A8C93
body         17px / 1.45 / 400 / #D8DAE2
caption      14px / 1.30 / 500 / tracking 0.04em
```

Note the deliberate oddity: **section headers and values are uppercase-bold, but row
labels and tabs are sentence-case regular.** Do not "tidy" this into consistency — the
contrast *is* the design.

### 3.4 Geometry and shape

```
radius-row      10px    /* settings rows, list items */
radius-panel    20px    /* detail panels, modals, tiles */
radius-chip      6px    /* button-glyph chips, badges, sponsor bug */
radius-pill    999px    /* stamina line caps, filter pills */
border-focus   1.5px solid var(--fc-focus)
hairline         1px solid var(--fc-hairline)
```

**The chevron seam** — the single most identifying shape. Two adjacent blocks meet on a
`>` cut. In CSS:

```css
.seg { clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%); }
```
14px of horizontal run over a 45px-tall block ≈ 63° — match that ratio at any size.

**The triangle** — the player indicator, and the brand's core mark. A downward-pointing
triangle, ~26px wide at 1080p, filled with `--team-primary`, 1px darker outline, soft
drop shadow, floating ~18px above the controlled player's head. **It fades toward
transparent as stamina depletes** (FC 26's "Player Indicator Fade"). Reuse the same
triangle at small scale for radar markers and at large scale for transition wipes.

**Grid.** 12-column, 48px gutters at 1080p, 96px page margin left/right, 64px top.
Tiles snap to the grid; cards in a hub row are 3, 4 or 6 columns wide, never arbitrary.

### 3.5 Motion

```
snap        180ms  cubic-bezier(0.20, 0.80, 0.20, 1.00)   /* focus moves, tab switches */
push        240ms  cubic-bezier(0.16, 1.00, 0.30, 1.00)   /* screen enter/exit */
settle      320ms  cubic-bezier(0.34, 1.28, 0.64, 1.00)   /* score bug slide-in, overshoot */
sweep       900ms  linear                                  /* iridescent travel */
```

- **Focus land:** the teal ring appears in 120ms; simultaneously the iridescent gradient
  *sweeps* left→right across the row's top and bottom edges once, over 900ms, then rests
  as a static soft bleed. This is the money detail. Get it right.
- **Screen push:** outgoing content fades to 0 and translates −24px; incoming fades in
  from +24px. Never cross-dissolve full screens.
- **Tile focus:** `scale(1.03)` + `brightness(1.08)` + the tile's art parallaxes 6px
  against its frame.
- **Score bug entry:** slides in from x = −100% with the `settle` curve, 320ms, after a
  400ms hold post-kickoff.
- **Goal moment:** full-screen wipe using the chevron shape travelling left→right in
  `--team-primary`, 520ms, with the scoreline slamming in at 1.4× then settling to 1.0×.

### 3.6 The signature component — the focus row

Build this once, as a primitive, and reuse it everywhere. Reference implementation:

```css
.row {
  display: grid; grid-template-columns: 1fr auto auto;
  align-items: center; gap: 24px;
  height: 76px; padding: 0 28px;
  border-bottom: 1px solid var(--fc-hairline);
  color: var(--fc-text);
}
.row .label { font-weight: 400; }
.row .value { font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }

.row[data-focused] {
  background: var(--fc-row-focus);
  border: 1.5px solid var(--fc-focus);
  border-radius: var(--radius-row);
  box-shadow: 0 0 0 1px rgba(46,196,182,.25);
}
/* the light leak, top and bottom */
.row[data-focused]::before,
.row[data-focused]::after {
  content: ""; position: absolute; left: 6px; right: 6px; height: 10px;
  background: var(--fc-iridescent);
  filter: blur(6px); opacity: .85; pointer-events: none;
}
.row[data-focused]::before { top: -6px; }
.row[data-focused]::after  { bottom: -6px; }
```

Cycler values (a setting you page through) get `◀ VALUE ▶` chevrons in the value slot.
Slider values get a 340px track: filled `#E8E9E3`, unfilled `#6E6E6E`, 14px white round
knob, numeric readout right-aligned in `value` style.

---

## 4. SCREEN SPECIFICATIONS

### 4.1 Match HUD — exact anatomy

All positions given for 1920×1080; scale proportionally. Total HUD ink ≈ 7% of screen.

**Scoreboard bug — top-left, x = 90px, y = 53px.**
A single horizontal strip, 390 × 70px, composed of three chevron-seamed segments:

| Segment | Width | Fill | Content |
|---|---|---|---|
| Home | ~105px | `--team-primary` (home) | 3-letter code, `value` style, home `--team-ink` |
| Score | ~180px | competition dark (e.g. `#350137`) | `0` ● `0` in Saira Condensed 800, 44px, white, with the competition crest centred *between* the numerals and overlapping both |
| Away | ~105px | `--team-primary` (away) | 3-letter code, away `--team-ink` |

Outer ends: 4px rounded caps. Inner joins: 14px chevron cuts.
Directly beneath the score segment, a **clock chip** drops down: 128 × 38px, competition
dark fill, rounded bottom corners, `01:47` in Saira Condensed 800 white.
Beneath that, optionally, a **sponsor/dropdown chip**: white fill, black uppercase text,
6px radius (this is FC 26's "Score Clock Dropdown").

**Competition watermark — top-right**, x ≈ 1690px, ~210px wide, white at 55% opacity.

**Player indicator bars — bottom-left (user) and bottom-right (opponent), y = 960px.**
Each ≈ 380 × 80px. Anatomy, from the top:
- A **3px azure line** (`--fc-stamina`) spanning the bar's full width, sitting *on* its
  top edge, rounded caps. This is stamina; it depletes right-to-left.
- The **name bar**: `rgba(0,0,0,0.55)` fill, 6px radius, containing shirt number in
  `--fc-text-muted` then `SURNAME` in white uppercase, tracking 0.05em, 26px.
  Mirrored on the right side (name then number).
- The **club crest sits outside the bar**, flush left (or flush right), ~52px, no container.
- Below, inset and narrower, a **stat pill**: `rgba(0,0,0,0.55)`, 6px radius, containing
  a small runner glyph, 5 skill-move stars (filled `--fc-positive`, empty `#3A3A3A`),
  a hairline divider, then two boot glyphs for weak foot and preferred foot.

**Radar — bottom-centre, 400 × 204px, y = 825px.**
`rgba(0,0,0,0.45)` fill, no border, corner tick-marks (like camera framing brackets)
rather than a full outline. Team A = filled circles, Team B = triangles, both in team
colours; the ball is a small amber dot. Support 2D and pseudo-3D (perspective-skewed)
variants — FC 26 offers both.

**On-pitch:** the team-coloured triangle above the controlled player, plus a translucent
cone/wedge on the grass showing facing and pass direction.

### 4.2 Settings screen — the reference build

Build this screen *first*, before the hub. It is the densest concentration of the design
language, so it doubles as your token test-bed.

- Full-bleed background: near-black with a blurred, darkened stadium interior.
- **Top bar:** a gear glyph at x=96, a 1px vertical rule, then a horizontal tab strip
  (Game Type Settings · CPU Sliders · Camera · Visual · Audio · Rules · Accessibility ·
  Graphics). Active tab white bold, others `--fc-text-muted`. Above the strip, small
  rounded key-cap chips reading `L1` / `R1` (bumper hints) — light grey fill, dark text.
  Tabs overflow off the right edge, clipped, not wrapped.
- **Left column** (x=96 → x=960): section header, then rows per §3.6, hairline-separated.
- **Right panel** (x=1030 → x=1620): `--fc-panel` fill, 20px radius, ~800px tall.
  Bold uppercase title, an optional 16:9 preview image with 12px radius, then body copy.
  It describes whatever row is focused, and updates on focus change.
- **Right rail** (x≈1665): a thin vertical scrollbar, plus a secondary section list
  (active bold white, inactive muted), plus a circular right-stick glyph with ▲▼ chevrons.
- **Bottom action bar** (y=1085): controller glyphs + labels — `○ Back`, `△ Restore
  Defaults`. Far right: an `R2` chip, a speaker icon, a green `1`, a players icon, a `3`.

Support both PlayStation glyphs (○ △ ✕ □) and Xbox (B Y A X) and keyboard, switchable.

### 4.3 Main hub

Tabbed, exactly like FC 26's redesigned Play Menu:
- Persistent tabs paged with L1/R1: **For You · Online · vs. CPU · vs. Friend**, plus
  dynamic tabs for live events.
- **For You** is the default and is composed of horizontal rails: `NEW`,
  `CONTINUE PLAYING`, `UPCOMING`. Each rail holds tiles at 3 or 4 columns.
- Tiles: 20px radius, art bleeding to the edges, a bottom-anchored gradient scrim, mode
  name in `display-l`, a one-line descriptor in `caption`. On focus: scale 1.03,
  parallax the art, and run the iridescent sweep along the tile's bottom edge.
- Persistent top-right cluster: user avatar, currency/points, notifications.

### 4.4 Match presentation sequence

Non-negotiable beats, in order — this is what makes it feel like the real thing:

1. **Walkout** (skippable): tunnel or pitch-side camera, shallow depth of field, both
   teams, crowd audio swelling. 6–8 s.
2. **Team-sheet card**: full-screen, brand-ink background with aurora blobs, both XIs in
   two columns, formation diagram.
3. **Kickoff**: broadcast camera settles; score bug slides in after a 400ms hold.
4. **In play**: HUD per §4.1. Commentary lines on events. Crowd reacts to danger.
5. **Replay**: on goals, near-misses and big saves — letterboxed 2.39:1 bars, slow-motion
   ramp, a cinematic camera angle, a small `REPLAY` chip top-left in `caption` style.
6. **Goal**: chevron wipe in the scorer's team colour, scorer name in `display-xl`
   slamming in, minute marker, then the celebration camera.
7. **Half-time / full-time**: stats panel over a blurred pitch — possession donut, shots,
   xG, pass accuracy — using `--fc-panel` cards on the void.

### 4.5 Player item card (Tier 3, but design it early)

The collectible item. Portrait, aspect ratio 1 : 1.38, with FC 26's distinctive silhouette:
a gentle convex curve on the top shoulder and a more pronounced concave sweep at the base.
- **Gold rare:** warm metallic gradient (`#C9962F → #F2D98A → #B07C1E`), with a
  radial "sunray" fan emanating from behind the player render, and a defined trim
  separating the portrait from the stat block.
- **Special / Team of the Week:** near-black base with gold trim, pronounced diagonal
  texture lines, curved metallic accents that catch light on tilt.
- Layout: rating (huge, top-left, `display-xl`), position beneath it, then nationality /
  league / club glyphs stacked; player render bleeding past the frame; name band; then a
  6-cell stat grid (PAC DRI SHO DEF PAS PHY) in `value` style.
- On focus, tilt the card 6–8° toward the cursor and sweep a specular highlight across it.

---

## 5. THE RENDER LOOK (the pitch itself)

FC 26's in-engine imagery is unmistakably **broadcast footage with a cinema grade**.
Reproduce that, not "realistic 3D":

- **Camera:** default is a pitch-side broadcast tele, ~18° elevation, long lens, tracking
  the ball with slight lead and lag plus a few pixels of handheld noise. Offer the FC 26
  camera set: Tele, Tele Broadcast, Co-op, Tactical, Pro, with Height and Zoom sliders 0–20.
- **Depth of field:** aggressive. Foreground bodies blur into bokeh and frame the action;
  the crowd is always soft. This single choice does most of the work.
- **Lighting:** strong key from the floodlight bank, cool blue-white (`~6500K`) at night,
  warm at day; hard rim light on shoulders and hair; volumetric haze in the light cones.
- **Grade:** slightly crushed blacks, cool shadows, warm highlights, mild bloom around
  lights, a subtle vignette, and 1–2% film grain. Saturate kit colours; desaturate crowd
  and stands so the players pop.
- **Pitch:** alternating mow stripes (`--pitch-stripe-light` / `--pitch-stripe-dark`),
  anisotropic sheen along the mow direction, wet-look specular in rain, real-time player
  shadows, divots and grass particles kicked up on hard touches.
- **Motion:** per-object motion blur on limbs and the ball, never on the whole frame.

If you build in 2D or low-poly for Tier 1, **still apply the grade, the DOF and the
vignette** — the aesthetic reads through the post-processing more than through the models.

---

## 6. TECH STACK

Default (recommended — change only if the user says otherwise):

- **TypeScript**, strict mode, throughout.
- **Vite** for build and dev server.
- **Three.js** for the pitch, players, ball and stadium (WebGL2), with a post-processing
  chain: DOF → bloom → grade LUT → vignette → grain.
- **React** for all menu and HUD surfaces, rendered as a DOM layer *over* the canvas
  (this is how you get typography and blur effects that actually look like the reference).
- **CSS custom properties** for the entire token set in §3.2 — one `theme.css`, no
  hard-coded colours anywhere else. This is a hard rule: a stray hex is a bug.
- **Zustand** for game state; a fixed-timestep simulation loop (60 Hz) decoupled from render.
- **Vitest** for logic tests, **Playwright** for screenshot regression on the UI.
- Gamepad API for controllers; full keyboard fallback; both glyph sets.

Structure:

```
src/
  sim/          # deterministic match simulation, fixed timestep, no rendering
  render/       # three.js scene, cameras, post-processing
  ui/
    tokens/     # theme.css — the single source of truth for §3.2
    primitives/ # FocusRow, Tile, Panel, ChevronSeam, Glyph, IridescentEdge
    screens/    # Hub, Settings, SquadEditor, MatchSetup
    hud/        # Scoreboard, PlayerBar, Radar, ReplayChrome
  world/        # procedural clubs, crests, kits, players, stadiums
  input/        # gamepad + keyboard mapping, glyph sets
```

---

## 7. PROCEDURAL WORLD GENERATION

Because we cannot licence anything, generation quality *is* content quality.

- **Crests:** compose from a shield shape set (8–10 silhouettes) × a device layer
  (star, lion, ship, wheel, tower, chevron, roundel) × a colour pair × an optional
  banner. Render as SVG so they scale to crest, radar dot and card glyph.
- **Kits:** template set (plain, stripes, hoops, sash, halves, checkerboard) × colour
  pair × collar style, generated as a texture and applied to the shirt mesh.
- **Names:** per-nation name banks (first/last), weighted by nationality distribution
  per league. Clubs from a prefix/suffix grammar keyed to a fictional geography.
- **Ratings:** generate a plausible distribution — each league gets a mean and spread,
  each club a wage-budget-driven pull, each player an age curve and growth potential.
- Seed everything from one string so a world is reproducible and shareable.

---

## 8. BUILD ORDER

Work in this sequence, committing at each step. Each step must run and look finished
before you move on.

1. Repo scaffold, Vite + TS + React + Three, CI, `theme.css` with the full token set.
2. **`FocusRow` primitive** with the iridescent sweep — the aesthetic's atom. Get it
   perfect before anything else exists.
3. **Settings screen** (§4.2), fully navigable by gamepad and keyboard.
4. Procedural world generation (§7) + a squad screen that displays it.
5. Main hub (§4.3) with tabs, rails and tiles.
6. Three.js pitch: stadium shell, grass with mow stripes, lighting rig, post-processing.
7. Players on the pitch, ball physics, a single controllable player, broadcast camera.
8. **Match HUD** (§4.1) wired to live match state.
9. Match presentation sequence (§4.4): walkout → kickoff → replay → goal → full-time.
10. Tier 1 acceptance pass. Then Tier 2, then Tier 3.

---

## 9. ACCEPTANCE CRITERIA

Tier 1 is done when every one of these is true:

- [ ] No hard-coded colour exists outside `theme.css`. `grep -rn '#[0-9a-fA-F]\{6\}' src --include=*.tsx` returns nothing.
- [ ] The settings screen, screenshotted at 1920×1080, matches §4.2's layout description
      element-for-element: tab strip with bumper chips, label/value rows, focus ring with
      light leak, right detail panel, right rail, bottom glyph bar.
- [ ] The focus row's iridescent sweep runs once on focus land and rests as a static bleed.
- [ ] The scoreboard bug renders with true chevron seams (not skewed rectangles, not
      plain dividers) and resolves its colours from the two clubs' tokens.
- [ ] The player indicator triangle fades with stamina.
- [ ] A full match can be played start to finish with the complete presentation sequence.
- [ ] Every screen is fully navigable with a gamepad, with no mouse required.
- [ ] Zero real club, competition, sponsor or player names anywhere in the codebase
      or data, including comments and test fixtures.
- [ ] 60fps at 1080p on integrated graphics.
- [ ] Playwright screenshot baselines exist for hub, settings, squad and in-match HUD.

---

## 10. KNOBS — set these before starting

Sensible defaults are given; override any of them in your reply and I will follow.

| Knob | Default | Alternatives |
|---|---|---|
| Platform | Web (TS + Three.js + React) | Godot 4, Unity, native |
| Match dimensionality | 3D | 2.5D top-down, 2D side-on |
| Tier 1 match format | 5-a-side, arcade physics | Full 11v11 straight away |
| Art direction | Photoreal broadcast | Stylised / low-poly with the same grade |
| Multiplayer | Local couch only | + online (adds substantial scope) |
| Modes for Tier 3 | Career first | Collection/packs first |
| Name | "Boot Room FC" | anything |

---

## APPENDIX — MEASURED REFERENCE DATA

Derived from FC 26 UI captures. Positions normalised to 1920×1080.

**Menu system**
| Element | Value |
|---|---|
| Page background | `#000000` (measured 96% of sampled background pixels) |
| Detail panel fill | `#1D1D27` |
| Focused row fill | `#12141F`–`#15151B` |
| Focus outline | teal, sampled `#0E856F`–`#30A0B8`, rendered `#2EC4B6` |
| Inactive tab text | `#8A8A8A` |
| Slider filled / unfilled | `#DADCD6` / `#6E6E6E` |
| Row height | 76px · dividers 1px at 10% white |
| Panel radius / row radius | 20px / 10px |

**Match HUD**
| Element | Position (1920×1080) | Size |
|---|---|---|
| Scoreboard strip | x 90, y 53 | 390 × 70 |
| Clock chip | centred under score segment | 128 × 38 |
| Player bar (left) | x ≈ 96, y 960 | ≈ 380 × 80 |
| Player bar (right) | x ≈ 1496, y 960 | ≈ 380 × 80 |
| Radar | x 751, y 825 | 400 × 204 |
| Competition watermark | x 1689, y 33 | 211 × 183 |
| Stamina line | on player-bar top edge | 3px, `#34B6DA` |
| Skill pips | in stat pill | `#00E36B` filled |
| Grass stripes | — | `#5C7C34` / `#4B6B29` |

**Brand surface**
Near-black navy `#0B0E1A`; blurred aurora blobs in `#14D6A0`, `#1FC8C8`, `#2A6FE0`,
`#9AE83A`; fine concentric contour lines at ~4% white; wordmark in white, uppercase,
forward oblique, angular terminals.

**Provenance:** values were sampled and measured from publicly published FC 26 screenshots
and marketing imagery (EA press assets, Steam store captures, press-outlet captures) using
per-pixel colour sampling and bounding-box measurement. No EA imagery is redistributed in
this repository — the aesthetic is encoded numerically here so the source images are not needed.
