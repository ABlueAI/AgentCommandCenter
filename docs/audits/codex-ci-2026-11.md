# CI workflow audit

Reviewed `main` at `1b23fc8f494d221b614564e0836bc8c1a82d4b06`. Source locations refer to that commit. The audit covered all three workflow files, their inline scripts and repository entry points, the npm install hook, 134 npm test commands, 40 Pester suites and six Node suites reached through Pester wrappers. The audit checked action pins against upstream tags, declared token permissions, failure propagation, Windows runner assumptions and repeated work. Windows observations come from hosted job logs. Permission and environment observations come from workflow declarations and repository setup documentation.

Rows with only a severity and title are security findings. Their details are recorded privately.

| Severity | File and line | Finding | User impact | Fix idea |
| --- | --- | --- | --- | --- |
| high |  | Merge approval evidence |  |  |
| medium |  | Merge audit input coverage |  |  |
| medium |  | Workflow action validation |  |  |
| medium |  | Native terminal test coverage |  |  |
| medium |  | File boundary test coverage |  |  |
| medium |  | Provider policy test coverage |  |  |
| medium | `.github/scripts/plan-sync.js:99` | Plan sync accepts a partial session table | A blank line after the second row made the parser accept 2 of 71 sessions. The run can report success while later issues and board cards remain stale. | Reject a later session row after an interruption within the session section. |
| medium | `app/shell-nav-app-integration.test.js:35`, `app/shell-nav-app-integration.test.js:46` | Shell navigation tests ignore Electron’s exit status | A successful JSON report can pass the suite even if the Electron child exits unsuccessfully after emitting it. | Require a clean child exit as well as the report, and surface launch errors, timeouts and signals. |
| medium | `scripts/run-pester.ps1:33`, `scripts/run-pester.ps1:36`, `scripts/run-pester.ps1:40` | The Pester summary omits pending and inconclusive cases | The wrapper exits green whenever FailedCount is zero. Its summary can omit unexecuted assertions, and it does not check that Pester actually ran any cases. | Report every result category and fail on zero executed cases or unexpected skips, pending cases or inconclusive results. |
| medium | `app/claude-video-scout.test.js:398`, `.github/workflows/ci.yml:36` | Windows CI skips real FFmpeg coverage | The successful CI run at the reviewed commit logged a skip because FFmpeg was unavailable. Scene detection, deduplication and frame sizing then lacked the real-binary check. | Provision a vetted FFmpeg and ffprobe build and fail the Windows gate if its real-binary test cannot run. |
| medium | `.github/scripts/plan-sync.js:285`, `.github/scripts/plan-sync.js:332` | Plan sync rewrites unchanged board items | With a connected board, each active session makes an add call and a Status write even when nothing changed. A recent sync spent 81 seconds in its script step. | Read existing items and statuses once, then add missing items and update only changed statuses. |
| low |  | Checkout credential lifetime |  |  |
| low |  | Plan sync dispatch scope |  |  |
| low | `.github/scripts/plan-sync.js:344` | Plan sync checks only the first page when removing a card | A dropped session’s card can remain on the board if its project membership is outside the first 50 results. The sync can still report success. | Paginate the memberships or look up the issue in the configured project directly. |
| low | `.github/scripts/plan-sync.js:218`, `.github/scripts/plan-sync.js:226`, `.github/scripts/plan-sync.js:231` | Plan sync writes before checking all prerequisites | Labels or a milestone can be created before a PR lookup or board Status lookup fails. A red run can leave changes behind. | Resolve the PR and board prerequisites before creating labels or the milestone. |
| low | `scripts/feed-gemini.Tests.ps1:203`, `scripts/feed-gemini.Tests.ps1:208` | A PowerShell child-process test can stall the job | The test redirects both child streams and waits for exit before reading either. A full pipe can block the child until CI cancels the job. | Drain both streams concurrently, bound the wait and check the intended refusal as well as the exit status. |
| low | `.github/workflows/ci.yml:45`, `.github/workflows/ci.yml:52`, `scripts/run-pester.ps1:19` | Pester depends on the runner image | The job uses a moving Windows image. It can import a different Pester version below 5 or fail before running tests if no compatible version is installed. | Use a named Windows image and provision and import a vetted exact Pester version. |
| low | `.github/workflows/ci.yml:30`, `app/quick-links-integration.test.js:11`, `app/quick-links-integration.test.js:21` | App CI fetches full history for a fixed Quick Links baseline | Every app job fetches all history and tags to read files from a single fixed commit. The fetch grows as the repository grows. | Use a shallow checkout and a targeted fetch of the baseline, with a visible failure if it cannot be fetched. |
| low | `.github/workflows/ci.yml:54`, `scripts/run-pester.ps1:33`, `scripts/merge-gate.Tests.ps1:30` | The serial Pester step dominates Windows CI time | Across three recent main runs the Pester step took 116–182 seconds, compared with 84–94 seconds for npm test. Several merge-gate fixture groups accounted for much of the Pester time in the reviewed run. | Time suites explicitly and profile the slow Git fixtures before deciding whether to shard them, preserving test coverage and the required check name. |

## Verification

- The CI hygiene, Node reachability, merge-audit and plan-sync suites passed locally. Node syntax was checked for the 140 test entry points, the install hook and the three workflow modules. Selected plan-sync behavior was checked with isolated Node fixtures.
- The Windows CI run at the audited commit and two nearby main runs supplied the timing sample. The plan-sync timing came from the plan-changing push immediately before the audited commit. [Reviewed CI run](https://github.com/ABlueAI/AgentCommandCenter/actions/runs/45946850666) · [Earlier CI run](https://github.com/ABlueAI/AgentCommandCenter/actions/runs/45945959788) · [Earlier CI run](https://github.com/ABlueAI/AgentCommandCenter/actions/runs/45944529129) · [Plan sync run](https://github.com/ABlueAI/AgentCommandCenter/actions/runs/45945959808)

## Follow-ups

- The full app startup smoke test is already tracked under S72. [Issue #299](https://github.com/ABlueAI/AgentCommandCenter/issues/299)
