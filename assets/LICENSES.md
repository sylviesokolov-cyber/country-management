# Third-party assets

Everything in this game that was not drawn or written for it is listed here,
with its licence. Both licences below are permissive and commercial use is
fine; both require that the notice travels with the software, which is what
this file is for.

There is no attribution burden in the UI itself — neither licence asks for a
visible credit — but `README.md` names both anyway, because taking somebody's
work and being quiet about it is a poor way to behave.

---

## Icons — Lucide

- **What:** the 44 line icons in `src/ui/icons.js`. Two more (`ministry`,
  `coastal`) were drawn for this game in the same 24×24 / 2px / round-cap
  geometry, and are original work under the project's own licence.
- **Where from:** <https://lucide.dev> — <https://github.com/lucide-icons/lucide>
- **Licence:** ISC. Full text below.
- **How it is used:** the SVG path data is inlined into `src/ui/icons.js` as a
  `<symbol>` sprite. Nothing is fetched at runtime, so the game still works
  from `file://` and offline.

```
ISC License

Copyright (c) 2026 Lucide Icons and Contributors

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The following Lucide icons are derived from the Feather project:

airplay, alert-circle, alert-octagon, alert-triangle, aperture, arrow-down-circle, arrow-down-left, arrow-down-right, arrow-down, arrow-left-circle, arrow-left, arrow-right-circle, arrow-right, arrow-up-circle, arrow-up-left, arrow-up-right, arrow-up, at-sign, calendar, cast, check, chevron-down, chevron-left, chevron-right, chevron-up, chevrons-down, chevrons-left, chevrons-right, chevrons-up, circle, clipboard, clock, code, columns, command, compass, corner-down-left, corner-down-right, corner-left-down, corner-left-up, corner-right-down, corner-right-up, corner-up-left, corner-up-right, crosshair, database, divide-circle, divide-square, dollar-sign, download, external-link, feather, frown, hash, headphones, help-circle, info, italic, key, layout, life-buoy, link-2, link, loader, lock, log-in, log-out, maximize, meh, minimize, minimize-2, minus-circle, minus-square, minus, monitor, moon, more-horizontal, more-vertical, move, music, navigation-2, navigation, octagon, pause-circle, percent, plus-circle, plus-square, plus, power, radio, rss, search, server, share, shopping-bag, sidebar, smartphone, smile, square, table-2, tablet, target, terminal, trash-2, trash, triangle, tv, type, upload, x-circle, x-octagon, x-square, x, zoom-in, zoom-out

The MIT License (MIT) (for the icons listed above)

Copyright (c) 2013-present Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Typeface — Barlow

- **What:** the six `.woff2` files in `assets/fonts/`. Barlow Condensed is the
  display and HUD face; Barlow is the text and numeric face.
- **Who:** Jeremy Tribby.
- **Where from:** <https://fonts.google.com/specimen/Barlow>
- **Licence:** SIL Open Font License 1.1 — full text in `assets/fonts/OFL.txt`.
- **How it is used:** the Latin subset only, self-hosted and committed to this
  repository. Deliberately **not** loaded from Google Fonts: a CDN link would
  break `file://`, break offline play, and put a third-party request in a
  packaged Android app.

---

## Considered and not used

Recorded so the next session does not re-run the search.

| Source | Licence | Why not |
| --- | --- | --- |
| [Kenney](https://kenney.nl) UI Pack / Game Icons | CC0 | The right licence and genuinely good work, but a rounded, colourful, wooden-panel style built for casual and platform games. This game is a dark political sim whose reference points (Rebel Inc., Plague Inc.) are both flat and infographic-like; Kenney's pack would have fought the entire screen. Also unreachable from this environment. |
| [game-icons.net](https://game-icons.net) | CC BY 3.0 | 4,000+ icons and thematically perfect on paper (coins, crowns, garrisons). In practice they are ornate 512×512 fantasy silhouettes that turn to mud at the 14–16px a HUD chip actually gets, and they would have needed a visible credit. |
| itch.io asset packs | various | Mostly pixel-art or painted fantasy UI, and per-pack licence terms that would each need checking before a Play Store release. Unreachable from this environment in any case. |
