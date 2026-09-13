# Meeting research manifest — 2026-09-12 (revised 2026-09-13)

Research window: the 60 days from 2026-09-12 through approximately
2026-11-11. Counties covered per the original request: Rutherford, Cannon,
Wilson, Davidson, Williamson, Bedford, Coffee, plus Murfreesboro
specifically. This revision adds Lebanon City Council (Wilson County) and
records the public-comment review Codex performed on the import file.

**Status update, 2026-09-13: both migrations below are now applied.**
Codex has live Supabase access (this session still does not) and
performed a real duplicate check before applying
`20260913024837_import_confirmed_upcoming_meetings.sql` — confirmed no
conflicting county/date meeting existed. That check covered only the one
row actually imported (Nashville, Sept. 15); every other candidate
discussed in this manifest remains unimported and its own duplicate status
is simply not applicable yet.

No dates below were generated from a recurrence rule alone. Where only a
general recurring policy was found (e.g., "second Monday of each month")
and no meeting-specific posted agenda/notice confirmed a particular date,
that is stated explicitly and the date is **not** included in the import
file.

## Correction: Davidson County's stored name

The original version of this manifest and import file assumed
`public.counties.name` for Nashville/Davidson County was the bare word
`'Davidson'`, based on `TennesseeCountyMap.jsx`'s client-side SVG element
id (`id="Davidson"`). That was wrong — Codex confirmed the live column
value is `'Davidson County'`. **The frontend's static county-map keys are
not a reliable stand-in for `counties.name`** — the same caution now
applies to every other bare name used in this manifest and should be
re-verified against live data (not assumed from the map) before any
further import file references them.

## Backend: applied (2026-09-13)

Both migrations are now live:

1. **`20260913051334_upcoming_meetings_list_and_public_comment_fields.sql`**
   (applied; supersedes an earlier unapplied draft that had a different
   filename) — adds four nullable columns to `public.meetings`
   (`comment_speaking_limit`, `comment_signup_instructions`,
   `comment_signup_deadline`, `comment_source_url`), a new public
   (`anon`+`authenticated`) RPC, `rrg_get_upcoming_meetings(p_county_id,
   p_limit default 3)`, returning up to `p_limit` scheduled,
   not-yet-started meetings ordered strictly by `starts_at` ascending
   (pinning never reorders), and a one-time `update` backfilling the
   Nashville Sept. 15 meeting's four comment columns by exact identity
   (county + instant + title). `p_county_id` null returns every county's
   scheduled meetings (pinned or not); a specific county returns that
   county's meetings plus every statewide-pinned meeting. This is what the
   "Upcoming meetings" banner (`NextMeetingBanner.jsx`) now calls instead
   of the single-result `rrg_get_next_meeting_for_county`, which is left
   completely unchanged for `TennesseeCountyMap.jsx`'s existing per-county
   panel.

   **Verified live as an anonymous visitor (no portal login):** statewide
   selection (`p_county_id` null) returns Oak Ridge, Nashville, then the
   existing Maryville meeting in chronological order; county filtering
   returns that county's meetings plus statewide-pinned ones; limit
   handling and Nashville's comment fields all work correctly.

2. **`20260913024837_import_confirmed_upcoming_meetings.sql`** (applied) —
   populates the one Nashville row with a confirmed actionable agenda.
   Performs a real content-aware duplicate check against live
   `public.meetings` data (same date plus a council-like title, or the
   exact instant) inside a `lock table ... share row exclusive mode` +
   `do $$ ... $$` block. **This file's original 11-column insert (no
   comment_* columns) is restored and must not be edited or replayed** —
   the comment columns for its one row are populated separately, by
   migration 1's backfill `update`, not by this file.

Frontend code reads `comment_speaking_limit`, `comment_signup_instructions`,
`comment_signup_deadline`, and `comment_source_url` only when present, and
renders no public-comment panel at all for a meeting with none of them
set. **A meeting's saved title is always shown as-is and is never treated
as evidence of public-comment eligibility** — a title containing "public
comments" with all four comment_* fields null shows no comment panel and
no "verified" claim of any kind.

## Confirmed and included in the import file (one meeting)

