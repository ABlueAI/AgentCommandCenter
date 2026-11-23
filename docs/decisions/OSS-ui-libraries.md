# S63: OSS record for Composer UI libraries

2026-11-23. Research for S49 and the S51 Composer build, including the Brain tab (S18). Blue
approved the sweep on 2026-11-18, recorded in [plan-change item 15](../DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21).
[S51's v1 scope](../PLAN-1.1.md#month-one) is pending sign-off. The fits below concern the chat
surface, task-node web, Ctrl+F and opening existing vault notes.

## Blue's verdict (word for word)

> **Date and verdict:** ____________________

## Options and proposed verdicts

**Recommended direction.** Prototype Cytoscape.js core for the task web and a UI-only build of
Deep Chat for chat. Adopt MiniSearch if ranked search across task fields is in scope. Adopt the
Obsidian URI for opening existing notes. Review the graph and chat results alongside S49's pre-build
evidence. The event log, provider adapter, pane dispatch, approval and checked-send path belong to
Mako. The shark's Three.js decision is separate. [Composer research](OSS-composer.md) · [Plan](../PLAN-1.1.md)

| Option | What it would replace in S51 or S18 | Licence, upkeep and renderer size | Proposed verdict and build days saved |
| --- | --- | --- | --- |
| **Deep Chat** | Transcript, message input, streaming and loading/error states for Composer chat and topic panes. | MIT. 2.5.1, 2026-08-27. 17 author identities, 6 in the last year. `deepChat.bundle.js` 387 kB / 107 kB. [Package](https://registry.npmjs.org/deep-chat/2.5.1) · [History](https://github.com/OvidijusParsiunas/deep-chat/commits/) | **PROTOTYPE**, aimed at **FORK** of the UI-only build. ~1–2 days net if removing provider code and fitting approvals is straightforward. |
| **Cytoscape.js** | Canvas task graph, layout, pan/zoom, selection and branch visibility. | MIT. 3.35.0, 2026-11-10. 194 authors, 33 in the last year. `cytoscape.min.js` 443 kB / 139 kB. [Package](https://registry.npmjs.org/cytoscape/3.35.0) · [History](https://github.com/cytoscape/cytoscape.js/commits/) | **PROTOTYPE**, aimed at **ADOPT**. ~2–4 days net versus drawing and hitting nodes, laying them out and handling interactions by hand. |
| **Cytoscape expand-collapse extension** | Compound-node folding and replacement edges for connections across a folded group. | MIT. 4.1.1, 2024-08-28. 19 authors, 0 in the last year. `cytoscape-expand-collapse.js` adds 31 kB / 9 kB. [Package](https://registry.npmjs.org/cytoscape-expand-collapse/4.1.1) · [History](https://github.com/iVis-at-Bilkent/cytoscape.js-expand-collapse/commits/) | **PROTOTYPE** only if core visibility falls short on nested groups or crossing edges. ~0–1 additional day. |
| **Sigma.js + Graphology** | GPU graph drawing, hover, pan and zoom. Mako still owns layout, group state and the visible graph projection. | Both MIT. Sigma 4.0.6, 2026-11-10, 83 authors (6 in the last year). Graphology 0.26.0, 2025-01-26, 35 authors (5 in the last year). `sigma.min.js` + `graphology.umd.min.js` 468 kB / 118 kB combined. [Sigma package](https://registry.npmjs.org/sigma/4.0.6) · [Sigma history](https://github.com/jacomyal/sigma.js/commits/) · [Graphology package](https://registry.npmjs.org/graphology/0.26.0) · [Graphology history](https://github.com/graphology/graphology/commits/) | **PATTERN-MINE** its interaction and rendering approach for v1. Adoption could save ~1–2 days on renderer work if graph size justifies WebGL. |
| **Vis Network** | Canvas graph, layout and built-in cluster/open-cluster operations. | MIT or Apache-2.0. 10.1.5, 2026-11-08. 156 authors, 6 in the last year. Standalone UMD `vis-network.min.js` 654 kB / 155 kB with its dependencies. [Package](https://registry.npmjs.org/vis-network/10.1.5) · [History](https://github.com/visjs/vis-network/commits/) | **PROTOTYPE** as the alternate if native clustering saves work with representative task branches. ~2–4 days net, overlapping Cytoscape's estimate. |
| **MiniSearch** | In-memory prefix/fuzzy search and ranking over task titles and indexed metadata, including folded nodes. | MIT. 7.2.0, 2025-09-16. 19 authors, 0 in the last year. Dependency-free UMD `index.js` 86 kB / 19 kB. [Package](https://registry.npmjs.org/minisearch/7.2.0) · [History](https://github.com/lucaong/minisearch/commits/) | **ADOPT** for ranked, multi-field find. ~0.5–1 day on indexing, matching and ranking. **BUILD FRESH** with simple string matching if Ctrl+F only needs case-insensitive title substrings. |
| **Obsidian URI** | The “open note” action on a task or report that already has a vault-note reference. | Published protocol, 0 kB of Mako dependencies. Proprietary desktop app, free for personal and commercial use. Public desktop 1.15.1, 2026-11-12. Small vendor team with named engineers and a CTO. Desktop source contributor count unavailable. Windows installer 339 MB. [Licence](https://obsidian.md/license) · [Team](https://obsidian.md/about) · [Windows release](https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.15.1) | **ADOPT** the URI for the existing desktop app. ~0.5–1 day versus implementing a basic open/read view. Both paths still require validating which note can be opened. |

Sizes are raw / gzip kB (1 kB = 1,000 bytes) of the listed browser files from npm tarballs, excluding
source maps. Author counts come from upstream default-branch Git history (`git shortlog -sn`)
and include bots and aliases. The dates are the npm registry's publication timestamps for `latest`
or Obsidian's latest public desktop release. Savings are estimates against hand-building the same
UI slice, with ordinary integration included. Graph alternatives save overlapping work.

## Electron fit and the China-origin check

Mako's Electron renderer loads plain JavaScript with Node integration off and context isolation on.
The candidates below use local browser assets or the Windows URI handler. In a scratch Chromium
page using Mako's CSP, all six JavaScript options passed the small checks described below. The harness
blocked outbound requests. Windows Electron, including Mako's `loadFile` entry point in a packaged
build, and the Obsidian OS handoff remain to be checked. [Renderer scripts and CSP](../../app/renderer/index.html) · [Electron settings](../../app/main.js)

Blue's rule covers models and hosted AI from companies based in China in what Mako runs, installs
or calls. References in upstream files outside what Mako ships are allowed. Remove such references
from code Mako takes in. This sweep searched the sized browser assets for known model names and
provider domains. Check the exact shipped files and dependencies at pin-and-scan.
[Blue's clarification, item 13](../DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21)

- **Deep Chat.** Native `<deep-chat>` custom element. The self-contained ESM bundle needs a local
  `type="module"` script. A stub `connect.handler` received a synthetic message and rendered a reply
  under Mako's CSP. The bundle tried to load an Inter stylesheet from Google Fonts and the CSP
  blocked it. The published bundle **fails the rule for shipping as-is**. Its actual executable
  contains DeepSeek, BigModel/GLM, Qwen/DashScope, Kimi/Moonshot and MiniMax connectors, plus Qwen
  web-model references. Turning the features off leaves the code in the bundle. Prototype a source
  build with those references removed, external fonts removed or local, and no direct provider,
  web-model, speech or attachment integration. Use a local handler tied to S51's checked-send
  boundary. Check plain-text transcript rendering, streaming, keyboard focus and an approval card
  before judging whether the fork saves work. [Install](https://deepchat.dev/docs/installation/) ·
  [Handler](https://deepchat.dev/docs/connect/#handler) · [Provider integrations](https://deepchat.dev/docs/directConnection/) · [Web models](https://deepchat.dev/docs/webModel/)
- **Cytoscape.js.** A local script initializes the DOM-backed Canvas graph with no framework. Core
  compound nodes and `hide()`/`show()` hid and restored a child and its incident edge in the smoke
  check. Start with core and keep collapse state by task ID. Folded branches that need proxy edges
  are the extension's stronger case. No covered model or endpoint references surfaced in the core
  bundle check. [Browser setup and graph API](https://js.cytoscape.org/) · [Layout and subgraphs](https://blog.js.cytoscape.org/2020/05/11/layouts/)
- **Cytoscape expand-collapse.** An extra local script registered with core and collapsed and
  reopened a compound in the smoke check. Its last release is older and its archived branches
  should be tested against live node and edge updates before adoption. No covered model or endpoint
  references surfaced in the extension bundle check. [Extension API and browser setup](https://github.com/iVis-at-Bilkent/cytoscape.js-expand-collapse)
- **Sigma.js.** Two local browser scripts run without a framework and require WebGL. The smoke
  used software WebGL and removed/re-added a child and edge through Graphology. Sigma leaves
  compound folding to Mako, which can project the visible task graph through Graphology. No
  covered model or endpoint references surfaced in either browser bundle.
  [Browser bundles](https://www.sigmajs.org/reference/browser-bundle/) · [Rendering lifecycle](https://www.sigmajs.org/concepts/lifecycle/)
- **Vis Network.** The standalone browser script created a Canvas graph and `cluster()` /
  `openCluster()` passed the smoke assertions. It emitted a `Node does not exist.` console error
  during that flow. Check reopening and updating a collapsed branch using representative task
  data before choosing it. Mako would keep stable task IDs for clicks and find results. No covered
  model or endpoint references surfaced in the standalone bundle check. [Browser setup and clustering API](https://visjs.github.io/vis-network/docs/network/)
- **MiniSearch.** Loads as a local UMD script in plain JavaScript. Prefix/fuzzy matches and
  replace/discard passed against synthetic task titles. Mako owns the Ctrl+F shortcut, field,
  next/previous result, unfolding and focusing the hit, and synchronization with task events.
  Electron's native find searches page text. Canvas nodes and collapsed tasks require searching
  the task data. No covered model or endpoint references surfaced in the bundle check. [Browser usage](https://lucaong.github.io/minisearch/) · [Index API](https://lucaong.github.io/minisearch/classes/MiniSearch.MiniSearch.html) · [Electron find](https://www.electronjs.org/docs/latest/api/web-contents#contentsfindinpagetext-options)
- **Obsidian.** Obsidian documents running the app once to register the URI on Windows. A user click can
  ask Electron main to open `obsidian://open?vault=Example&file=Tasks%2FDemo.md` through the OS.
  Current Quick Links accepts the bare `obsidian://open` only, and the generic `open-external` IPC
  accepts HTTP(S) only. A note link needs a narrowly validated main-process action that resolves a
  known note ID, encodes the configured vault and relative filename, and opens the `open` action.
  The local URI uses no model or hosted AI. The desktop app is maintained by Dynalist Inc. in Canada.
  [URI syntax and registration](https://obsidian.md/help/uri) · [Electron shell](https://www.electronjs.org/docs/latest/api/shell#shellopenexternalurl-options) · [Quick Links policy](../../app/quick-links-policy.js) · [IPC policy](../../app/open-external-ipc.js) · [Vendor terms](https://obsidian.md/terms)
