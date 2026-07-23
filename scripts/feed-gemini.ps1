<#
.SYNOPSIS
  Download a video/link with yt-dlp and feed it straight to the Gemini CLI.
.DESCRIPTION
  One command to turn a URL into agent context. Pick a mode:
    transcript  (default) - grabs auto-subtitles as .srt  (cheapest; text only)
    audio                  - extracts .mp3                  (tone/speech matters)
    video                  - downloads the .mp4 <=720p      (visuals matter)
  Files land in D:\Gemini_Video_Review\downloads (or override with -OutDir) with
  --restrict-filenames so the names are space-free and safe to pass to Gemini's
  @file references. Unless -NoFeed is set,
  the downloaded file is then handed to `gemini -p` with a default (or -Prompt) brief.
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ"
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -Mode video -Prompt "What UI patterns appear?"
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -Mode audio -NoFeed   # just download
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -VideoScout -Model gemini-2.5-pro -MediaResolution HIGH
.EXAMPLE
  .\feed-gemini.ps1 "https://youtu.be/XYZ" -VideoScout -Mode transcript   # cheap text-only pass
#>
param(
    [Parameter(Mandatory = $true, Position = 0)][string]$Url,
    [ValidateSet('transcript', 'audio', 'video')][string]$Mode = 'transcript',
    [string]$Prompt,
    [string]$OutDir = 'D:\Gemini_Video_Review\downloads',
    [string]$Lang = 'en',
    # Gemini CLI model (`-m`). Default is the cheapest vision-capable tier. See
    # lib/get-gemini-launch-config.ps1 for the full model/resolution-vs-download-resolution note.
    [string]$Model = 'gemini-2.5-flash-lite',
    # Intended per-request token-cost tier for image/video frames (LOW/MEDIUM/HIGH). NOTE: the
    # installed Gemini CLI has no flag or settings.json key for this on the -p path yet, so this
    # is currently logged (and validated) but not sent to the CLI -- see the warning printed at
    # launch and lib/get-gemini-launch-config.ps1 for why, and the closest available alternatives.
    [ValidateSet('LOW', 'MEDIUM', 'HIGH')][string]$MediaResolution = 'MEDIUM',
    # Optional slice bounds in whole seconds, SDK (YouTube) route only: analyze just
    # [StartOffset, EndOffset] of the video. Billing scales to the slice (proven ~81% cheaper for
    # 2min of a 10min video). Both must be given together, EndOffset strictly after StartOffset, and
    # the run must resolve to the SDK route; ANY violation REFUSES the run (throws) rather than
    # silently analyzing (and billing for) the whole video. The New-Agent modal exposes these via a
    # range picker (app/renderer) that validates first; this script re-enforces independently since
    # it is a documented standalone entry point.
    [ValidateRange(0, 86400)][int]$StartOffset = -1,
    [ValidateRange(0, 86400)][int]$EndOffset = -1,
    # (?) Explicit override of the mode-aware duration limit, in whole seconds. No silent bypass: when
    # provided it REPLACES the applicable limit (the source cap, or the range-slice cap) and is logged
    # at run time. ValidateRange starts at 1 so an EXPLICIT `-MaxDurationSeconds 0` is rejected at bind
    # time (0 is not a meaningful cap -- it would refuse everything); the unbound DEFAULT stays 0,
    # which validation does not touch, and means "unset -> use the per-mode defaults in
    # lib/get-duration-guard.ps1". (Reviewer finding 5: kill the ambiguous explicit-0 sentinel.)
    # P13: ceiling lowered 86400 -> 14400 (four hours, matching the largest per-mode default). An
    # override is a per-run bump, not a way to point the paid pipeline at a day-long source;
    # anything above 4h is rejected at bind time, before any probe or provider operation.
    [ValidateRange(1, 14400)][int]$MaxDurationSeconds = 0,
    # V5b1: MAIN-issued run ID for an app launch. When passed, the run directory is created from this
    # exact validated ID as a direct child of the fixed downloads root (never generated here, never
    # derived from terminal output). When omitted (direct standalone script use outside the app), the
    # existing PowerShell-generated fallback applies -- byte-compatible shape, unchanged behavior. The
    # renderer never supplies this: main.js generates it and passes it as this discrete argument.
    [string]$RunId,
    # V3a: optional pre-analysis focus/instructions. AUGMENTS (never replaces) the mode's default brief
    # and never creates a second provider request or bypasses a cost/duration guard. Re-validated here
    # INDEPENDENTLY (this is a documented standalone entry point) via lib/get-analysis-focus.ps1:
    # normalized (CRLF/CR/LF/tab -> space, trimmed), max 2000 chars (never truncated), C0/DEL rejected;
    # blank/absent leaves the default brief unchanged. The app passes it as ONE discrete argument, so
    # shell-metacharacter-shaped content stays literal prompt DATA (nothing builds a shell string).
    [string]$AnalysisFocus,
    [switch]$NoFeed,
    [switch]$VideoScout
)
$ErrorActionPreference = "Stop"

