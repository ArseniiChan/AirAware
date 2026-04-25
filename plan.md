# Asthma Atlas — HunterHacks 2026 Plan (v6 Final)

**Team**: 4 ppl | **Window**: Sat 11:00 → Sun 11:30 (24h) | **Judging**: Sun 12:30
**Track**: Bronx — Resilience & Empowerment

## Context
Mobile-first responsive web app for NYC parents. Story = storyteller's real school commute (kid, mother, bus depot, school gate). Implementation = general-purpose any-to-any router. Cold-open + hero demo + pitch lead the school commute; vision slide claims generality.

**Killer demo line**: *"Same walk. Two kids. One walks today. One stays home. Drag the slider — Maya can walk at four."*

**Coverage**: data covers all 5 boroughs; geocoder NYC-bbox + Bronx-biased via `proximity`. Pitch leads Bronx.

**Differentiators**: kid-aware exposure scoring on a real route, block-level pediatric ER context surfaced in plain language, per-kid recommendations from a transparent threshold matrix grounded in EPA AQI bands + AAP/AAFA pediatric asthma guidelines, time-scrubber driven by EPA's published forecast (no model training), EN + ES on day one.

**Demo surface**: responsive web app. Primary on stage = mobile (QR-and-go) per v6; team also tests desktop layout for the "judge follows on laptop" path. Either surface works.

**Coordination**: 30-min standups in chat at every checkpoint. First working end-to-end target = H8 (non-negotiable).

---

## 1. MVP Feature List

