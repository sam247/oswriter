# QueueWrite Telemetry Workbook And Founder Analytics Plan

Looks good. Please proceed, but keep the first execution focused on Phase 1 only unless it is very straightforward to continue.

## Progress Update

Phase 1 workbook execution is now in place and validated for the current dataset.

Completed workbook changes:

* Renamed helper tabs for clarity:

  * `Provider Summary`
  * `Provider Base`
  * `Provider Decisions`
  * `Commercial Viability`
  * `Neon Provider Snapshot`

* Confirmed founder-facing outputs now resolve from the renamed tabs.

* Fixed workbook validation so `Commercial Viability` now reconciles:

  * `Article Rows`: `26` vs `26`
  * `Attributed Providers`: `1` vs `1`
  * `Benchmark Runs`: `1` vs `1`
  * `Unattributed Rows`: `21` vs `21`

* Corrected `Provider Decisions` so `Lifecycle Status` now displays `Tavily: Candidate`.

* Corrected `Provider Base` cost handling so missing unattributed legacy cost fields remain blank instead of `0`.

* Corrected provider cost-derived calculations so current founder-facing commercial outputs now reflect:

  * `Cost / 1,000 Articles`: `49.512`
  * `Cost / 100,000 Articles`: `4951.2`

* Confirmed current Phase 1 decision state for the present workbook data:

  * `Best Quality Provider`: `Tavily`
  * `Fastest Provider`: `Tavily`
  * `Best Value Provider`: `Cost comparison incomplete`
  * `Current Production Provider`: `No attributed production benchmark data`
  * `Production Challenger`: `No current production baseline`
  * `Confidence Level`: `Tavily: Medium`
  * `Lifecycle Status`: `Tavily: Candidate`

Residual note:

* The current benchmark dataset still has only one attributed provider and `21` unattributed legacy rows, so recommendation breadth remains intentionally constrained by the confidence and comparison safeguards.

## Provider Metric Audit Update

Provider metric audit completed before further benchmarking.

Confirmed issue:

* `Provider Summary` was inheriting incorrect Tavily averages from `Provider Base`
* attributed provider rows were mixing article-level score fields from `Article Telemetry` with provider-level benchmark fields from `Provider Telemetry`
* this caused Tavily provider comparison metrics to understate benchmark performance

Workbook corrections applied:

* rewired attributed comparison fields in `Provider Base` to source provider-specific benchmark values from `Provider Telemetry`
* preserved unattributed legacy rows as excluded comparison rows rather than converting missing values to `0`
* corrected downstream summary rollups so `Provider Summary`, `Provider Decision Panel`, `Provider Recommendations`, and the founder dashboard now reflect the corrected benchmark averages

Current Tavily provider comparison outputs now reconcile to the active benchmark row set:

* Avg Quality: `96.6`
* Avg Research: `83.6`
* Avg Evidence: `95.4`
* Avg Research Duration: `10.06`
* Avg Sources Found: `22.2`
* Avg Sources Accepted: `12`
* Avg Research Cost: `0.048`
* Avg Total Cost: `0.049512`

Active included rows for Tavily:

* `article_mqnj278p_oilnsy`
* `article_mqnuju65_3810fa`
* `article_mqnuy49y_z0hlka`
* `article_mqnv65yq_xkeyd8`
* `article_mqnv65yq_8dyymy`

Excluded from provider comparison:

* all `Unattributed` workbook rows
* legacy production baseline rows without valid provider attribution
* rows without valid provider comparison metrics

## Attribution Flow Audit Update

Provider attribution flow audit completed for:

* `Provider Telemetry`
* `Provider Base`
* `Provider Summary`
* `Provider Decisions`
* `FOUNDER DASHBOARD`

Confirmed root cause:

* `Provider Base` attribution columns were still resolving provider identity from the stale `Neon Provider Snapshot`
* that snapshot only contained the initial Tavily-attributed benchmark rows and did not include the newer Production benchmark rows
* as a result, valid `QueueWrite Research` / `Production` rows already present in `Provider Telemetry` were falling through as `Unattributed` in `Provider Base`
* downstream sheets therefore only surfaced Tavily in provider comparison outputs

