# Issue #162: IP range check for the Page Reader's URL

2026-11-24, the PR that closes issue #162 (gap audit A5b). Issue #162 asked to "look for a maintained
library for the IP-range check rather than hand-writing one, and record the choice" (AGENTS.md
"Engineering rules": OSS first, no loose fragments in validators).

## Blue's verdict

Pending. Proposed verdict: **ADOPT** `ipaddr.js` 2.5.0. Merging the PR that adds this file adopts it
(AGENTS.md: "Merging a PR is how Blue approves a change"); if Blue says otherwise in the PR, his
words go here instead, quoted word for word.

## What the check needs

`validatePageUrl` (`app/page-reader.js`) must refuse any IP-literal host that isn't a public unicast
address, for IPv4 and IPv6: loopback, private, link-local, unique local, unspecified, carrier-grade
NAT, multicast, broadcast, reserved, and the IPv6 forms that carry an IPv4 address (mapped,
compatible, 6to4, Teredo, NAT64). It runs in Electron's main process, in Node, with no network.

## Options

| Option | What it is | For | Against | Proposed verdict |
|---|---|---|---|---|
| `ipaddr.js` 2.5.0 | npm package, MIT, no dependencies, no install script; maintainer whitequark; releases 2.3.0 (2025-11), 2.4.0 (2026-05), 2.5.0 (2026-08). Express's `proxy-addr` depends on it. | Parses IPv4 and IPv6, unwraps IPv4-mapped addresses (`process()`), and names each special range (`range()`), so the check is "only `unicast` passes" plus one CIDR (2000::/3) instead of a range table. About 64 kB unpacked. | A new runtime dependency (pinned exactly; `app/quick-links-integration.test.js` pins its integrity). | **ADOPT** |
| Node's `net.BlockList` | Built into Node: `addSubnet()`, `check()`. | No dependency. | Only matches the ranges it is given, so the list of special ranges would be hand-written: the loose fragment the rule warns about. | Not chosen |
| Hand-written CIDR list | A table of ranges in `page-reader.js`. | No dependency. | Same as above, and easy to get wrong for IPv6 embedded forms. | Not chosen |

## How the result is checked

`app/page-reader.test.js` section 1b refuses every class above (IPv4 short, hex, octal, decimal and
trailing-dot forms, IPv6 mapped, compatible, 6to4, Teredo, NAT64 and addresses outside 2000::/3)
and accepts public hosts; section 6 drives the real `page-reader-prepare` handler. If `ipaddr.js` is
missing (a pull without `npm ci`), Mako still starts and the Page Reader refuses with
`page-url-check-unavailable` and a "run npm ci" hint.