### MUST-HAVE
- Mobile-first responsive web app, QR-and-go, no install
- NYC-wide map (Mapbox basemap + AQI heatmap overlay across 5 boroughs); Bronx is visual anchor
- Any-to-any walking routing: two address inputs, free-form geocoding. **Long-press on map drops a pin** as alternative input. Two routes render: standard (red, polluted) + Atlas (green, AQI-aware). Comparison: avg AQI, exposure-minutes, distance, steps, added time
- Kid profile management: name, age (slider 3–17), severity (Mild/Moderate/Severe), localStorage. Up to 3 kids.
- **Per-kid recommendation engine**: deterministic threshold matrix over (severity × age × exposure) → `WALK_STANDARD` / `WALK_ATLAS` / `WALK_ATLAS_BRIEF` / `STAY_INSIDE`. **Cited against EPA AQI bands + AAP/AAFA pediatric guidance** in README + in-app "?" tooltip
- Multi-kid recommendation panel: same route, one card per kid, color-coded verdict (🟢/🟡/🟠/🔴), digestible copy w/ kid's name in every card
- **Block-level historical context card** (loads FIRST, before routes): on origin geocode, show *"About 1 in 24 kids on your block went to the ER for asthma last year. That's 4.5× the NYC average."* Source: NYC DOHMH "Asthma ED Visit Rate by ZCTA" (ZCTA = ZIP Code Tabulation Area; aggregate of SPARCS, since raw SPARCS rows aren't publicly available)
- **Time-scrubber** on recommendation panel: slider (now → noon → 4pm → 6pm → tomorrow morning). Each kid's recommendation re-renders as slider moves. **Powered by EPA AirNow's published forecast endpoint** (no custom ML training). Diurnal-pattern fallback if forecast endpoint returns nothing for a ZIP. Hero moment.
- Digestible copy throughout: 🟢/🟡/🟠/🔴 labels + plain language. "0 minutes through unhealthy air" not "avg AQI 87." Raw numbers behind a "details" expander
- **EN + ES toggle** (`next-intl`, header chip 🌐). User-controlled, no auto-detect. ES translated by Claude batch, reviewed by A or a pre-committed native speaker
- Hero scenario w/ 2 pre-loaded kids ("Maya, 7, severe" + "Diego, 11, mild"), storyteller's real Bronx home → real elementary school. Recommendations come out *opposite* on demo day. Hand-tuned.
- Static QR code on title slide → live Vercel URL
- Offline-safe demo mode: demo phone bypasses every live API; routes + AQI + forecasts pre-computed to JSON for hero scenario

### NICE-TO-HAVE
- Trained XGBoost forecasting model (90 days AirNow + NWS weather features), swapped behind the scrubber after H14 if MUST-HAVEs are green. README gets held-out MAE for technical judges. If it doesn't ship, scrubber still works on EPA forecast.
- **+1 stretch language** (Bengali specifically — BASTA / Riyuan Liu angle). Hard rule: ships only if a Bengali speaker is locked in advance (teammate's family on FaceTime, named friend at venue). No floor-recruiting.
- Claude per-kid 3-sentence explanations × (kid × scenario × locale), pre-generated, cached
- Hyperlocal AQI interpolation upgrade (kNN regressor weighted by meteorology) — invisible to demo, sells to data judges
- Voice-guided route mode (Web Speech API, en + es, full turn-by-turn)
- Pollen / NO₂ overlay toggle (OpenWeather Air Pollution)
- "Use my current location" geolocation prefill (behind explicit tap)
- "Days saved" per-kid progress bar (localStorage, seeded at 12, labeled "estimated")

### WON'T-BUILD
- Auth / accounts / sync — localStorage covers it
- Personal-health-outcome ML model — methodologically thin in 24h, threshold matrix is what doctors use
- Live AI Q&A on stage — pre-cached only
- Browser-locale auto-detection — user toggle only
- 5th+ language — two reviewed beats four with `[xx] missing.key`
- Multi-modal routing (transit, bike, drive) — walking is the wedge
- School-aware logic of any kind (no school dropdown / chip / bell-time) — engine is general
- Inhaler tracking, push notifications, daily check-ins, AR overlays
- Real-time AQI on stage
- Real database — JSON files in repo
- Native iOS/Android — PWA / responsive web covers it
- "For schools" admin view
- Onboarding wizard — "Add kid" + 3 fields
- Crypto / NFTs / blockchain
- Dark mode, marketing landing page, animated splash, share-to-IG cards

### 1.5 — Hard Triage Cut-List (pre-committed)
- **If H8 misses (no working end-to-end on hero pair)**: kill XGBoost, languages 3+, voice mode, days-saved, Claude per-kid explanations. Reallocate everyone to closing must-haves.
- **If H12 misses (no time-scrubber + no multi-kid panel)**: also kill ER choropleth, "Use my current location," polish pass.
- **If H14 misses (must-haves not all working on hero + 2 backup pairs)**: cut to hero pair only. Backup pairs become demo fallback chips, not interactive.
- **If H16 missed**: skip nice-to-haves entirely. H16 → H18 = bug fix only.
- **H18 = HARD FREEZE.** No new features, no exceptions.

---

## 2. Tech Stack

### Frontend
```
next@14 (App Router) · typescript · tailwindcss · shadcn/ui
mapbox-gl@3 · react-map-gl@7
zustand            # multi-kid + scrubber state
next-intl          # i18n (en + es JSON resource files)
@anthropic-ai/sdk  # Claude batch translation + per-kid explanations
```

### Map / routing
- Mapbox GL JS (vector tiles, custom layers, free tier 50k loads/mo)
- Mapbox Directions API walking profile w/ `alternatives=true` → AQI-score each → pick cleanest as Atlas route
- No graph router — alternatives-scoring is 90% as good in 1/10th the time

### Backend
- Next.js API routes only (no separate Python service)
- "Backend" = load static JSON, optionally call Claude. Python data prep runs locally Sat night, outputs JSON, commits.

### Hosting
- Vercel, `vercel.app` subdomain (no custom domain)

### Data store
- Static JSON in `public/data/`:
  - `aqi-grid.json` (5-borough 200×200m grid)
  - `aqi-forecast.json` (per ZCTA, hourly for next 24h, from EPA AirNow forecast endpoint)
  - `er-by-zcta.json` (asthma ED visit rate per ZCTA) + `nyc-avg.json` + `zcta.geojson`
  - `demo-routes.json` (3 hero pairs × 2 kid profiles × 5 time slices, fully precomputed)
  - `messages/{en,es}.json`

### Threshold matrix (Person D, MUST-HAVE)
- Cutoffs by severity × AQI band, cited against EPA AQI sensitive-group thresholds + AAP/AAFA pediatric asthma management guidance
- Matrix lives in `lib/recommendation.ts`, source citations in README + tooltip on the severity selector
- Output enum: `WALK_STANDARD` (Atlas+standard tied) / `WALK_ATLAS` (Atlas wins) / `WALK_ATLAS_BRIEF` (take a shorter walk only) / `STAY_INSIDE`

### Optional Claude
- `claude-haiku-4-5` for both batch translation and per-kid explanations
- Prompt caching (`cache_control: ephemeral`) on system prompts
- Per-kid explanations (NICE-TO-HAVE) pre-generated × (kid × scenario × locale), cached

---

## 3. Public APIs (one major API per person)

### EPA AirNow (Person C) — current AQI + 24h forecast
```
GET https://www.airnowapi.org/aq/observation/zipCode/current/?format=json&zipCode=10474&distance=5&API_KEY=...
GET https://www.airnowapi.org/aq/forecast/zipCode/?format=json&zipCode=10474&date=2026-04-26&API_KEY=...
```
- Free key in <5min. 500 req/hr (plenty for batch).
- Used for 5-borough AQI grid + time-scrubber forecast layer
- Backup: PurpleAir API (denser sensors, also free)

### Mapbox Directions + Geocoding (Person B) — routing + autocomplete
```
GET https://api.mapbox.com/directions/v5/mapbox/walking/-73.9,40.8;-73.85,40.85?alternatives=true&geometries=geojson&access_token=...
GET https://api.mapbox.com/geocoding/v5/mapbox.places/{q}.json?bbox=-74.27,40.49,-73.68,40.92&proximity=-73.87,40.84&access_token=...
```
- 100k req/mo free. `alternatives=true` returns up to 3 routes → AQI-score → pick cleanest

### NYC DOHMH / NYC Open Data (Person A) — asthma ER + ZCTA boundaries
```
GET https://data.cityofnewyork.us/resource/jb7j-dtam.json?$where=indicator_name like '%Asthma%' and age_group like '%0-17%'
# NYC DOHMH "Asthma Emergency Department Visit Rate by ZCTA"
# ZCTA boundaries (GeoJSON) — static download from NYC Open Data
```
- No key for low volume; app token gets higher rate
- Person A confirms at H4 whether granularity is per-ZCTA (good, "your block" copy works) or per-NYC-health-neighborhood (broader, soften copy to "your neighborhood")

### Anthropic Claude API (Person D) — batch translation + per-kid explanations
```
POST https://api.anthropic.com/v1/messages
# claude-haiku-4-5
# Two batch jobs (Sat night):
#   1. Translation: feed en.json strings → es-419 JSON
#   2. Explanations (NICE-TO-HAVE): per (kid × scenario × locale) → 3-sentence rationale
# Cached to public/data/. Demo never calls live.
```
- `cache_control: ephemeral` on system prompt
- Optional NWS forecast API (free, no key) → temperature + wind features for the XGBoost upgrade if Person C ships it

---

## 4. 24-Hour Timeline

H0 = kickoff. If start Sat 11am → H4 = Sat 3pm, H8 = Sat 7pm, H12 = Sat 11pm, H18 = Sun 5am, H24 = Sun 11am.

### H0 (Sat 11:00) — Kickoff
Repo created, Vercel project linked. Next + Tailwind + shadcn + zustand + next-intl + mapbox-gl + Anthropic SDK installed. All keys in `.env.local` (AirNow, Mapbox, NYC Open Data app token, Anthropic). All 4 ppl can `git push` and see Vercel preview. Hero address pair locked. 30-min standup cadence agreed. Bengali speaker confirmation closed (yes/no decision; if no, language drops permanently).

### H4 — Data layer + Map skeleton
- A: NYC DOHMH dataset cleaned → `er-by-zcta.json` + `nyc-avg.json`; ZCTA boundaries committed; **granularity decision made + copy locked**
- B: Mapbox map renders centered on Bronx, mobile viewport correct; address autocomplete working (NYC bbox, Bronx-biased)
- C: AirNow batch ran for 5-borough 200×200m grid → `aqi-grid.json`; forecast endpoint pulled per ZCTA → `aqi-forecast.json`
- D: i18n scaffolding wired w/ en + (empty) es locale; Claude SDK initialized; kid-profile zustand store + localStorage stub
- **Standup #1**

### H8 — FIRST WORKING END-TO-END (non-negotiable)
- B: Baseline walking route + AQI-scored Atlas route both render on hero pair; AQI sampling function returns exposure-minutes / max / avg / steps
- C: AQI heatmap layer rendering on map
- A: Block-level context card renders on home address geocode (loads FIRST, before routes)
- D: Kid profile picker UI w/ at least 1 kid (name/age/severity), persisted; severity threshold matrix wired → recommendation enum; recommendation banner renders for active kid
- **CHECKPOINT (non-negotiable)**: hero pair + 1 kid → block context card + red+green routes + recommendation banner all visible on a phone. **If miss → trigger §1.5 H8 cut-list immediately.**
- **Standup #2**

### H10 — mid-checkpoint
- 30-min sync: route quality? recommendation correctness? next risk?

### H12 — The money shot
- B+C pair-program: dual route render polished (z-order, draw animation), digestible UX live (🟢/🟡/🟠/🔴 + raw in expander)
- B: time-scrubber wired against `aqi-forecast.json`; Maya's card flips between 🔴 9am and 🟢 4pm
- D: multi-kid panel — switching kids retunes recommendation instantly; long-press-to-drop-pin works; ES locale loaded (Claude-batch translation done); language toggle live
- A: hands off coding; from H12 onward = pitch script + rehearsal + backup video
- **CHECKPOINT**: hero pair + 2 kids + scrubber works on phone; switching kids flips recommendation; scrubbing time flips recommendation
- **Standup #3**

### H14 — FEATURE FREEZE for must-haves
- Every must-have works on hero scenario AND 2 backup Bronx pairs
- Anything not on must-have list → STOP. Triage nice-to-haves.
- **Standup #4**: confirm freeze, assign nice-to-haves by remaining capacity

### H16 — Polish + nice-to-haves (whichever survive triage)
- D: Pre-bake demo-route JSONs (3 pairs × 2 kid profiles × 5 time slices) → `DEMO_MODE` env / `?demo=1` short-circuits API calls for preset pairs
- D: Claude per-kid 3-sentence explanations (if shipping), voice mode (if shipping)
- C: XGBoost forecasting model swap (if shipping); kNN interpolation upgrade (if shipping)
- B: 5-borough hero scenarios (if shipping), pollen overlay (if shipping)
- All: visual polish pass (Figma → Tailwind tokens), shadcn theming
- A: pitch rehearsal #1 + record backup video walkthrough
- **Standup #5**

### H18 — HARD FREEZE
- No new features. Bug fix + copy + visual polish only.
- Generate QR → production URL, print on paper backup
- Lighthouse mobile audit: perf >90, PWA installable, a11y >90
- **Standup #6**

### H20 — Demo rehearsal x3
- A runs full 3-min pitch 3x; each rehearsal a teammate scans QR mid-demo to confirm fresh-phone flow
- Fix only what broke in rehearsal

### H22 — Failure-mode dry runs
- Kill wifi → preset pair still renders (service worker)
- Phone never opened to URL → cold load <3s
- Type non-NYC address → graceful fallback
- External display + projector resolution → layout intact

### H23 — Final deploy + tag
- `git tag demo-final`, deploy from tag, lock URL, submit Devpost by 11:30. Eat. Shower if possible.

### H24+ — Pitch

---

## 5. Division of Labor (4 ppl, one major external API each)

Even-split coding through H12. A pivots to pitch-only at H12.

### Person A — NYC DOHMH + Block Context + Storyteller / Pitch
**Owns API**: NYC DOHMH / NYC Open Data
**H0–H12 (coding)**:
- Pull + clean NYC DOHMH "Asthma ED Visit Rate by ZCTA" → `er-by-zcta.json` + `nyc-avg.json`
- ZCTA boundaries → `zcta.geojson`
- **At H4 confirm dataset granularity** (per-ZCTA vs per-NYC-health-neighborhood); pick honest copy accordingly
- Build the **block-level context card** ("Your block had X ER visits…") — loads FIRST on home geocode, plain language, source attribution visible but small
- ER choropleth toggle (NICE-TO-HAVE)
- Curate hero pair (his real walk) + 2 backup Bronx pairs
- Hand-tune `demo-routes.json` so Maya & Diego come out opposite

**H12–H24 (pitch only)**:
- 3-min pitch script + rehearsal (3x at H20) + backup recorded video walkthrough
- Devpost writeup
- On-call for "does this stat read honest?" judgment

### Person B — Mapbox + Routing Engine + Time-Scrubber Wiring
**Owns API**: Mapbox Directions + Geocoding
- Mapbox map setup, mobile viewport, AQI heatmap layer styling
- Address autocomplete UI (NYC-bbox, Bronx-biased via `proximity`)
- **Long-press-on-map drops destination pin** (Google-Maps-grade interaction)
- API route `/api/route`: Mapbox alternatives → AQI-scored → returns red+green w/ exposure stats
- Dual route rendering (z-order, draw animation)
- AQI sampling function (polyline → exposure-minutes / max / avg / steps / added time)
- **Time-scrubber wiring**: consumes Person C's `aqi-forecast.json`, drives slider → re-render of each kid's recommendation
- 5-borough hero scenarios (NICE-TO-HAVE), pollen overlay (NICE-TO-HAVE)
- Pairs w/ C at H4–H8 (heatmap data → render integration)
- Pairs w/ D at H12–H14 (scrubber → recommendation re-render seam)

### Person C — EPA AirNow + AQI Data Pipeline + Heatmap
**Owns API**: EPA AirNow (current + forecast)
- AirNow batch script → `aqi-grid.json` (5 boroughs, 200×200m, time-binned)
- AirNow forecast endpoint pull per ZCTA → `aqi-forecast.json` (hourly, 24h ahead)
- Diurnal-pattern fallback function for ZIPs where forecast returns nothing
- AQI heatmap data prep + tile/grid format that B's map layer consumes
- **NICE-TO-HAVE**: XGBoost forecasting upgrade (90 days AirNow + NWS weather features), held-out MAE in README; kNN hyperlocal interpolation upgrade
- Pairs w/ B at H4–H8 (data → heatmap render)
- Pairs w/ D at H8–H12 (forecast format → scrubber data layer)

### Person D — Claude API + Recommendation Matrix + i18n + Multi-Kid Panel + Responsive Layout
**Owns API**: Anthropic Claude
- Claude batch translation pipeline (Sat night) → `messages/es.json`
- **Threshold matrix module** (`lib/recommendation.ts`): cited against EPA AQI bands + AAP/AAFA pediatric guidance, sources in README + tooltip
- Recommendation engine: `(severity × age × exposure-minutes × max-AQI × time-slice) → enum`
- **Multi-kid recommendation panel**: one card per kid, color-coded verdict (🟢/🟡/🟠/🔴), kid name in every card, instant retune on switch
- Stay-home full-screen overlay state (when recommendation = `STAY_INSIDE`)
- Digestible-copy pass (🟢/🟡/🟠/🔴 labels, raw numbers in "details" expander)
- i18n: `next-intl` setup, en + es locale files, language toggle in header (user-controlled)
- Kid profile picker UI (top-of-screen pills, age slider, severity select, localStorage via zustand)
- DEMO_MODE static-file short-circuit (3 pairs × 2 kids × 5 time slices) + `?demo=1` query param
- Responsive layout (mobile bottom-sheet ↔ desktop sidebar) for stage flexibility
- PWA manifest + service worker (cache demo pairs offline so demo never needs wifi)
- Loading / empty / error / "outside NYC" states
- **NICE-TO-HAVE**: Claude per-kid 3-sentence explanations × (kid × scenario × locale); voice-guided route mode (Web Speech API, en + es); Bengali locale (only if speaker locked); "days saved" bar
- Lighthouse perf + a11y pass at H18

### Cross-cutting rules
- B+C pair H4–H8 (heatmap data → map render = highest-risk integration)
- C+D pair H8–H12 (forecast data → scrubber data layer = second-highest)
- B+D pair H12–H14 (scrubber UI → recommendation engine seam)
- A on-call for "does this read honest?" judgments through H12; pitch-only after
- D on-call for "does this look like Google Maps?" at every checkpoint
- 30-min standup in chat at H4, H8, H10, H12, H14, H16, H18
- Anyone idle picks up nice-to-haves in priority: ES translation QA → scrubber polish → per-kid explanations → voice mode → 5-borough scenarios → XGBoost → Bengali

---

## 6. Demo Flow — 60-second Sequence

| Sec | On screen | Presenter says |
|---|---|---|
| 0–5 | App open, two empty fields, Bronx map, "Maya 🌸 (severe)" + "Diego 🦖 (mild)" cards visible | "This is my walk to school as a kid in the Bronx." |
| 5–12 | Tap home preset → field 1 fills → **block-context card slides in FIRST**: *"About 1 in 24 kids on your block went to the ER for asthma last year. 4.5× the NYC average."* | (Pause one beat.) "That's the block I grew up on." |
| 12–18 | Tap school preset → field 2 fills | "Hunts Point Ave to PS 48. Past a bus depot." |
| 18–25 | Tap "Find Route". Red Google-style route draws first through dark-red AQI patch. Diego's card: 🟢 *"Walk Atlas — 90s longer, 60% less exposure."* Maya's: 🔴 *"Stay home today, Maya."* | "Same address. Same time. Diego walks. Maya stays home. Personalization is what makes this not a public dashboard." |
| 25–35 | Atlas (green) route animates in alongside the red one | "Standard route in red, Atlas route in green. For Diego, Atlas drops his exposure 60%." |
| 35–48 | **Drag time-scrubber forward to 4pm**. Maya's card flips: 🟢 *"Walk at 4pm — air clears after rush hour."* | "And Maya can walk at four — when the bus depot quiets down. The forecast knows." |
| 48–53 | Tap 🌐 → ES → entire UI re-renders in Spanish | "Built bilingual day one. Half the parents we're building for speak Spanish." |
| 53–60 | QR code on screen | "Scan it. Try your own block. Any two NYC addresses." |

---

## 7. 3-Minute Pitch Script

### 0:00–0:10 — Hook (Person A, personal)
"I missed 14 days of fourth grade because of asthma. The school was half a mile from my apartment. Half of those days, my mom didn't know the air was bad until I was already coughing in class."

### 0:10–1:00 — Live demo (per §6)
Land at 0:25: *"Same address. Same time. Different kid. Different answer."*
Land at 0:45: *"The forecast knows when she can go out."*

### 1:00–1:45 — How it works (technical depth, sponsor-aimed)
- "200-meter AQI grid across all 5 boroughs, joined to NYC DOHMH asthma-ED data per ZCTA." (Susan — health data)
- "Mapbox returns route alternatives, we score each by integrated AQI exposure, pick the cleanest." (Raj — products)
- "Per-kid recommendation tunes off a transparent matrix grounded in EPA AQI bands and AAP pediatric guidance." (Susan — defensible health logic)
- "Time-scrubber drives off EPA AirNow's published forecast — no model training, no demo-day risk." (Richard — engineering rigor)
- "Claude translated the whole app to Spanish and (if shipped) writes per-kid explanations, prompt-cached." (Raj — Anthropic; BASTA, Riyuan — language access)
- "All precomputed, served from the edge, sub-second on a phone." (Richard — perf)
- "Designed in Figma, exported to a Tailwind token system." (Figma)

### 1:45–2:30 — Why it matters
- Health equity: kids most affected live in ZIPs with the worst data tools (Susan)
- Data engineering: this is what happens when you ground public data in a person's daily routine, not a policy report (Bloomberg)
- First-gen mobility: parents we built for are the ones whose voices don't shape city air policy (BASTA, Riyuan)

### 2:30–3:00 — Vision (this is where we earn the broader frame)
- "Today: the school commute. Tomorrow: any walk, any errand, any park — the engine is general."
- "Beyond walking: school siting decisions, recess timing, bus depot relocation arguments — every one of them gets stronger when grounded in a route a parent actually walks."
- "We want to ship this to the Bronx Asthma Coalition Monday morning. The data's public. The map shouldn't have to be."
- End w/ QR visible.

---

## 8. Top Demo Failure Modes

### 1. Wifi dies on stage
Service worker caches the 3 demo pairs + AQI grid + forecast + map tiles for the Bronx. Pre-pull demo URL on demo phone before going on stage; do not close the tab. Hotspot from teammate's phone as backup.

### 2. Mapbox quota / API key throttled
DEMO_MODE / `?demo=1` short-circuits all 3 preset pairs to static JSON — zero API calls for scripted demo. If a judge's typed address 429s, friendly fallback w/ chip suggestions.

### 3. Location permission denied
Don't ask for geolocation at all. Pure address-input. "Use my location" only behind explicit tap (NICE-TO-HAVE).

### 4. AQI all green on demo day → no visible reroute
Use historical worst-case AQI snapshot for precomputed grid (high-pollution day from AirNow archive). Hero pair uses frozen data, not live. Tiny "based on Aug 2025 air quality" label — honest, visual still lands.

### 5. Demo phone / projector chokes
Bring our own phone w/ app pre-loaded + demo URL bookmarked + `?demo=1` set. Backup phone w/ same setup from a different teammate. Backup laptop w/ desktop layout if phone fails entirely.

### 5b. Judge's phone can't load via QR
Test responsive layout on iPhone 14/15 Safari + Pixel Chrome beforehand. Lighthouse mobile >90 by H18. URL gracefully degrades — install optional.

### 6. Storyteller forgets a line
Print pitch script on index card. Person D holds it in front row. Rehearse 3x at H20.

### 7. Judge types non-NYC address
Geocoder bbox clamps to 5 boroughs. Non-NYC → "We currently cover the 5 boroughs — try one of these Bronx walks" w/ chip suggestions.

### 8. Voice mode (if shipped) chokes on judge's phone
Feature-detect `window.speechSynthesis`; hide toggle if absent. Visual turn-by-turn fallback list.

### 9. Time-scrubber forecast looks unrealistic
If EPA forecast for hero ZCTAs is flat/counterintuitive, hand-tune `aqi-forecast.json` for the 3 demo pairs. Label visible time slices "based on EPA AirNow forecast" — defensible.

### 10. ES translation breaks layout
QA Spanish locale during H12 polish; truncate or wrap any string >1.5x English length. Spot-check on iPhone SE viewport.

---

## 9. What to NOT Build

- Login / accounts / "save your routes" — zero demo value
- Real-time AQI fetching during demo — flaky, precompute
- "Submit your symptoms" form — privacy minefield
- Driving / transit routing — dilutes the wedge
- 5th language — two reviewed beats four placeholders
- Indoor air quality / school HVAC data — no public source granular enough
- Share-to-IG cards — nobody scans them in 3 min
- Marketing landing page — app IS the landing page
- Dark mode — pick one, polish it
- Animated splash / lottie loaders — eats hours
- Onboarding wizard — preset chips ARE the onboarding
- Backend in Python + Next.js frontend — two deploys, two failure points
- Real graph-based AQI cost-routing — alternatives-scoring is 90% as good in 1/10th the time
- Personal-health-outcome ML model — methodologically thin
- Live AI Q&A on stage — pre-cached only
- Browser-locale auto-detection — judges' locales unknown
- 5 borough hero scenarios as MUST — NICE-TO-HAVE only
- XGBoost forecasting model as MUST — EPA forecast covers the demo beat with zero training risk
- Email capture / waitlist
- Custom Mapbox Studio tiles — `mapbox/light-v11` is fine
- Switching frameworks at H4 because someone "really likes Svelte" — written here so it can be pointed at

---

## Verification Checklist (run before H18 freeze)

On a phone never opened to the app:
1. Scan QR → app loads <3s on 4G
2. Tap hero-pair chip → fields fill, **block-context card appears FIRST**, map zooms
3. Tap "Find Route" → red route <2s, green Atlas route <4s
4. Maya's card 🔴 + Diego's card 🟢 visible simultaneously
5. Drag scrubber to 4pm → Maya's card flips 🟢
6. Tap 🌐 ES → UI re-renders Spanish, no broken strings
7. Long-press the map → drops pin, route recomputes
8. Type a different Bronx address pair → red+green routes (live API path works)
9. Type Atlanta → graceful "we cover NYC only"
10. Disable wifi → reload preset pair → still works (service worker)
11. Lighthouse mobile: perf >90, PWA installable, a11y >90

If 1–6 pass, demo lands. 7–11 are insurance.

---

## Resolved
- Free tiers only, no custom domain, vercel.app subdomain
- Even-split coding through H12; A pitch-only after H12
- Coverage: 5-borough data; pitch leads Bronx; geocoder NYC-bbox, Bronx-biased
- Hero address: teammate's REAL street address
- Story = school commute; product = general any-to-any (claimed at vision slide only)
- Recommendation matrix: 4 outcomes, EPA + AAP/AAFA cited
- Block context loads FIRST, before routes
- ER data: NYC DOHMH "Asthma ED Visit Rate by ZCTA" (raw SPARCS not public)
- Time-scrubber MUST-HAVE, powered by EPA AirNow forecast endpoint (no ML training)
- XGBoost: NICE-TO-HAVE only (EPA forecast is the must-have driver)
- Multi-kid + severity-tuned recs MUST-HAVE
- Digestible UX (labels not numbers) MUST-HAVE
- Long-press to drop pin MUST-HAVE
- EN + ES MUST-HAVE
- Bengali = +1 stretch only if speaker locked in advance, no floor-recruiting
- Voice mode: NICE-TO-HAVE
- Per-kid Claude 3-sentence explanations: NICE-TO-HAVE (moved from B to D for load relief)
- "Days saved" (labeled estimated): NICE-TO-HAVE
- 30-min standup cadence in chat
- First working end-to-end target = H8, hard freeze = H18
- Hard triage cut-list pre-committed at H8 / H12 / H14 / H16
- One major external API per person: A=NYC DOHMH, B=Mapbox, C=EPA AirNow, D=Anthropic Claude

## Unresolved Questions
- ER data granularity per-ZCTA or per-neighborhood? Person A confirms at H4
- Bengali speaker locked by H0?
- Per-kid Claude explanations: build for Anthropic-judge signal, or stop at must-haves?
- 2 backup Bronx pairs picked by H4?
- XGBoost upgrade attempted, or skipped to free Person C for hyperlocal kNN instead?
