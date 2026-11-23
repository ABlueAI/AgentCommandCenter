# S63: OSS record for Composer UI libraries

2026-11-23. Research for S49 and the S51 Composer build, with the Brain tab in S18.
Blue approved this sweep on 2026-11-18, recorded in [plan-change item 15](../DECISIONS.md#2026-11-21-blues-decisions-of-2026-11-16-to-2026-11-21).
S51's scope is pending Blue's sign-off.

## Blue's verdict (word for word)

> 

## Options

The sweep compares Deep Chat for conversation UI, Cytoscape.js and Sigma.js for the task-node web,
MiniSearch for Ctrl+F, and Obsidian's URI protocol for opening an existing vault note. Mako's
[renderer](../../app/renderer/index.html) loads local JavaScript and runs without Node integration
or a UI framework. The Composer's provider adapter and approval checks live outside these UI pieces.
