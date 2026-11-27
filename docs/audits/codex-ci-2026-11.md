# CI workflow audit

Reviewed `main` at `1b23fc8f494d221b614564e0836bc8c1a82d4b06`. Source locations refer to that commit.

| Severity | File and line | Finding | User impact | Fix idea |
| --- | --- | --- | --- | --- |
| low | `.github/workflows/ci.yml:52`, `scripts/run-pester.ps1:19` | Pester depends on the runner image | The job requires a preinstalled Pester version below 5. An image update can leave the PowerShell gate unable to start. | Install and import a vetted exact Pester version in the job. |