# --- section-scoping offset validation: REFUSE, never silently downgrade ------------------------
# Invariant (mirrors app/video-scout-args.js and the main-process refusal in app/main.js): a caller
# who asked for a [StartOffset, EndOffset] slice must NEVER be silently downgraded to -- and billed
# for -- a whole-video analysis. Offsets ride videoMetadata into generateContent, which exists only
# on the SDK/YouTube route, so they require -VideoScout and are re-checked against the resolved
# route below (the route backstop). These pairing/order/entry-point checks are route-independent,
# so they run first and fail fast. feed-gemini.ps1 is a documented standalone entry point, so this
# must hold on its own -- not only when the app validated first.
$haveStart = $PSBoundParameters.ContainsKey('StartOffset')
$haveEnd   = $PSBoundParameters.ContainsKey('EndOffset')
if ($haveStart -xor $haveEnd) {
    throw "Both -StartOffset and -EndOffset are required to analyze a slice; a lone offset is refused (the whole video is NOT analyzed as a fallback). Pass both, or neither."
}
if ($haveStart -and ($EndOffset -le $StartOffset)) {
    throw "-EndOffset ($EndOffset s) must be strictly greater than -StartOffset ($StartOffset s)."
}
if ($haveStart -and -not $VideoScout) {
    throw "A time range (-StartOffset/-EndOffset) is only valid with -VideoScout on the SDK/YouTube route. Remove the offsets, or add -VideoScout with a YouTube URL in video mode."
}

# --- V3a pre-analysis focus: normalize + validate INDEPENDENTLY, before any spend ----------------
# Route-independent, so it runs here with the other free validations (throws on an explicit invalid
# value: too long, or a forbidden control character). $normalizedFocus is $null when the focus is
# absent/blank, which leaves every default brief below unchanged. Only a character COUNT is ever
# logged at the compose sites; the focus text is never written to the run log.
. (Join-Path $PSScriptRoot 'lib\get-analysis-focus.ps1')
$normalizedFocus = Get-NormalizedAnalysisFocus -Focus $AnalysisFocus

# --- pre-flight duration guard machinery ---------------------------------------------------------
# ORDERING (load-bearing): the probe/guard functions are dot-sourced here but INVOKED only later, at
# the call sites tagged "Duration guard" -- and every one of those sites runs AFTER the offset
# validation just above (and, on the SDK route, after the route backstop). The probe must never be
# the first thing to touch unvalidated offsets, or it would become the code path that first trusts
# raw input. The IO (Get-YtDlpPath / Invoke-DurationProbe / Assert-DurationGuard) lives in
# lib/invoke-duration-probe.ps1 -- extracted so it is loadable + unit-testable without running this
# script (see invoke-duration-probe.Tests.ps1); it dot-sources the pure decision logic in
# lib/get-duration-guard.ps1, so Resolve-DurationGuard / Resolve-NoFileMessage are available here too.
# P13: Assert-DurationGuard takes -ProbeTimeoutSec and -MaxDurationSeconds as EXPLICIT parameters;
# both call sites below pass them (no ambient caller-scope reads remain).
. (Join-Path $PSScriptRoot 'lib\invoke-duration-probe.ps1')
$ProbeTimeoutSec = 60   # (?) hard cap on the metadata probe; a hung/slow probe REFUSES, never proceeds.

# Resolve + log the model/media-resolution launch config first, before any download happens, so
# every run records what tier it used at the top of the Logs tab output.
. (Join-Path $PSScriptRoot 'lib\get-gemini-launch-config.ps1')
. (Join-Path $PSScriptRoot 'lib\get-node-cli-arg.ps1')
# V5a per-run manifest: every ACCEPTED launch (past the free validations above) creates its run
# directory with a versioned manifest.json inside, updated atomically at every terminal path.
. (Join-Path $PSScriptRoot 'lib\write-video-scout-manifest.ps1')
# V5c1: the shared media-ownership recorder. A downloaded artifact is recorded (state='present') into
# the run's schema-v2 manifest BEFORE analysis, from the run's OWN resolved output file only. This
# module deletes/moves/repairs nothing (V5c1 is non-destructive; deletion is the separate V5c2).
. (Join-Path $PSScriptRoot 'lib\record-video-scout-media.ps1')
# V5b1 report artifacts: the bounded streaming collector (get-bounded-report.ps1) captures provider
# stdout without ever accumulating the whole stream, and the create-only atomic writer
# (write-video-scout-report.ps1) persists analysis-output.txt BEFORE the manifest is completed.
. (Join-Path $PSScriptRoot 'lib\get-bounded-report.ps1')
. (Join-Path $PSScriptRoot 'lib\write-video-scout-report.ps1')
# V5 stack content-acceptance correction: the FIXED, repo-owned Gemini CLI policy that denies the
# built-in `update_topic` tool so it can't emit agentic-orchestration chatter ahead of the requested
# report on a headless CLI run. Passed with `--policy` on every Gemini CLI invocation below.
. (Join-Path $PSScriptRoot 'lib\get-video-scout-gemini-policy.ps1')
# V5c2a: automatic successful-run media cleanup. ONLY after a run is durably completed with a persisted
# report does this delete that run's OWN manifest-owned media (from the validated manifest, never a
# scan). It is TOTAL (never throws) and non-destructive to reports/manifests/directories/history.
. (Join-Path $PSScriptRoot 'lib\cleanup-video-scout-media.ps1')
# V5b1 content acceptance (FAIL 2): PS 5.1 decodes a native process's stdout bytes using
# [Console]::OutputEncoding, which in the app PTY is the legacy OEM code page -- so UTF-8 provider
# output (en/em dashes, etc.) arrived mojibaked. This helper is the single source of truth for the
# UTF-8 (no BOM) encoding scoped around each native capture below (see get-native-output-encoding.ps1).
. (Join-Path $PSScriptRoot 'lib\get-native-output-encoding.ps1')
# Manifest truth: record the mode the caller EXPLICITLY requested separately from the mode actually
# applied -- bare -VideoScout defaults $Mode to 'video' below, and the manifest must not claim the
# caller asked for what a default chose. $null = -Mode was not passed.
$RequestedModeForManifest = if ($PSBoundParameters.ContainsKey('Mode')) { $Mode } else { $null }
$launchConfig = Resolve-GeminiLaunchConfig -Model $Model -MediaResolution $MediaResolution
Write-Host $launchConfig.LogLine -ForegroundColor DarkCyan
Write-Warning $launchConfig.Warning