Workbook correction applied:

* rewired `Provider Base` attribution columns to source provider name, provider type, attribution status, and content profile directly from `Provider Telemetry` by `Article ID`
* preserved exclusion of `Legacy Production Baseline` rows from active provider comparison outputs
* kept legacy rows visible in raw telemetry while preventing them from polluting current benchmark comparisons

Current reconciliation state:

* `Provider Telemetry` rows: `16`
* `Provider Telemetry` rows matched in `Provider Base` by `Article ID`: `16`
* missing provider telemetry rows in `Provider Base`: `0`
* excluded provider telemetry rows: `3`
* exclusion reason: `Legacy Production Baseline`

Current valid attributed benchmark rows flowing into the decision layer:

* `QueueWrite Research` / `Production`: `4`
* `Tavily` / `BYOK`: `9`
* total valid attributed comparison rows: `13`
* unattributed legacy rows remaining in `Provider Base`: `21`

Current decision-layer state after the fix:

* `Current Production Provider`: `QueueWrite Research`
* `Production Challenger`: `Tavily`
* `Best Value Provider`: `Tavily`
* `Best Quality Provider`: `Tavily`
* `Best Research Provider`: `QueueWrite Research`
* `Best Evidence Provider`: `Tavily`

Priority is:

1. Provider Base
2. Provider Summary
3. Provider Decision Panel
4. Provider Recommendations
5. Commercial Viability
6. Founder Dashboard update

Do not spend significant time on Phase 2 or Phase 3 until Phase 1 is working and verified.

Keep Neon validation lightweight. It only needs to confirm row counts, provider counts, benchmark counts and unattributed counts.

Do not modify QueueWrite code, Neon schemas, migrations, telemetry persistence, provider settings, auth, billing or generated export logic.

## Summary

Turn the existing `writer_telemetry` workbook into a founder decision dashboard using workbook-only changes plus lightweight read-only Neon validation. The implementation will not modify QueueWrite application logic, telemetry persistence, database schemas, provider settings, auth, billing, or QueueWrite-generated exports.

The workbook will continue to use the existing raw export tabs as its source layer:

* `Daily Summary`

* `Article Telemetry`

* `Provider Telemetry`

* `Anomalies`

The founder-facing workbook must answer these questions within a few seconds of opening:

1. Which provider currently performs best?
2. Which provider provides the best value?
3. Is there a production challenger?
4. Is there enough data to make a decision?
5. What would provider costs look like at scale?

## Current State Analysis

### Source Systems

* Workbook: Google Sheet `writer_telemetry` (`1G0wbTt7xPoobZZncWZ1K-Y9EP2CjvmOrKP3WZvtAC3o`)

* Neon project: `purple-fire-64344998`

* Existing workbook-facing export code writes to `Daily Summary`, `Article Telemetry`, `Provider Telemetry`, and `Anomalies` from `lib/telemetry/sheets-export.ts`

* Existing provider architecture documented in `docs/internal/research-providers.md`:

  * `queuewrite` => Production

  * `queuewrite_experimental` => Experimental

  * `byok` => BYOK

### Verified Neon Reality

* `generation_telemetry` currently has `26` rows across `26` distinct articles and `1` benchmark run (`Provider Benchmark 2026-06`)

* `telemetry_export_status` currently shows:

  * `Article Telemetry`: `26` exported rows

  * `Provider Telemetry`: `5` exported rows

  * `Daily Summary`: `6` exported rows

  * `Anomalies`: `2` exported rows

* Fully attributed provider rows currently exist only for BYOK / Tavily:

  * Provider key `byok`

  * Provider name `Tavily`

  * Provider type `BYOK`

  * Sample size `5`

  * Confidence band `Medium`

* There are `21` legacy telemetry rows with missing `research_provider_name`, missing `research_provider_type`, and missing `content_profile`