| Jurisdiction | Meeting | Date | Time (Central) | Location | Confirmed via |
|---|---|---|---|---|---|
| Davidson (Nashville) | Metropolitan Council, regular session | 2026-09-15 | 6:30 PM | David Scobey Council Chamber, Historic Metro Courthouse, 1 Public Square, Nashville | [nashville.gov meeting page](https://www.nashville.gov/departments/council/boards/metro-council/meetings/metropolitan-council-meeting-september-15-2026) plus [its own Legistar agenda](https://nashville.legistar.com/MeetingDetail.aspx?ID=1349495&GUID=D2BE5CCA-A4E3-4CCB-9746-8EEEC7B1724B), confirming an actionable agenda item exists for this specific date |

Public comment for this date is confirmed against Nashville's own
[published rules](https://www.nashville.gov/departments/council/public-comment-period)
(TN residency proof required; in-person signup 5-6 PM; up to 2 minutes;
agenda speakers prioritized) **and** this specific meeting's own agenda —
the only one of the four originally-researched Nashville dates held to
that stricter standard.

## Confirmed meetings, held pending individual agenda verification (not imported yet)

| Jurisdiction | Meeting | Date | Time (Central) | Location |
|---|---|---|---|---|
| Davidson (Nashville) | Metropolitan Council, regular session | 2026-10-06 | 6:30 PM | Same as above |
| Davidson (Nashville) | Metropolitan Council, regular session | 2026-10-20 | 6:30 PM | Same as above |
| Davidson (Nashville) | Metropolitan Council, regular session | 2026-11-05 | 6:30 PM | Same as above |

Each of these three dates is a genuinely scheduled, real Metropolitan
Council meeting (each independently confirmed via its own nashville.gov
meeting page, "no cancellation or rescheduling notice" stated on each).
They are **not** imported — per the instruction that Nashville's general
comment permission does not itself guarantee a comment period on a
specific date (no comment period occurs without an actionable agenda
item), and this research/review has so far only confirmed an actionable
agenda for September 15. Recommend checking each date's Legistar agenda
as it is posted, then adding it the same way September 15 was added.

## Excluded pending confirmation (unconfirmed speaking opportunity — not established as prohibited)

**Correction, 2026-09-13:** an earlier revision of this manifest labeled
these two candidates "does not allow suitable general comments," treating
that as a more definite finding than "unconfirmed." That overstated what
was actually established. No official source was found stating that
either body *prohibits* or otherwise restricts general surveillance-related
comment — only that neither body's *general* public-comment allowance was
independently confirmed for these dates. The correct, single label for
both is **unconfirmed**, the same category as every other researched-but-
unconfirmed candidate below:

- **Rutherford County Planning Commission, 2026-09-28, 9:00 AM,**
  Rutherford County Courthouse. The meeting date/time/location were
  genuinely confirmed via the county's own "Upcoming Meeting" page.
  Planning Commission public comment is *typically* scoped to the specific
  zoning/development item on a given agenda, which is a reason to expect
  this meeting may not suit a general surveillance-related comment — but
  that is background knowledge, not an official statement from Rutherford
  County that this specific meeting prohibits or restricts such comment.
  Unconfirmed either way; not imported.
- **Murfreesboro City Council Regular Session, 2026-09-17** (rescheduled
  from Sept. 10 per an official postponement notice — the meeting itself
  is real). Its general-comment eligibility for this specific date is
  unconfirmed (Murfreesboro's own conditional first-Thursday Public
  Comment session, see below, is a separate, narrower mechanism that would
  not even apply to a Sept. 17 date), and its exact start time was only
  ever a general-policy inference (6:00 PM), never independently confirmed
  for this particular rescheduled session. Not imported.

## Lebanon City Council (Wilson County) — verified separately from Wilson County Commission

Per the instruction to verify Lebanon City Council on its own, not conflated
with Wilson County Commission or any other board — they are two entirely
different bodies with independently confirmed, different schedules:

- **Regular meeting day/time (general policy):** confirmed via
  [lebanontn.org/311/City-Council](https://www.lebanontn.org/311/City-Council),
  fetched directly — "The council meets at 6 p.m. on the 1st and 3rd
  Tuesday of every month." No physical meeting location is stated on that
  page (only that it is broadcast on Charter channel 198 and streamed on
  Facebook/YouTube).
- **A real, specifically posted agenda exists for 2026-09-15** (posted
  2026-09-11, per [Lebanon's City Council Agenda
  Center](https://www.lebanontn.org/AgendaCenter/City-Council-5), fetched
  directly) — so the date itself is a genuinely scheduled meeting, not
  merely inferred from the 1st/3rd-Tuesday policy. Its exact time was not
  independently re-confirmed beyond the general 6 p.m. policy, and no
  physical location was found.
- **Public comment: UNCONFIRMED, not "does not allow."** Neither the City
  Council page nor the Agenda Center page mentioned any public-comment
  procedure in either direction — there is no evidence Lebanon City
  Council either does or does not accept general public comment. This is
  a genuine data gap, distinct from Rutherford Planning Commission and
  Murfreesboro above (which have an identifiable reason comment
  eligibility is doubtful); Lebanon simply has not been checked further.
- **Not included in the import file** — location is missing (a `not null`
  field) and comment eligibility is unconfirmed. Recommend a follow-up
  fetch of the Sept. 15, 2026 agenda PDF itself (or a call to the city)
  for the location and any comment-period language before importing.

## Murfreesboro Public Comment (conditional first-Thursday session)

Per <https://www.murfreesborotn.gov/1962/Public-Comment>, fetched directly:
a special Public Comment session is held at 5:30 p.m. on the first
Thursday of the month, **only if** Council holds its regular meeting that
same day — exactly the conditionality the request called out. Sign-up
closes 6 hours before the session (online form or (615) 849-2629,
first-come-first-served); location is City Hall, 111 West Vine Street.

First Thursdays in the research window are 2026-10-01 and 2026-11-05. The
city's own Notice-of-Public-Hearings reference mentions "Public Hearings,
October 1, 2026," which is suggestive of a regular meeting that day, but
this session could not independently confirm via a posted City Council
agenda that October 1 (or November 5) is itself a regular meeting day —
**and therefore could not confirm the Public Comment session applies to
either date.** Neither is included in the import file. Recommend Codex (or
a future pass) check the AgendaCenter closer to each date.

## Confirmed date, but excluded from the import file (missing a required field)

- **Bedford County Board of Commissioners — Special Called Meeting,
  2026-09-15.** Confirmed via [Bedford County's Board of Commissioners
  meetings page](https://www.bedfordcountytn.gov/government/boards_and_members/county_board_meetings/board_of_commissioners_meetings.php),
  which lists a "09/15/26" special called meeting with a linked notice
  file (`09-11-26 public notice.pdf`). The exact time and stated purpose
  could not be extracted from that PDF in this session. `meetings.starts_at`
  is `not null`, so this cannot be imported without a confirmed time — flag
  for follow-up (open the linked notice PDF directly) rather than guessing
  a time (e.g. the county's stated regular-meeting time of 7:00 PM, which
  is not confirmed for this special session).

## Researched, but no date confirmed in the window (not imported — "unconfirmed")

- **Rutherford County — full Board of County Commissioners.** The
  commission's own schedule page states meetings are "in the Historic
  Rutherford County Courthouse in the Second Floor Courtroom at 6PM unless
  otherwise stated," but does not list actual dates, and the live calendar
  is hosted on an internal SharePoint site
  (`rcsharepoint.rutherfordcountytn.gov`) that could not be reached from
  this session. No specific September/October/November 2026 date for the
  full Commission was found. **Caution:** search results repeatedly
  conflated this county with the unrelated Rutherford County, **North
  Carolina** (also has a Board of Commissioners) — every fact above was
  cross-checked against a `rutherfordcountytn.gov` (not the NC `.gov`)
  source before being used.
- **Wilson County — Board of Commissioners.** Stated policy (confirmed via
  the county's own County Commission page): third Monday of each month,
  7:00 PM, Wilson County Commission Room, 228 E. Main St., Lebanon, TN
  (moves to the following Monday if the third Monday is a holiday). The
  AgendaCenter's posted agendas run only through August 17, 2026 as of this
  research date — no September (candidate: 2026-09-21), October, or
  November agenda has been posted yet. Not imported; recommend checking
  <https://wilsoncountytn.gov/AgendaCenter/County-Commissioners-3> again
  closer to each date. (Note: this is the *County* Commission, meeting in
  the county seat of Lebanon — a different body from Lebanon *City*
  Council above, which meets separately and was verified independently.)
- **Williamson County — Board of Commissioners.** The county's own County
  Commission page states an adopted 2026 calendar: second Monday of
  January, February, March, May, June, July, September, October, and
  November, 6:00 PM, Executive Conference Room, Williamson County
  Administrative Complex, 1320 West Main Street, Franklin. Candidate dates
  in the window: 2026-09-14, 2026-10-12, 2026-11-09. No meeting-specific
  posted agenda was found confirming any of the three (the AgendaCenter
  category structure could not be located correctly in this session — a
  guessed category URL returned Highway Commission agendas instead). Not
  imported.
- **Bedford County — regular Board of Commissioners meeting.** Stated
  policy: second Tuesday of the month, 7:00 PM, second-floor courtroom,
  Bedford County Courthouse, Shelbyville. The county's own meetings page
  shows the September 8, 2026 regular meeting already posted (already past
  as of this research date) and explicitly states October 12 and November
  9 "have not yet been posted." Not imported.
- **Coffee County — Full Commission Meeting.** A partial recurring pattern
  was described in search results ("2nd Tuesday in January, March, April,
  May, June, July, September, and November"), but the AgendaCenter's
  actual posted agendas stop at July 14, 2026, and the county also posted
  an unscheduled second meeting on June 23, 2026 — evidence the stated
  pattern is not reliably predictive. No September, October, or November
  2026 date could be confirmed. Not imported.
- **Cannon County — County Commission.** The county's own site lists a
  Commission meeting for September 3, 2026 (already past as of this
  research date) and nothing for October or November. Cannon County has
  the thinnest web presence of the seven counties researched (no
  CivicEngage/AgendaCenter-style system found). No upcoming date
  confirmed. Not imported.

## Live verification, 2026-09-13 (anonymous, no portal login)

Called `rrg_get_upcoming_meetings` directly against the live database with
the public anon key (the same call the frontend makes) to verify the
finished banner end-to-end:

- **Statewide (`p_county_id: null`)** returns, in this exact chronological
  order: **Oak Ridge City Council regular meeting (7 PM Eastern)**
  (2026-09-14, stored as `2026-09-14T23:00:00Z` = 6:00 PM Central, exactly
  as expected for 7 PM Eastern), **Nashville Metro Council public comments**
  (2026-09-15, `2026-09-15T23:30:00Z` = 6:30 PM Central), then the existing
  **Maryville City Council Work Session — FLOCK ON AGENDA**
  (2026-09-18, `2026-09-18T13:00:00Z` = 8:00 AM Central).
- **County-filtered (`p_county_id: 20`, Davidson)** returns the Nashville
  meeting plus a statewide-pinned **"Murfreesboro City hall comments"**
  meeting (`is_pinned_statewide: true`, `county_id: null`) — confirming
  county-plus-pinned inclusion.
- **`p_limit: 1`** correctly returns only the single earliest meeting
  (Oak Ridge).
- Nashville's `comment_signup_deadline` (`2026-09-15T23:00:00Z` = 6:00 PM
  Central) is confirmed distinct from its own `starts_at`
  (6:30 PM Central) — the frontend renders these as two separately
  labeled lines, never merged.
- Oak Ridge, Maryville, and the pinned Murfreesboro meeting all have every
  `comment_*` column null — confirmed the frontend renders no
  public-comment panel and no "verified" claim of any kind for these,
  regardless of what their saved titles say (Murfreesboro's is literally
  titled "...comments" with nothing to back it).

Oak Ridge, Maryville, and the pinned Murfreesboro meeting are **pre-existing
rows this research did not create** — discovered only via this live query,
not part of the import file this manifest tracks. Their titles are shown
exactly as saved (including "Murfreessboro," a pre-existing typo in that
row's `city` value, which this task does not touch).

## General findings worth flagging separately

- **Web search summaries cannot be trusted at face value.** During this
  research, a search engine's own AI-generated summary produced a
  specific, confident-sounding date that turned out to be wrong on direct
  inspection at least twice: once by conflating Rutherford County, TN with
  Rutherford County, NC, and once by citing a PDF titled like a
  Murfreesboro council schedule that was actually the City of Corona,
  California's 2026 schedule (matched only by coincidental URL/filename
  similarity). A third near-miss recurred in this revision: search results
  for "Lebanon, Tennessee" repeatedly surfaced Lebanon, Ohio and Lebanon,
  Oregon pages. Every fact in this manifest was verified by directly
  fetching and reading the actual official `lebanontn.org` /
  `rutherfordcountytn.gov` / etc. page or PDF, never taken from a search
  summary alone.
- A static frontend key (a map SVG element id, a client-side county-data
  object key) is **not** a reliable stand-in for a live database column
  value — the Davidson County correction above is a concrete example of
  this going wrong. Any future lookup should be verified against the live
  schema/data, not the frontend's own naming conventions.
- Most of the smaller/mid-size Tennessee county sites researched do not
  expose specific forward-dated meetings more than roughly 1-3 weeks
  ahead through crawlable HTML — agendas are typically posted shortly
  before each meeting, and several counties' real-time calendars are
  JavaScript-rendered widgets or hosted on internal SharePoint sites that
  this session's tools could not read. This is the main reason so much of
  the 60-day window remains unconfirmed for the smaller counties; it is a
  tooling/access limitation, not evidence the meetings won't happen.