# Video-scout: default to full video mode, but respect an explicitly passed -Mode so the app's
# launcher (or a CLI caller) can choose a cheaper transcript/audio-only pass. Bare `-VideoScout`
# with no -Mode keeps the historical behavior (full visual analysis) so existing invocations are
# unchanged. The forensic-analyst brief from prompts/video-scout-analysis.md only applies in video
# mode -- it instructs analyzing the visual stream and on-screen text, which don't exist in an
# .srt/.mp3, so transcript/audio runs fall through to the per-mode default briefs below instead.
if ($VideoScout) {
    if (-not $PSBoundParameters.ContainsKey('Mode')) { $Mode = 'video' }
    Write-Host "Video-scout analysis mode: $Mode $(if ($Mode -eq 'video') { '(full visual analysis -- highest token cost)' } else { '(no visual tokens -- cheaper pass)' })" -ForegroundColor DarkCyan

    # --- route: SDK (YouTube direct) vs CLI (yt-dlp download + attach) ----------------------
    # YouTube URLs in video mode skip the download entirely: the Gemini API ingests the URL as a
    # fileData.fileUri part. This dodges the CLI's 20MB inline-attach cap (which every real 720p
    # video exceeds -- the CLI then silently sends the prompt WITHOUT the video) and makes
    # -MediaResolution actually take effect. Everything else falls through to the CLI path below,
    # which is unchanged. See lib/get-video-source-route.ps1 for the exact rules.
    . (Join-Path $PSScriptRoot 'lib\get-video-source-route.ps1')
    $sourceRoute = Resolve-VideoSourceRoute -Url $Url -Mode $Mode -NoFeed:$NoFeed
    Write-Host "Video-scout route: $($sourceRoute.Route.ToUpper()) -- $($sourceRoute.Reason)" -ForegroundColor DarkCyan

    # Route backstop: offsets are only honorable on the SDK route (they ride videoMetadata into
    # generateContent). On any other resolved route they cannot be applied, so REFUSE rather than
    # download + analyze the whole file and bill for a slice the caller won't get. This closes the
    # drift hole where the renderer's predictVideoRoute and the script's Resolve-VideoSourceRoute
    # could disagree -- enforced here, at the layer that actually spends tokens.
    if ($haveStart -and $sourceRoute.Route -ne 'sdk') {
        throw "A time range only works on the SDK/YouTube route (it is sent to the Gemini API as videoMetadata). This run resolved to the '$($sourceRoute.Route)' route ($($sourceRoute.Reason)), which downloads and analyzes the whole file and cannot apply a range. Remove the offsets, or use a YouTube URL in video mode."
    }

    if ($sourceRoute.Route -eq 'sdk') {
        # Route-definitive media-resolution log: on THIS route -MediaResolution is a real
        # generationConfig field, sent and enforced by the API -- the opposite of the CLI-oriented
        # warning Resolve-GeminiLaunchConfig printed up top. Log what ACTUALLY happens (finding 6).
        Write-Host (Resolve-MediaResolutionLog -MediaResolution $MediaResolution -Route 'sdk') -ForegroundColor DarkCyan

        # V5a manifest: the launch is ACCEPTED (offsets + route validated above; nothing spent yet),
        # so create the run directory + initial manifest BEFORE the duration guard -- a guard
        # refusal is then durably recorded as outcome='refused'. This mirrors the CLI path below,
        # which has always created its run dir before its guard call. MediaResolutionApplied equals
        # the requested value here because the SDK route sends and enforces it (see the log above).
        $sdkRun = Initialize-VideoScoutRun -BaseDir $OutDir -Url $Url `
            -RequestedMode $RequestedModeForManifest -AppliedMode $Mode -Route 'sdk' -Model $Model `
            -MediaResolutionRequested $MediaResolution -MediaResolutionApplied $MediaResolution `
            -VideoScout $true `
            -StartOffset $(if ($haveStart) { $StartOffset } else { $null }) `
            -EndOffset $(if ($haveStart) { $EndOffset } else { $null }) `
            -RunId $RunId
        $sdkManifest = $sdkRun.Manifest
        try {
            # Duration guard (SDK route): the URL goes STRAIGHT to the paid API with no yt-dlp download, so
            # this pre-flight probe is the ONLY guard on this path (there is no download-time backstop --
            # nothing downloads). Runs after the offset validation and the route backstop above. This route
            # is video mode by definition; $haveStart marks a range run (gated on slice length).
            [void](Assert-DurationGuard -Url $Url -GuardMode 'video' -HasRange:$haveStart -RangeStart $StartOffset -RangeEnd $EndOffset `
                -ProbeTimeoutSec $ProbeTimeoutSec -MaxDurationSeconds $MaxDurationSeconds)

            $sdkScript = Join-Path $PSScriptRoot 'gemini-video-sdk.js'
            $sdkArgs = @('--url', $Url, '--model', $Model, '--media-resolution', $MediaResolution)
            if ($normalizedFocus) {
                # V3a focus present: compose it onto the base brief (an explicit -Prompt if the caller
                # supplied one, else the DEFAULT forensic video brief loaded from disk) and send the
                # composed text through the SAME correctly-escaped --prompt-text path the explicit
                # -Prompt case already uses. This changes only the prompt TEXT: same URL, model, media
                # resolution, offsets, retry behavior, duration guard, and single call count.
                if ($Prompt) {
                    $sdkBasePrompt = $Prompt
                }
                else {
                    . (Join-Path $PSScriptRoot 'lib\get-video-scout-prompt.ps1')
                    $sdkBasePrompt = Get-VideoScoutPrompt
                }
                $sdkComposedPrompt = Add-AnalysisFocusToPrompt -BasePrompt $sdkBasePrompt -Focus $normalizedFocus
                Write-Host "Analysis focus applied (chars=$($normalizedFocus.Length))" -ForegroundColor DarkCyan
                $sdkArgs += @('--prompt-text', (ConvertTo-NodeCliArg -Arg $sdkComposedPrompt))
            }
            elseif ($Prompt) {
                # Explicit -Prompt override (no focus): cross the PS 5.1 -> node boundary with the same
                # CommandLineToArgvW-correct escaping the CLI path uses (see lib/get-node-cli-arg.ps1).
                $sdkArgs += @('--prompt-text', (ConvertTo-NodeCliArg -Arg $Prompt))
            }
            else {
                # Default forensic brief, no focus: hand node the FILE, not the text -- no argument-
                # boundary escaping and no newline flattening needed; the brief arrives with full
                # fidelity. This path is byte-for-byte the pre-V3a behavior.
                $sdkArgs += @('--prompt-file', (Join-Path (Split-Path $PSScriptRoot -Parent) 'prompts\video-scout-analysis.md'))
            }
            # Pairing, strict order, and route were all validated above (refuse-not-downgrade), so by
            # here $haveStart implies a valid $haveEnd pair on the SDK route -- just pass them through.
            if ($haveStart) {
                $sdkArgs += @('--start-offset', $StartOffset, '--end-offset', $EndOffset)
            }
            # V5b1 bounded streaming capture: every stdout line still streams live to the pane (the
            # trailing `$line` re-emits it), while the bounded collector retains at most the report
            # limit -- NOT the whole stream (the old Tee-Object -Variable accumulated it all). The one
            # machine-readable "[video-scout usage]" line is captured separately (bounded: one line),
            # so usage parsing no longer needs the complete provider stream.
            $reportCollector = New-BoundedReportCollector
            $usageLine = $null
            # V5b1 content acceptance (FAIL 2): scope the native-stdout DECODE to UTF-8 (no BOM) ONLY
            # around this capture so UTF-8 provider output is not mangled through the PTY's legacy OEM
            # code page, then restore the previous value in finally (covers throws AND nonzero exits;
            # never a process-wide change). The same corrected decode is what streams live to the pane.
            $prevOutputEncoding = [Console]::OutputEncoding
            try {
                [Console]::OutputEncoding = New-NativeOutputEncoding
                & node $sdkScript @sdkArgs | ForEach-Object {
                    $line = [string]$_
                    Add-BoundedReportLine -Collector $reportCollector -Line $line
                    if ($line -match '\[video-scout usage\]') { $usageLine = $line }
                    $line
                }
                $sdkExit = $LASTEXITCODE
            }
            finally {
                [Console]::OutputEncoding = $prevOutputEncoding
            }
            if ($sdkExit -ne 0) {
                # Nonzero exit (incl. exhausted K5 retry, empty-response, network): NO report file,
                # reportFile stays null -- partial streamed output is never a saved report.
                Complete-VideoScoutRunManifest -RunDir $sdkRun.RunDir -Manifest $sdkManifest -Outcome 'error' `
                    -Reason "gemini-video-sdk.js exited with code $sdkExit (upstream API/network error; see the run output above)."
            }
            else {
                # Clean exit only past here -- the sole signal that permits outcome='completed' + a
                # persisted report. Atomic ordering: finalize the bounded text, write + rename the
                # report file, and ONLY THEN complete the manifest pointing at it.
                $report = Complete-BoundedReport -Collector $reportCollector
                if ([string]::IsNullOrWhiteSpace($report.Text)) {
                    # Clean exit but no meaningful output is NOT a successful analysis artifact.
                    Complete-VideoScoutRunManifest -RunDir $sdkRun.RunDir -Manifest $sdkManifest -Outcome 'error' `
                        -Reason 'The provider exited cleanly but produced no analysis output; no report was persisted.'
                }
                else {
                    if ($report.Truncated) {
                        Write-Warning "Report truncated: persisted $($report.PersistedChars) of $($report.TotalChars) characters (kept the beginning; the full analysis streamed above)."
                    }
                    $reportName = Write-VideoScoutReportFile -RunDir $sdkRun.RunDir -Text $report.Text
                    Complete-VideoScoutRunManifest -RunDir $sdkRun.RunDir -Manifest $sdkManifest -Outcome 'completed' `
                        -Usage (ConvertFrom-VideoScoutUsageLine -Lines $usageLine) -ReportFile $reportName
                }
            }
            return
        }
        catch {
            # Terminal-truth backstop: classify our own guard refusals as 'refused', anything else
            # as 'error', then rethrow the ORIGINAL failure. If the outcome is already terminal the
            # in-flight exception IS a manifest-write failure -- let it propagate untouched.
            if ($null -eq $sdkManifest.outcome) {
                Complete-VideoScoutRunManifest -RunDir $sdkRun.RunDir -Manifest $sdkManifest `
                    -Outcome (Resolve-ManifestFailureClass -Message $_.Exception.Message) `
                    -Reason $_.Exception.Message
            }
            throw
        }
    }

    if (-not $Prompt -and $Mode -eq 'video') {
        . (Join-Path $PSScriptRoot 'lib\get-video-scout-prompt.ps1')
        $Prompt = Get-VideoScoutPrompt
    }
}