* Those `21` legacy rows must be shown as `Unattributed` and must be excluded from rankings, recommendations, challenger logic, and provider comparisons

* Current benchmark coverage observable in Neon:

  * `construction`: `9`

  * `saas`: `10`

  * `general` or missing: `7`

* One row has missing `industry`

### Workbook Reality

* The workbook already contains a founder-facing dashboard sheet with a mostly static provider benchmark section

* That section currently lists named providers but does not yet calculate automatic recommendations, challenger status, lifecycle status, or lightweight Neon reconciliation

## Assumptions And Decisions

* Neon remains the source of truth; workbook logic will summarize exported Neon-derived telemetry and will not invent provider identities

* Provider grouping will be based on provider type and telemetry fields, never on benchmark run naming

* Future providers must appear automatically from workbook data; provider names will not be hardcoded in formulas

* Legacy rows with missing provider attribution will be labeled `Unattributed`

* `Unattributed` rows will be included in coverage, validation, and data quality only

* `Unattributed` rows will be excluded from rankings, recommendations, challenger logic, and side-by-side provider comparisons

* Missing values remain blank or `Missing`; formulas will not coerce missing metrics to `0`

* Score averages will only use valid positive score cells; zero-score rows will be surfaced as data-quality issues

* `Efficiency Rank` and `Best Value Provider` will use a quality-per-dollar approach

* Trend labels will compare the most recent `5` provider runs against the previous `5` provider runs when enough data exists

* Equivalence rules:

  * treat providers as equivalent when the score difference is less than `3` points

  * or when the difference is less than `5%`

  * display `Equivalent` or `No clear winner` rather than forcing a sole winner

* Cost safeguards:

  * if any compared provider lacks reliable cost data, show `Cost comparison incomplete`

  * do not declare `Lowest Cost Provider`

  * do not declare `Best Value Provider`

* Production recommendation safeguards:

  * do not recommend a production provider when benchmark confidence is `Low`

  * instead show current observations, benchmark status, and confidence level

  * suppress provider promotion recommendations in that state

* Production challenger criteria:

  * quality within `3` points of Production

  * and cost at least `20%` lower or speed at least `10%` faster

  * but sample size or confidence not yet sufficient for a production recommendation

## Delivery Order

### Phase 1: Highest Value

1. `Provider Base`
2. `Provider Summary`
3. `Provider Decision Panel`
4. `Provider Recommendations`
5. `Commercial Viability`
6. `FOUNDER DASHBOARD` update

### Phase 2

1. `Provider Health`
2. `Benchmark Coverage`
3. `Provider Lifecycle Status`

### Phase 3

1. `Provider Trends`
2. `Data Quality`
3. `Neon Validation Snapshot`

## Proposed Changes

### Workbook File

* Google Sheet `writer_telemetry`

  * update existing founder dashboard content

  * add helper and summary tabs

  * keep QueueWrite-generated raw export tabs intact

### Phase 1

#### 1. Add `Provider Base`

What:

* Create a normalized helper tab that uses `Article Telemetry` as the master row set and enriches it with `Provider Telemetry` by `Article ID`

Why:

* `Article Telemetry` contains all `26` benchmarked articles

* `Provider Telemetry` currently contains only `5` fully attributed rows

* A helper layer is required to keep formulas maintainable and to handle `Unattributed` rows correctly without redefining Neon

How:

* Build one row per article with these derived fields:

  * Date

  * Benchmark Run

  * Article ID

  * Article Title

  * Provider Key

  * Provider Name

  * Provider Type

  * Provider Attribution Status

  * Content Profile

  * Industry

  * Audience

  * Region

  * Word Count

  * Quality Score

  * Research Score

  * Evidence Score

  * Research Duration Seconds

  * Sources Found

  * Sources Accepted

  * Acceptance Rate

  * Evidence Extracted

  * Evidence Used

  * Evidence Yield

  * Evidence Utilisation

  * Research Cost

  * Generation Cost

  * Total Cost

  * Cost Per Accepted Source

  * Cost Per Evidence Item

  * Cost Per 1,000 Words

  * Words Per Dollar

  * Credits Used

  * Data Status

  * Data Quality Flags

