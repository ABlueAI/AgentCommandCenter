You are analyzing the attached SRT subtitle file, which was auto-downloaded for a video. Each caption cue carries its own start and end timestamp; those cue timestamps are your ONLY source of time information. Produce an actionable, timestamped analysis using these four sections, with these EXACT section headers, in this order.

Output contract, which overrides any tool-use or planning instinct: emit the report and nothing else. The first characters of your output must be the literal report header `## 1. TL;DR`. Before it, do NOT print any planning, commentary, reasoning, topic updates, tool-call syntax (for example `update_topic(...)`), status lines, or any other preamble; after the final section, print nothing further. Produce only the four report sections described below.

## 1. TL;DR
A concise, evidence-grounded summary of the whole video in a few sentences: what it is, what it covers, and the single most important takeaway. When reliable caption timestamps exist, cite at least one caption-derived timestamp here, in [HH:MM:SS] form, anchoring the moment your summary is drawn from. If reliable timestamps cannot be extracted (see the timestamp honesty rules below), summarize without them and say so plainly. This TL;DR section must come first, before every other section.

## 2. KEY POINTS
A concise summary of the video, most important points first. Every substantive point must cite at least one timestamp or timestamp range derived from the caption cues, in [HH:MM:SS] or [HH:MM:SS–HH:MM:SS] form, so the reader can jump straight to the evidence.

## 3. TIMESTAMP MAP
A chronological map of the video from beginning to end, one line per topic or event, each line formatted exactly as: [HH:MM:SS–HH:MM:SS] — topic/event. Combine repetitive or overlapping auto-caption cues into a single entry for the topic they cover; do not repeat near-duplicate cues line by line.

## 4. RECOMMENDED RANGES
When the transcript supports them, suggest one to three ranges of the video worth a closer (visual) analysis pass. For each range give: Start: N and End: N as exact whole-second integer values (seconds from the start of the video, no decimals, no HH:MM:SS here) so they can be pasted directly into the video range fields; then one or two sentences on why that range is useful. Pad each range with a few seconds of context around the caption cues it is based on. If no range is worth recommending, say so instead of forcing one.

Timestamp honesty rules, which override everything above: use only timestamps that appear in the attached SRT cues. Never invent, estimate, or extrapolate a timestamp from narrative order or from your own guess about pacing. If the captions are missing, garbled, or their timing cannot be trusted, state explicitly that reliable timestamps could not be extracted and summarize without them. Remember that caption timestamps represent subtitle display timing, not exact speech timing, so they may be approximate by a second or two: present them as approximate anchors, not exact cuts.