# --- locate tools (PATH may be stale right after install / inside the app) -----
$ytdlp = Get-YtDlpPath

$gemini = (Get-Command gemini -ErrorAction SilentlyContinue).Source
if (-not $gemini) {
    $fallback = Join-Path $env:APPDATA "npm\gemini.cmd"
    if (Test-Path $fallback) { $gemini = $fallback }
}

# --- prepare output folder -----------------------------------------------------
# Download into a fresh per-run subdirectory, not $OutDir directly: this is what makes the file
# selection below immune to picking up a leftover file from a prior, unrelated run (see
# lib/get-video-scout-run-dir.ps1 for the bug this fixes). Initialize-VideoScoutRun wraps that
# same New-VideoScoutRunDir call (reused, not rebuilt) and adds the V5a manifest: the launch is
# accepted at this point, so the dir is born WITH its manifest.json. MediaResolutionApplied is
# $null here because on the CLI route the value is requested-but-NOT-applied (see the honest log
# at the feed step below) -- the manifest records what actually happens, not what was asked for.
. (Join-Path $PSScriptRoot 'lib\get-run-output-file.ps1')
$cliRun = Initialize-VideoScoutRun -BaseDir $OutDir -Url $Url `
    -RequestedMode $RequestedModeForManifest -AppliedMode $Mode -Route 'cli' -Model $Model `
    -MediaResolutionRequested $MediaResolution -MediaResolutionApplied $null `
    -VideoScout ([bool]$VideoScout) `
    -RunId $RunId