* Derive `Sources Found` as `Sources Accepted + Sources Rejected` from `Article Telemetry` when a provider-side value is unavailable

* Use `XLOOKUP` by `Article ID` to bring provider fields into the base row

* Default missing provider fields to:

  * Provider Key: `Unattributed`

  * Provider Name: `Unattributed`

  * Provider Type: `Unattributed`

  * Provider Attribution Status: `Unattributed`

* Keep cost fields blank if their underlying inputs are incomplete

* Add flags for:

  * missing provider metadata

  * missing content profile

  * zero score values

  * missing cost components

  * missing duration

#### 2. Add `Provider Summary`

What:

* Create the core provider benchmark table that powers the rest of the workbook

Why:

* This is the highest-value founder view because it centralizes quality, cost, efficiency, sample size, and confidence

How:

* Dynamically build the provider list from unique attributed providers in `Provider Base`

* Include these columns per provider:

  * Provider Name

  * Provider Type

  * Articles Tested

  * Sample Size

  * Benchmark Confidence

  * Lifecycle Status

  * Average Quality Score

  * Average Research Score

  * Average Evidence Score

  * Average Research Duration

  * Average Sources Found

  * Average Sources Accepted

  * Acceptance Rate %

  * Average Evidence Extracted

  * Average Evidence Used

  * Evidence Yield %

  * Evidence Utilisation %

  * Average Research Cost

  * Average Total Cost

  * Cost Per Accepted Source

  * Cost Per Evidence Item

  * Cost Per 1,000 Words

  * Words Per Dollar

  * Average Word Count

  * Average Credits Used

  * Provider Funnel Summary

  * Data Quality Warning Count

* Confidence rule:

  * `1-3` articles => `Low`

  * `4-9` articles => `Medium`

  * `10+` articles => `High`

* Lifecycle rule:

  * `Candidate` => fewer than `10` articles

  * `Under Evaluation` => `10-24` articles

  * `Production Ready` => `25+` articles

  * `Production` => current active production provider

  * `Retired` => provider exists historically but has no rows in the current benchmark window

* `Unattributed` will be shown in a separate block for coverage and quality context only

#### 3. Add `Provider Decision Panel`

What:

* Create the side-by-side comparison block used to determine which provider currently performs best

Why:

* This is the founder’s comparison panel for speed, quality, evidence strength, cost, and value

How:

* For each attributed provider, calculate:

  * Quality Rank

  * Research Rank

  * Evidence Rank

  * Speed Rank

  * Cost Rank

  * Efficiency Rank

  * Overall Rank

* Ranking rules:

  * higher is better for quality, research, evidence, and words-per-dollar

  * lower is better for speed and cost

  * `Efficiency Rank` uses a quality-per-dollar composite

  * `Overall Rank` combines quality, research, evidence, speed, cost, and efficiency

* Tie logic:

  * if the top two providers fall inside the equivalence threshold, display `Equivalent` or `No clear winner`

* Cost safeguard:

  * if any compared provider lacks reliable cost data, display `Cost comparison incomplete`

  * suppress `Lowest Cost Provider`

  * suppress `Best Value Provider`

#### 4. Add `Provider Recommendations`

What:

* Create a simplified founder-facing recommendation tab focused on the decisions that matter most

Why:

* The workbook should emphasize founder-level provider selection rather than overproducing recommendation categories

How:

* Primary outputs:

  * Current Production Provider

  * Production Challenger

  * Best Value Provider

  * Best Quality Provider

  * Best Research Provider

  * Best Evidence Provider

  * Fastest Provider

  * Benchmark Status

  * Confidence Level

  * Current Observations

* Remove:

  * Recommended Experimental Provider

  * Recommended BYOK Provider

* Recommendation gates:

  * only attributed providers participate

  * only `Medium` or `High` confidence providers can be recommended

  * do not recommend a production provider when production confidence is `Low`

  * when confidence is `Low`, show observations and benchmark status instead

