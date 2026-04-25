![AirAware system design](system-design.png)

## Inspiration

One of us grew up in the Bronx, where pediatric asthma ER rates
are 4–5× the NYC average. The other two of us come from countries
where air quality is a daily constraint, not a news event — and
one of those countries has some of the worst winter air pollution
on Earth. One of our teammates' moms grew up in Soviet-era Ukraine,
allocated an apartment along a highway corridor with some of the
worst air in the city. You took the apartment the state gave you.

We're bonded over bad air. For us, this is everyday.

For the rest of New York, the day everyone *else* noticed was
**June 7th, 2023** — the morning the city woke up to an orange sky.
Canadian wildfire smoke had drifted hundreds of miles south. AQI hit
300+, the worst reading in NYC history. Schools closed. Outdoor
workers were sent home. People who'd never thought about air quality
in their lives were suddenly refreshing AirNow on their phones.

Then it cleared. Most New Yorkers moved on. Bronx kids didn't.

That's who we built for — the families for whom orange-sky day
is just a louder version of a Tuesday. Air-quality data is everywhere
(EPA, NYC DOHMH, Open-Meteo all publish hourly), but none of it lands
as a daily decision for the parent at the door with a backpack in
their hand. We built the tool we wished our families had.

## What it does

AirAware lets a NYC parent type two addresses (home + school, home + park,
anywhere) and see two walking routes side-by-side: the standard fastest
route in red, and an AQI-aware "Atlas" route in green that re-routes around
high-pollution corridors like bus depots and elevated highways.

For each kid in the family — name, age, asthma severity — the app gives a
**per-kid recommendation**: walk the standard route, walk the cleaner Atlas
route, take a brief walk only, or stay inside today. The recommendations
come out of a transparent threshold matrix grounded in **EPA AQI bands and
AAP/AAFA pediatric asthma guidance**.

A **time-scrubber** shows how the recommendation changes across the day —
driven by Open-Meteo's CAMS hourly air-quality forecast at each ZIP code's
centroid. The killer beat: a parent can see that even though Maya can't
walk now, she'll be able to walk at 4 PM when the bus depot quiets down.

A **block-level context card** loads first on the home address, surfacing
NYC DOHMH pediatric asthma ED data in plain language: *"About 1 in 24 kids
on this block went to the ER for asthma last year. 4.5× the NYC average."*

The app is bilingual on day one — **English and Spanish, plus Mandarin,
Russian, and Arabic** — because half the parents we built for don't speak
English at home.

## How we built it

**Frontend.** Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui.
Mobile-first PWA, installable. Mapbox GL JS for the map. Zustand for kid
profile state, persisted to localStorage. `next-intl` for i18n.

**Routing engine.** Mapbox Directions returns walking-route alternatives.
We score each by sampling the polyline at 50m, looking up each sample in
our 200m AQI grid via bilinear interpolation, and accumulating exposure-
minutes (time spent in AQI > 80). The cleanest alternative becomes Atlas.
For pairs where Mapbox returns no useful alternative, we inject a
perpendicular waypoint to force a residential detour.

**Air-quality data layer.** A 200×200m AQI grid covering all 5 NYC
boroughs, fused from EPA AirNow + PurpleAir + OpenAQ observations,
IDW-interpolated, with an NO₂ boost along major highway corridors based
on traffic-source modeling. Hourly forecasts come from Open-Meteo's
CAMS-derived `us_aqi` endpoint — keyless, true-hourly, no demo-day model
risk.

**Recommendation engine.** A deterministic threshold matrix in
`src/lib/recommendation.ts`: severity (mild/moderate/severe) × age
(adjusts down for under-7s) → max-AQI cap + max-exposure-minutes cap.
Each kid's verdict is computed from their profile and the route's
exposure stats. Cited against EPA AQI sensitive-group thresholds and
AAP/AAFA pediatric asthma management guidance.

