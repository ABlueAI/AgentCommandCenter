# S66: OSS record for the Ctrl K command palette

2026-11-24, by the all-day runner building S66 (PR #283). The design brief
([docs/DESIGN-BRIEF-1.1.md](../DESIGN-BRIEF-1.1.md), section 10) says S66 "looks for a maintained,
dependency-light palette first (OSS first) and records the options, or builds a small one on the
combobox pattern". Mako's renderer is plain JavaScript (no React, no bundler), with context isolation
on and a CSP that loads scripts only from the app itself.

## Blue's verdict (word for word)

> **Date and verdict:** ____________________

## Options

Facts from the npm registry (`registry.npmjs.org/<name>`, read 2026-11-24, **verified** by that
read): latest version, licence, publish date of that version, runtime dependencies.

| Option | Version, licence, date | Runtime dependencies | Fit for Mako |
| --- | --- | --- | --- |
| **cmdk** | 1.1.1, MIT, 2025-03-14 | 4 Radix packages; React and React DOM as peers | No: needs React, which Mako doesn't ship. |
| **kbar** | 1.0.0, MIT, 2026-08-10 | Radix portal, TanStack virtual, fast-equals, fuse.js, tiny-invariant; React peers | No: needs React. |
| **ninja-keys** | 1.2.2, MIT, 2022-07-01 | lit, hotkeys-js, @material/mwc-icon | Weak: a web component, but unmaintained since 2022 and it pulls three runtime packages (the icon package loads a web font by default, which the CSP blocks). |
| **command-pal** | 0.2.11, MIT, 2023-02-11 | fuse.js, hotkeys-js, micro-pubsub | Weak: unmaintained since 2023, pre-1.0, three runtime packages. |
| **UI5 Web Components** | 2.29.0, Apache-2.0, 2026-11-18 | Six UI5 packages (base, theming, icons, localization) | No: a whole design system for one widget. |
| **Build fresh on the WAI-ARIA combobox pattern** | n/a | none | About 200 lines in `app/renderer/shell-nav.js`: a dialog holding a combobox, `aria-activedescendant`, arrows, Enter, Esc, a focus trap. Pattern source: the W3C WAI-ARIA Authoring Practices (combobox and dialog). |

## Proposed verdict

**BUILD FRESH** on the combobox pattern (builder's reading of the brief's own fallback): every
maintained option needs React, and the framework-free ones are unmaintained and bring three runtime
packages each. If the palette later needs fuzzy ranking across many items, **MiniSearch** (already
proposed for ADOPT in [OSS-ui-libraries.md](OSS-ui-libraries.md)) can rank its list without changing
the widget. Blue's verdict goes in the blank above; until then the PR builds on the proposal and says
so in its TLDR.