* Production challenger logic:

  * compare non-production providers against the current production provider

  * flag a provider as `Production Challenger` when:

    * quality is within `3` points of Production

    * and cost is at least `20%` lower or speed is at least `10%` faster

    * but sample size or confidence is still insufficient for a production recommendation

* Promotion guidance:

  * show `Promote`, `Hold`, `Demote`, or `Retire` only when the confidence gates allow it

  * suppress promotion guidance when production confidence is `Low`

#### 5. Add `Commercial Viability`

What:

* Add scale-cost projections based on observed provider costs

Why:

* This provides the majority of remaining founder decision value after the summary and recommendations

How:

* For each attributed provider, calculate:

  * Estimated Cost Per 100 Articles

  * Estimated Cost Per 1,000 Articles

  * Estimated Cost Per 10,000 Articles

  * Estimated Cost Per 100,000 Articles

* Base projections on average total cost per article

* Also show research-only and total-cost views when data is complete

* If cost completeness is insufficient, show `Cost comparison incomplete`

#### 6. Update `FOUNDER DASHBOARD`

What:

* Replace the current static benchmark area with formula-driven decision cards

Why:

* This is the workbook entry point and must surface the highest-value answers immediately

How:

* Point dashboard cards to the Phase 1 summary tabs

* Show:

  * Current Production Provider

  * Production Challenger

  * Best Value Provider

  * Best Quality Provider

  * Fastest Provider

  * Confidence Level

  * Benchmark Status

  * Lifecycle Status for each attributed provider

  * Commercial Viability headline figures

* When confidence is low, display:

  * current observations

  * benchmark status

  * confidence level

  * no production recommendation

### Phase 2

#### 7. Add `Provider Health`

What:

* Create scan-fast provider health cards

Why:

* The founder should understand provider status in seconds without scanning large tables

How:

* Show one card per attributed provider with:

  * Provider

  * Articles Tested

  * Confidence

  * Lifecycle Status

  * Quality

  * Research

  * Evidence

  * Speed

  * Cost

  * Acceptance Rate

  * Current Recommendation

  * Production Challenger flag

* Show a separate `Unattributed` observations card

#### 8. Add `Benchmark Coverage`

What:

* Create category/topic coverage reporting and display it alongside recommendations

Why:

* Provider decisions should not be based on narrow benchmark coverage

How:

* Use `industry` as the primary Neon-backed category source, with mapping:

  * `construction` => `Construction`

  * `saas` => `SaaS`

  * `procurement` or audience containing `procurement` => `Procurement`

  * `finance` => `Finance`

  * `healthcare` => `Healthcare`

  * everything else, including `general` and missing => `Other`

* Build a coverage table with:

  * Category

  * Articles Tested

  * Providers Tested

  * Unattributed Articles

  * Coverage Confidence

* Show a coverage summary next to founder recommendations so narrow coverage is visible before decisions are made

#### 9. Add `Provider Lifecycle Status`

What:

* Make lifecycle status a first-class reporting field across the workbook

Why:

* The founder needs to see where each provider sits in the evaluation process

How:

* Display lifecycle status in:

  * `Provider Summary`

  * `Provider Recommendations`

  * `Provider Health`

  * `FOUNDER DASHBOARD`

* Use these statuses:

  * `Candidate`

  * `Under Evaluation`

  * `Production Ready`

  * `Production`

  * `Retired`

### Phase 3

#### 10. Add `Provider Trends`

What:

* Create rolling trend reporting for each provider

Why:

* Trend context is useful, but lower priority than immediate founder decisions

How:

* Measure trends for:

  * Quality

  * Research

  * Evidence

  * Duration

  * Cost

  * Acceptance Rate

  * Evidence Yield

* Use the most recent `5` provider runs versus the previous `5` provider runs when both windows exist

* Trend outputs:

  * `Improving`

  * `Stable`

  * `Declining`

  * `Insufficient sample size`