**Health-equity context.** NYC DOHMH "Asthma ED Visit Rate by ZCTA" data
ingested from the NYC Open Data Socrata endpoint, transformed into a
ZCTA-keyed JSON with rate, ratio-to-NYC-average, and a `one_in_n` field
for plain-language UI copy. The block-context card reads this on home
geocode and renders before the routes do.

**Hosting.** Vercel free tier. Static AQI / forecast / DOHMH JSON served
from the edge — sub-second cold loads on a phone.

## Challenges we ran into

**Mapbox alternatives sometimes don't diverge.** For our hero pair (a
750m walk), Mapbox returned only one route — no useful alternative to
score. We solved it by injecting a perpendicular waypoint into the
alternatives request, computing a residential-side detour, and verifying
the result's shared-edge ratio with the standard is below 0.7 (visibly
different on stage).

**EPA AirNow's free tier is sparse.** PM2.5 sensor density isn't
fine-grained enough for a 200m grid. We layered in PurpleAir (community
sensors) + OpenAQ (regulatory + community) + an NO₂ boost along major
highway corridors. The Atlas route's "avoid the bus depot corridor"
behavior emerges from this fusion.

**The 4 PM flip is fragile.** The pitch's killer beat ("Maya can walk
at four") depends on the hero ZIP's atlas route dropping below AQI 50
at 4 PM. EPA's published forecast for a Bronx ZIP often won't produce
that clean a swing. We documented a hand-tuned overrides layer in the
forecast pipeline — applied last, openly labeled in the data as
`source: "hand_tuned"`. We own the trade-off rather than hide it.

**The hero address straddles two ZIP codes.** The Hunts Point Ave &
Bruckner Blvd intersection sits on the 10454/10474 boundary. Mapbox
geocodes it to 10474, but the storyteller's stoop is on the 10454 (Mott
Haven) side, which is the ZCTA the pitch's "1 in 24" beat depends on.
We routed this disambiguation through a single override function in the
block-context lookup — documented inline.

## Accomplishments that we're proud of

- **The data is real.** Every number on stage maps back to a public
  source (NYC DOHMH, EPA AirNow, Open-Meteo CAMS, OpenAQ, PurpleAir).
- **The recommendation matrix is one auditable file.** Anyone — judges,
  parents, pediatricians, public health officials — can read
  `src/lib/recommendation.ts` and understand the logic. No black box.
- **5 languages, day one.** Translation as a product decision, not a
  checkbox at the end.
- **Sub-second on a phone.** Static JSON at the edge, no backend
  bottlenecks.
- **No ML training, no demo-day model risk.** The forecast engine is
  Open-Meteo CAMS, deterministic, keyless. We can re-pull it on stage
  if a judge asks.

## What we learned

- Public-health data is plentiful but structured for *policy reports*,
  not *daily decisions*. Most of our work was the translation layer:
  taking ZCTA-keyed CSVs and turning them into "1 in 24 kids on your
  block."
- Walking-route engines optimize for distance and time, not exposure.
  AQI-aware routing is a tiny additive layer on top of any directions
  API — about 200 lines of TypeScript. The reason it doesn't exist
  isn't technical; nobody built it.
- The Bronx is the front door, not the ceiling. We built for the
  families with the most acute need, but the engine is general.

## What's next for AirAware

- **Ship to the Bronx Asthma Coalition.** Pilot with the families we
  built for. Every recommendation logged becomes a research dataset on
  what parents actually need.
- **Beyond walking.** School siting decisions, recess timing, bus
  depot relocation arguments — every one of them gets stronger when
  grounded in a route a parent actually walks.
- **Hyperlocal AQI interpolation.** Replace IDW with a kNN regressor
  weighted by meteorology and traffic-source modeling. Same JSON
  shape out, sharper Atlas routing.
- **More languages.** Bengali, Haitian Creole — picked by the
  communities the Bronx Asthma Coalition serves, not by us.