$runDir = $cliRun.RunDir
$cliManifest = $cliRun.Manifest
$outTemplate = Join-Path $runDir "%(title)s.%(ext)s"

# Everything below is a terminal path of an accepted run, so it runs inside one try/catch whose
# only job is manifest truth: our own guard refusals finalize as 'refused', everything else as
# 'error', and the original exception is ALWAYS rethrown unchanged (the manifest never softens a
# failure into a silent continue).
try {
    # --- Duration guard (download/CLI path) ----------------------------------------
    # Reached only for transcript / audio / non-YouTube video / -NoFeed (the SDK route returned above).
    # A range NEVER reaches here (it always routes to SDK), so HasRange:$false. This runs BEFORE the
    # download and yields the resolved per-mode limit that the subordinate --match-filter uses below.
    $guardResult = Assert-DurationGuard -Url $Url -GuardMode $Mode -HasRange:$false `
        -ProbeTimeoutSec $ProbeTimeoutSec -MaxDurationSeconds $MaxDurationSeconds

    # --- safety caps (shared across modes) -----------------------------------------
    # A single URL should never pull a whole playlist, an oversized file, or a multi-hour VOD.
    # These bound disk + cost and shrink the attack surface of a pasted link. Tune (?) as needed.
    $MaxFileSize = '600M'                       # (?) hard cap per download
    $ytCommon = @(
        '--no-playlist',                        # one item only, even if the URL is a playlist
        '--max-filesize', $MaxFileSize,
        # SUBORDINATE backstop to the pre-flight probe above (Assert-DurationGuard). It reuses the SAME
        # resolved limit the probe just enforced ($guardResult.Limit) plus !is_live. A trailing '?' is
        # deliberately omitted because that suffix is BELIEVED to be the fail-OPEN one -- i.e. its
        # absence is believed to also reject a MISSING/unknown duration (fail-closed). That belief is
        # UNVERIFIED against a live yt-dlp and is NOT load-bearing: the pre-flight probe already REFUSES a
        # null/unknown duration before anything downloads (Resolve-DurationGuard step 3), so by the time
        # this filter runs the duration is known and this clause can only ever RE-REJECT -- a source that
        # changed between probe and download (TOCTOU, expected and fine). It must NEVER permit what the
        # probe would refuse; if the two ever diverge, tighten HERE, never loosen the probe to match.
        '--match-filter', "duration < $($guardResult.Limit) & !is_live"
    )

    # --- per-mode yt-dlp invocation ------------------------------------------------
    Write-Host "Downloading ($Mode): $Url" -ForegroundColor Cyan
    # Capture yt-dlp's STDOUT (where the "does not pass filter" backstop line lands -- verified) via
    # Tee-Object so it still streams live while we retain it to build an accurate no-file message below.
    # stderr (progress) is left unpiped so it renders normally, not as red error records.
    $ytStdout = @()
    switch ($Mode) {
        # `--` terminates option parsing so a URL beginning with '-' can't be read as a flag (finding 7).
        'transcript' {
            & $ytdlp @ytCommon --restrict-filenames --skip-download --write-auto-subs --write-subs `
                --sub-lang $Lang --convert-subs srt -o $outTemplate -- $Url | Tee-Object -Variable ytStdout
            $pattern = "*.srt"
        }
        'audio' {
            & $ytdlp @ytCommon --restrict-filenames -x --audio-format mp3 -o $outTemplate -- $Url | Tee-Object -Variable ytStdout
            $pattern = "*.mp3"
        }
        'video' {
            & $ytdlp @ytCommon --restrict-filenames -f "bv*+ba/b" -S "res:720" `
                --merge-output-format mp4 -o $outTemplate -- $Url | Tee-Object -Variable ytStdout
            $pattern = "*.mp4"
        }
    }
    $ytStdoutText = ($ytStdout | Out-String)

    # --- find what THIS run produced (scoped to $runDir -- never a prior run's leftover) -----------
    $file = Get-RunOutputFile -RunDir $runDir -Pattern $pattern
    if (-not $file) {
        # Accurate message: our own duration/live backstop declining the download ("does not pass filter")
        # is NOT an upstream failure. Distinguish that from a transcript-with-no-captions result and from a
        # genuine upstream download failure. See lib/get-duration-guard.ps1 (Resolve-NoFileMessage).
        # The catch below classifies the backstop case as 'refused' (message starts 'Refused by') and
        # the other two as 'error' before rethrowing.
        throw (Resolve-NoFileMessage -Mode $Mode -Pattern $pattern -RunDir $runDir -YtDlpStdout $ytStdoutText -Limit $guardResult.Limit)
    }

    Write-Host ""
    Write-Host "Saved: $($file.FullName)" -ForegroundColor Green

    # V5c1: record this run's downloaded artifact in the manifest BEFORE the paid Gemini call (and
    # before the NoFeed completion). Ownership comes ONLY from $file -- the run's own run-scoped output
    # (Get-RunOutputFile above), never a scan of the directory and never a caller-provided name. The
    # recorder validates provenance (direct child, ordinary file, no reparse, extension==mode/kind,
    # exists, real on-disk size, no duplicate) and updates the manifest ATOMICALLY. If it fails, the
    # manifest claims NO ownership, the paid request is NOT made, the downloaded file is left untouched
    # (never deleted/moved/repaired), and the terminal-truth catch below finalizes outcome=error.
    [void](Add-VideoScoutMediaArtifact -RunDir $runDir -File $file -Kind $Mode -Manifest $cliManifest)

    # Best-effort title for the manifest: yt-dlp named this file from the video title under
    # --restrict-filenames, so the base name is the closest sanitized title the CLI route has.
    # (The SDK route has no downloaded file and records videoTitle=null today.) Untrusted either
    # way -- Complete-VideoScoutRunManifest sanitizes it again before it enters the manifest.
    $videoTitle = $file.BaseName

    # --- default briefs per mode ---------------------------------------------------
    if (-not $Prompt) {
        $Prompt = switch ($Mode) {
            'transcript' {
                # 9c: the default transcript brief demands caption-derived timestamps (key points
                # with citations, a chronological map, whole-second range suggestions) and forbids
                # invented ones. Loaded from prompts/transcript-analysis.md via its own tested
                # helper, same pattern as the -VideoScout brief. An explicit -Prompt never reaches
                # this branch -- it remains a complete caller override.
                . (Join-Path $PSScriptRoot 'lib\get-transcript-prompt.ps1')
                Write-Host "Timestamped transcript brief requested (default prompt)" -ForegroundColor Cyan
                Get-TranscriptPrompt
            }
            'audio'      { "Summarize what is said in this audio, and note the tone." }
            'video'      { "Describe what happens in this video and summarize the key points." }
        }
    }

    # --- flatten the prompt to a single line before it becomes a CLI argument ------
    # Newline flattening keeps the multi-line -VideoScout brief (loaded from
    # prompts/video-scout-analysis.md) on one physical line. This is one of two delivery concerns on
    # the Windows PowerShell 5.1 -> node.exe argument boundary; the other -- embedded double quotes --
    # is handled separately by ConvertTo-NodeCliArg at the actual `& node` invocation below (quotes
    # can't be flattened away because they're semantically meaningful in the brief). See
    # lib/get-cli-safe-prompt.ps1 and lib/get-node-cli-arg.ps1 for the full mechanism.
    # V3a: compose the optional focus onto the resolved base prompt (the per-mode default brief, the
    # -VideoScout video brief, or an explicit -Prompt) BEFORE flattening/escaping. This grows only the
    # prompt TEXT — it adds no second analysis request and changes no download/guard/model/mode/range
    # behavior. The subsequent Get-CliSafePrompt + ConvertTo-NodeCliArg handle the composed value the
    # same way they handle any brief, so metacharacter-shaped focus content stays literal.
    if ($normalizedFocus) {
        $Prompt = Add-AnalysisFocusToPrompt -BasePrompt $Prompt -Focus $normalizedFocus
        Write-Host "Analysis focus applied (chars=$($normalizedFocus.Length))" -ForegroundColor DarkCyan
    }
    . (Join-Path $PSScriptRoot 'lib\get-cli-safe-prompt.ps1')
    $Prompt = Get-CliSafePrompt -Prompt $Prompt

    if ($NoFeed) {
        Write-Host ""
        # $file.DirectoryName, not $OutDir: the file now lives in a per-run subdirectory, not
        # directly in $OutDir -- see the run-dir isolation note above.
        Write-Host "Skipped feeding (-NoFeed). To send it to Gemini later, run from $($file.DirectoryName):" -ForegroundColor Cyan
        # V3a privacy: the deferred `gemini -p` command embeds the composed prompt, which with a focus
        # present contains the user's -AnalysisFocus text. Terminal output must NEVER echo that focus, so
        # OMIT the command in that case and print a metadata-safe instruction instead. With no focus the
        # prior deferred-command output is preserved byte-for-byte.
        if ($normalizedFocus) {
            Write-Host "  [deferred 'gemini' command omitted: it embeds your -AnalysisFocus text, which is never printed. Re-run this feed-gemini command with the SAME -AnalysisFocus (and without -NoFeed) to analyze the saved file.]" -ForegroundColor DarkYellow
        }
        else {
            Write-Host "  gemini -m $Model -p `"$Prompt @$($file.Name)`""
        }
        # -NoFeed asked only for the download, and the download succeeded: that IS this run's
        # completed terminal state (no analysis was requested, so none is missing).
        Complete-VideoScoutRunManifest -RunDir $runDir -Manifest $cliManifest -Outcome 'completed' -VideoTitle $videoTitle
        return
    }

    if (-not $gemini) {
        Write-Host ""
        Write-Host "Gemini CLI not found. File is saved above. Install/login, then run from $($file.DirectoryName):" -ForegroundColor Yellow
        # V3a privacy: same rule as the -NoFeed branch — with a focus present the deferred `gemini -p`
        # command contains the user's -AnalysisFocus text, so OMIT it and print a metadata-safe
        # instruction. This branch is reachable from an app-launched run when the Gemini CLI is missing.
        # With no focus the prior deferred-command output is preserved byte-for-byte.
        if ($normalizedFocus) {
            Write-Host "  [deferred 'gemini' command omitted: it embeds your -AnalysisFocus text, which is never printed. Install/login to the Gemini CLI, then re-run this feed-gemini command with the SAME -AnalysisFocus.]" -ForegroundColor DarkYellow
        }
        else {
            Write-Host "  gemini -m $Model -p `"$Prompt @$($file.Name)`""
        }
        # The requested analysis did NOT happen. The console message is friendly, but the manifest
        # must record the truth: this run terminated without its analysis -- an error, not success.
        Complete-VideoScoutRunManifest -RunDir $runDir -Manifest $cliManifest -Outcome 'error' `
            -Reason 'Gemini CLI not found: the downloaded file was saved but never analyzed.' -VideoTitle $videoTitle
        return
    }

    # --- feed Gemini (run from trusted root so Gemini's folder-trust check passes) --
    # We do NOT call the `gemini` shim (.ps1/.cmd) here, and the reason is subtle. Both shims end in
    # `node <bundle>\gemini.js <args>`, so the runtime is a direct node call either way -- but the
    # PowerShell 5.1 -> node.exe argument boundary does not escape a value's embedded double quotes
    # (no PSNativeCommandArgumentPassing before PS 7.3). The -VideoScout brief contains literal "
    # characters, so node's C runtime splits the single -p value into multiple bare tokens, and gemini
    # aborts: "Cannot use both a positional prompt and the --prompt (-p) flag together". Routing
    # through the shim can't be fixed from here because the shim does its OWN uncontrolled
    # `& node ... $args` re-serialization across that same boundary. So we resolve the shim's node
    # entry point ourselves and invoke node directly, applying CommandLineToArgvW-correct escaping
    # (ConvertTo-NodeCliArg) to the one -p value -- see lib/get-node-cli-arg.ps1.
    #
    # gemini.js sits beside the shim at <shim dir>\node_modules\@google\gemini-cli\bundle\gemini.js
    # (this is exactly the path the shim itself runs). node is located the same way the shim locates
    # it: prefer a node.exe next to the shim, else the `node` on PATH.
    $geminiDir = Split-Path $gemini -Parent
    $geminiJs  = Join-Path $geminiDir 'node_modules\@google\gemini-cli\bundle\gemini.js'
    $nodeExe   = if (Test-Path -LiteralPath (Join-Path $geminiDir 'node.exe')) { Join-Path $geminiDir 'node.exe' } else { 'node' }

    Write-Host ""
    Write-Host "Feeding to Gemini..." -ForegroundColor Cyan
    $geminiCwd = Split-Path $OutDir -Parent
    # V5b1 content acceptance (FAIL 2): capture the previous console output encoding BEFORE the scoped
    # region so the finally can always restore it (covers throws AND nonzero exits). Set/restore is
    # never a process-wide change -- see get-native-output-encoding.ps1.
    $prevOutputEncoding = [Console]::OutputEncoding
    Push-Location $geminiCwd
    try {
        # -MediaResolution is intentionally NOT passed here: the gemini CLI has no flag for it on the
        # -p path (see lib/get-gemini-launch-config.ps1). Only -m/$Model is a real CLI knob today. Record
        # what ACTUALLY happened -- requested-but-dropped, not silently logged as in force (finding 6).
        Write-Host (Resolve-MediaResolutionLog -MediaResolution $MediaResolution -Route 'cli') -ForegroundColor Yellow
        # V5b1 content acceptance (FAIL 2): scope the native-stdout DECODE to UTF-8 (no BOM) around the
        # capture so UTF-8 provider output is not mangled through the PTY's legacy OEM code page. This
        # covers BOTH CLI sub-paths (direct node gemini.js and the shim fallback) and the same corrected
        # decode is what streams live to the pane. Restored in the finally below.
        [Console]::OutputEncoding = New-NativeOutputEncoding
        # V5b1 bounded streaming capture (both CLI sub-paths: direct node gemini.js and the shim
        # fallback). The trailing `$line` re-emits every line so it still streams live to the pane;
        # the collector retains at most the report limit. `$LASTEXITCODE` is set by the native exe and
        # is NOT changed by piping through ForEach-Object, so the exit code is preserved intact.
        $reportCollector = New-BoundedReportCollector
        # V5 stack content-acceptance correction: deny the Gemini CLI's built-in `update_topic` tool
        # via its supported Policy Engine on BOTH CLI sub-paths (direct-node and fallback shim), for
        # every mode and prompt. The path is fixed + repository-owned (Get-VideoScoutGeminiPolicyPath),
        # absolute (so it resolves under the Push-Location'd trusted CWD), and never caller-supplied.
        # This is the enforcement; the transcript brief's output contract is defense in depth. The SDK
        # route is unaffected (update_topic is a CLI tool; the API route has no such built-in).
        $policyPath = Get-VideoScoutGeminiPolicyPath
        if (Test-Path -LiteralPath $geminiJs) {
            $pArg = ConvertTo-NodeCliArg -Arg "$Prompt @$($file.FullName)"
            & $nodeExe $geminiJs -m $Model --policy $policyPath -p $pArg | ForEach-Object { $line = [string]$_; Add-BoundedReportLine -Collector $reportCollector -Line $line; $line }
        }
        else {
            # Unknown gemini layout (no npm bundle beside the shim, e.g. a standalone .exe install).
            # Fall back to the shim so this keeps working, but warn: a prompt with embedded quotes may
            # be misparsed on this path, since we no longer control the final argument serialization.
            Write-Warning "Could not locate gemini.js beside '$gemini'; falling back to the gemini shim. A prompt containing embedded double quotes may be misparsed on this fallback path."
            & $gemini -m $Model --policy $policyPath -p "$Prompt @$($file.FullName)" | ForEach-Object { $line = [string]$_; Add-BoundedReportLine -Collector $reportCollector -Line $line; $line }
        }
        $feedExit = $LASTEXITCODE
    }
    finally {
        Pop-Location
        [Console]::OutputEncoding = $prevOutputEncoding
    }

    # Terminal truth for the feed: the gemini CLI's own stderr already told the user WHAT failed;
    # the manifest records THAT it failed. No usage metadata exists on this route (the CLI prints
    # no machine-readable usage line), so usage stays null -- optional metadata, not a fabrication.
    if ($feedExit -ne 0) {
        # Nonzero exit: NO report file, reportFile stays null (partial streamed output is not saved).
        Complete-VideoScoutRunManifest -RunDir $runDir -Manifest $cliManifest -Outcome 'error' `
            -Reason "gemini CLI exited with code $feedExit (see the run output above)." -VideoTitle $videoTitle
    }
    else {
        # Clean exit only past here: finalize the bounded text, write + rename the report, and ONLY
        # THEN complete the manifest pointing at it (atomic report-before-manifest ordering).
        $report = Complete-BoundedReport -Collector $reportCollector
        if ([string]::IsNullOrWhiteSpace($report.Text)) {
            Complete-VideoScoutRunManifest -RunDir $runDir -Manifest $cliManifest -Outcome 'error' `
                -Reason 'The Gemini CLI exited cleanly but produced no analysis output; no report was persisted.' -VideoTitle $videoTitle
        }
        else {
            if ($report.Truncated) {
                Write-Warning "Report truncated: persisted $($report.PersistedChars) of $($report.TotalChars) characters (kept the beginning; the full analysis streamed above)."
            }
            $reportName = Write-VideoScoutReportFile -RunDir $runDir -Text $report.Text
            Complete-VideoScoutRunManifest -RunDir $runDir -Manifest $cliManifest -Outcome 'completed' `
                -VideoTitle $videoTitle -ReportFile $reportName
            # V5c2a: the analysis is now durably completed with a persisted report -- the ONE point in
            # the lifecycle where automatic media cleanup is eligible. It reloads + re-validates the
            # manifest from disk and deletes only THIS run's own, manifest-owned media (any CLI mode
            # that reached this branch: transcript/audio/video). It is TOTAL (never throws); a cleanup
            # failure surfaces a bounded warning but must NEVER rewrite this successful analysis into a
            # failure, so the call is additionally guarded here. $OutDir is the fixed, main-owned
            # downloads root; $runDir is its direct child. (NoFeed / error / refused / SDK routes never
            # reach here and retain their media; SDK owns no local media anyway.)
            try {
                [void](Invoke-VideoScoutSuccessMediaCleanup -RunDir $runDir -DownloadsRoot $OutDir)
            }
            catch {
                Write-Warning "Video-scout media cleanup could not run; the analysis completed successfully and its report is saved."
            }
        }
    }
}
catch {
    # Same terminal-truth backstop as the SDK route: record refused/error, then rethrow the
    # ORIGINAL failure unchanged. If the outcome is already terminal, the in-flight exception is a
    # manifest-write failure from Complete-VideoScoutRunManifest itself -- propagate it untouched.
    if ($null -eq $cliManifest.outcome) {
        Complete-VideoScoutRunManifest -RunDir $runDir -Manifest $cliManifest `
            -Outcome (Resolve-ManifestFailureClass -Message $_.Exception.Message) `
            -Reason $_.Exception.Message
    }
    throw
}