#### 11. Add `Data Quality`

What:

* Create a dedicated warning tab

Why:

* Current Neon data has visible attribution and completeness gaps that should not be hidden

How:

* Track:

  * Unattributed article count

  * Missing content profile count

  * Missing provider metadata count

  * Missing cost data count

  * Zero score row count

  * Rows excluded from rankings and recommendations

* Add explicit warnings such as:

  * `Provider comparison incomplete due to unattributed legacy telemetry`

  * `Cost comparison incomplete`

  * `Benchmark coverage narrow for some categories`

#### 12. Add `Neon Validation Snapshot`

What:

* Add a lightweight workbook tab populated from read-only Neon rollups during execution

Why:

* Validation is necessary, but it should stay lightweight because provider decision-making is more important than a large validation framework

How:

* Populate only the minimum reconciliation fields:

  * extract timestamp

  * generation\_telemetry row count

  * distinct article count

  * benchmark run count

  * provider counts

  * unattributed row count

* Use workbook formulas to compare workbook counts against the snapshot

* Flag only these discrepancy types:

  * workbook counts differ from Neon

  * provider counts differ from Neon

  * benchmark counts differ from Neon

## Formula And Implementation Notes

* Use workbook-native formulas only; do not change QueueWrite code or export logic

* Prefer helper tabs plus referenced summary tabs rather than long dashboard formulas

* Use dynamic-array functions such as:

  * `ARRAYFORMULA`

  * `FILTER`

  * `UNIQUE`

  * `SORT`

  * `QUERY`

  * `XLOOKUP`

  * `LET`

  * `IF`

  * `IFERROR`

  * `COUNTIFS`

  * `AVERAGEIFS`

  * `SUMIFS`

  * `SPARKLINE`

* Preserve blank cells for missing inputs and wrap ratios with denominator checks

* Keep raw export tabs untouched except for read-only references

* Keep formatting functional and founder-oriented rather than decorative

## Verification Steps

1. Confirm raw-sheet availability:

   * `Daily Summary`

   * `Article Telemetry`

   * `Provider Telemetry`

   * `Anomalies`
2. Confirm `Provider Base` row count matches `Article Telemetry` row count
3. Confirm `Unattributed` count matches Neon missing-provider count
4. Confirm provider summary sample sizes match Neon attributed provider counts
5. Confirm confidence labels match the `1-3 / 4-9 / 10+` rule
6. Confirm lifecycle statuses follow the defined thresholds and production flag
7. Confirm equivalence logic suppresses forced winners inside the `3 points / 5%` band
8. Confirm low-confidence states suppress production recommendations and promotion guidance
9. Confirm cost-incomplete states suppress `Lowest Cost Provider` and `Best Value Provider`
10. Confirm challenger logic only flags providers meeting the challenger criteria
11. Confirm coverage categories sum back to the total benchmark article count
12. Confirm commercial viability projections equal average total cost multiplied by the requested scale factors
13. Confirm the lightweight `Neon Validation Snapshot` reconciles counts, provider counts, and benchmark counts only
14. Confirm no QueueWrite code, migrations, exports, or schema objects are modified

## Success Criteria

* The workbook answers:

  * which provider currently performs best

  * which provider provides the best value

  * whether a production challenger exists

  * whether there is enough data to decide

  * what provider costs look like at scale

* Those answers are visible within a few seconds of opening the workbook

* Founder-facing outputs are automatic and formula-driven

* Provider recommendations are confidence-gated and cost-gated

* Legacy telemetry remains visible but does not distort provider comparisons

## Execution Boundaries

* Allowed during execution:

  * Google Sheet tab creation

  * Google Sheet formula updates

  * Google Sheet dashboard and chart updates

  * read-only Neon SQL

  * lightweight workbook validation snapshots

* Not allowed during execution:

  * QueueWrite application code changes

  * database migrations

  * schema changes

  * telemetry persistence changes

  * auth, billing, or provider-setting changes

  * edits to QueueWrite-generated export logic
