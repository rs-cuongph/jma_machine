# JMA Worker Handler (No-Code Documentation)

## Purpose

The JMA Worker handler is the AWS Lambda entry point that consumes messages from the **JMA Worker SQS queue** and delegates processing to the JMA worker service.

## Trigger Source

- **Event source**: Amazon SQS (Lambda trigger).
- **Batching**: The Lambda invocation may contain multiple SQS records.

## Input Contract (per SQS record)

- The handler expects `event.Records[]`.
- Each record must contain a JSON `body` with at least:
  - **`event_id`**: integer ID of a `jma_event` row in the database.

Example conceptual payload:

- `{"event_id": 123}`

## Processing Flow

For each SQS record:

- Parse the record body as JSON.
- Call `JmaWorkerService.process(body)` using the parsed body dict.
- Log the returned summary from the service.

## Output Contract (Lambda response)

The handler returns a small summary object:

- **`processed`**: number of records for which the handler successfully invoked the worker service (i.e., parsing + call succeeded).
- **`errors`**: number of records that raised an exception in the handler loop.

If `event.Records` is missing/empty:

- Returns `{ "processed": 0 }`.

## Error Handling Behavior

- Exceptions are handled **per record**:
  - One failing record does not stop processing of other records in the same batch.
- When an exception occurs:
  - The handler logs the exception and increments `errors`.
  - The handler continues to the next record.

## Service Contract (High-Level)

`JmaWorkerService.process()` is responsible for the end-to-end business logic, including:

- Loading the `jma_event` by `event_id`.
- Fetching the telegram XML from `xml_url`.
- Routing to the correct parser based on title/type.
- Matching active triggers and firing safety confirmations.
- Updating event status (e.g., queued/processing/processed/error/ignored).

The handler itself does **not** implement parsing or matching logic; it is a thin orchestration layer around the service.

## Service Contract (Detailed Behavior)

This section documents the behavior of `JmaWorkerService.process()` at a functional level (no code).

### Inputs

The service is invoked with a dict that must include:

- **`event_id`**: integer

Optionally, the caller may also provide:

- **`xml_url`**: string (overrides DB value)
- **`title`**: string (overrides DB value)
- **`feed_name`**: string (overrides DB value)

In normal operation (triggered by the poller), only `event_id` is provided and the service loads everything else from the `jma_event` table.

### Status gating / idempotency guard

The service first loads the `jma_event` row by `event_id` and checks its current status.

- If the row does not exist: returns **`not_found`**.
- If status is not **`queued`** or **`error`**: the event is treated as already handled and the service returns early without firing triggers.

This is the primary guard against duplicate processing from SQS retries.

### State machine

During processing the service updates `jma_event.status`:

- `queued` → `processing` at start
- `processing` → `processed` on success (and sets `processed_at`)
- `processing` → `ignored` if no parser applies / the telegram is not relevant for supported types
- `processing` → `error` on failures (and writes a short `error_message`)

### Step-by-step workflow

1. **Load `jma_event`**
   - Fetches event metadata: `xml_url`, `title`, `feed_name`, `status`.

2. **Fetch telegram XML**
   - Downloads the XML from `xml_url` using HTTP GET with retry.
   - If download fails: marks the event as `error` and stops.

3. **Route to parser**
   - Routes by title keywords to one of: earthquake / weather / tsunami / volcano / landslide.
   - If no parser matches or parsing returns no usable result: marks the event as `ignored` and stops.

4. **Load triggers and regions**
   - Loads all active triggers for matching.
   - Applies frequency throttling (do not fire the same trigger more often than `frequency_hours`).
   - Batch-loads `trigger_region` rows for the eligible triggers.

5. **Match triggers**
   - Runs event-type-specific matcher logic over each eligible trigger + its regions.
   - Produces a list of matched triggers.

6. **Fire actions for matched triggers**
   - For each matched trigger, creates a Safety Confirmation:
     - Clones title/form config/questions from the trigger’s template.
     - Determines recipients (send-to-all or explicit recipients).
     - Creates response records and enqueues notifications.
   - Updates `trigger.last_triggered_at` after firing.
   - If firing one trigger fails, the service logs and continues with remaining triggers.

7. **Finalize**
   - Marks the event as `processed` and returns `{ event_id, status: \"processed\", triggers_fired }`.

### Filtering and parser specifications

This section defines the concrete filter and parser behavior used by the worker.

#### A. Poller pre-filter (how events enter the system)

Before the worker ever runs, the poller filters Atom entries by feed-specific title keywords:

- `feed=eqvol`: includes entries whose title contains any of:
  - `震源・震度に関する情報` (earthquake)
  - `津波警報・注意報・予報` (tsunami)
  - `噴火警報・予報` (volcano)
- `feed=extra`: includes:
  - `気象特別警報・警報・注意報` (weather)
  - `土砂災害警戒情報` (landslide)
- `feed=other`: includes:
  - `津波警報・注意報・予報` (tsunami)

The poller inserts a `jma_event` row with:

- `xml_url`: Atom `<link href="...">` (telegram URL)
- `title`: Atom `<title>`
- `feed_name`: the feed key (`extra|eqvol|other`)
- `status`: `queued`

#### B. Worker routing (title → parser + event_type)

Within the worker, parser routing is performed by substring checks on `title`:

- Title contains `震源・震度に関する情報` → **earthquake**
- Title contains `気象特別警報・警報・注意報` → **weather**
- Title contains `津波警報・注意報・予報` → **tsunami**
- Title contains `噴火警報・予報` → **volcano**
- Title contains `土砂災害警戒情報` → **landslide**

If none matches, the worker marks the event as `ignored`.

#### C. Common parser acceptance rules

All supported telegram parsers apply a common “ignore non-real messages” rule:

- If `Control/Status` exists and is not `通常`, the parser returns `None`.

Most parsers also gate on `Head/InfoType` and accept only:

- `発表` (issue)
- `訂正` (correction)
- `遅延` (delay)

If not accepted, the parser returns `None` and the worker marks the event as `ignored`.

#### D. Parser output contract (what matchers receive)

Each parser returns a typed `*DisasterInfo` object (or `None`).

##### 1) Earthquake parser (`震源・震度に関する情報`)

- Output: `EarthquakeDisasterInfo`
- Key fields:
  - `prefectures[]`: each has a 2-digit JMA prefecture code and max intensity
  - `cities[]`: each has a JMA city code and max intensity (when present)

##### 2) Weather parser (`気象特別警報・警報・注意報`)

- Output: `WeatherDisasterInfo`
- Key fields:
  - `items[]`: each item contains:
    - `info_type` (prefecture-level vs city-level variants)
    - `warning_code` (mapped to system alert values)
    - `status` (must be active/triggerable for matching)
    - `area_code` (6-digit area for prefecture forecast zones; or city-level code)

XML extraction (per item):

- `issued_at`:
  - `Head/ReportDateTime` (`ib:Head/ib:ReportDateTime`)
- `info_kind`:
  - `Head/InfoKind` (`ib:Head/ib:InfoKind`)
- `items[]` are produced from `Head/Headline/Information` blocks:
  - `info_type`:
    - attribute `type` on `ib:Information` (`ib:Head/ib:Headline/ib:Information[@type]`)
  - `warning_code`, `warning_name`, `status`:
    - from `ib:Item/ib:Kind` under each `ib:Information`:
      - `warning_code`: `ib:Kind/ib:Code`
      - `warning_name`: `ib:Kind/ib:Name`
      - `status`: `ib:Kind/ib:Status` (may be empty; matcher handles empty status)
  - `area_name`, `area_code`:
    - from each `ib:Item/ib:Areas/ib:Area`:
      - `area_name`: `ib:Area/ib:Name`
      - `area_code`: `ib:Area/ib:Code`

##### 3) Tsunami parser (`津波警報・注意報・予報`)

- Output: `TsunamiDisasterInfo`
- Key fields:
  - `items[]`: each item contains:
    - `warning_code` (used to classify warning vs advisory)
    - `area_code` (JMA tsunami coastal forecast zone code, typically 3-digit string)

XML extraction (per item):

- `issued_at`:
  - `Head/ReportDateTime` (`ib:Head/ib:ReportDateTime`)
- `items[]` are produced from the seismology body forecast list:
  - Container:
    - `Body/Tsunami/Forecast/Item` (`seismo:Body/seismo:Tsunami/seismo:Forecast/seismo:Item`)
  - `area_name`, `area_code`:
    - `seismo:Item/seismo:Area/seismo:Name`
    - `seismo:Item/seismo:Area/seismo:Code`
  - `warning_name`, `warning_code`:
    - prefer current:
      - `seismo:Item/seismo:Category/seismo:Kind/seismo:Name`
      - `seismo:Item/seismo:Category/seismo:Kind/seismo:Code`
    - fallback:
      - `seismo:Item/seismo:Category/seismo:LastKind/seismo:Name`
      - `seismo:Item/seismo:Category/seismo:LastKind/seismo:Code`

##### 4) Volcano parser (`噴火警報・予報`)

- Output: `VolcanoDisasterInfo`
- Key fields:
  - `warning_name`, `warning_code`, `warning_condition` (from Headline/Information type `噴火警報・予報（対象市町村等）`)
  - `affected_cities[]`: list of JMA city codes from the same block
  - `volcano_name`, `alert_level`: extracted from `Headline/Text` (best-effort)

If the parser cannot find the `対象市町村等` block, `affected_cities` may be empty, which prevents matching.

XML extraction:

- `issued_at`:
  - `Head/ReportDateTime` (`ib:Head/ib:ReportDateTime`)
- `volcano_name`, `alert_level`:
  - extracted by regex from `Head/Headline/Text` (`ib:Head/ib:Headline/ib:Text`)
- `warning_name`, `warning_code`, `warning_condition`, `affected_cities[]`:
  - from the first `ib:Information` block with:
    - `@type="噴火警報・予報（対象市町村等）"`
  - within that block:
    - `warning_name`: `ib:Item/ib:Kind/ib:Name`
    - `warning_code`: `ib:Item/ib:Kind/ib:Code`
    - `warning_condition`: `ib:Item/ib:Kind/ib:Condition`
    - `affected_cities[]`: for each `ib:Area` under `ib:Item/ib:Areas`:
      - city code from `ib:Area/ib:Code`

##### 5) Landslide parser (`土砂災害警戒情報`)

- Output: `LandslideDisasterInfo`
- Key fields:
  - `target_area_code`: 6-digit prefecture code (used to derive prefecture_id)
  - `areas[]`: city/town areas with `code` plus warning `code/status`

XML extraction:

- `issued_at`:
  - `Head/ReportDateTime` (`ib:Head/ib:ReportDateTime`)
- `prefecture_title`:
  - `Head/Title` (`ib:Head/ib:Title`)
- `target_area_code`:
  - `Body/TargetArea/Code` in meteorology body namespace:
    - `.../Body/TargetArea/Code` (`meteorology1:Body/meteorology1:TargetArea/meteorology1:Code`)
- `areas[]` are produced from `Head/Headline/Information[@type="土砂災害警戒情報"]`:
  - `warning_code`:
    - `ib:Item/ib:Kind/ib:Code`
  - `status`:
    - prefer `ib:Item/ib:Kind/ib:Status`, else fallback to `ib:Item/ib:Kind/ib:Condition`
  - each affected area:
    - `code`: `ib:Item/ib:Areas/ib:Area/ib:Code`
    - `name`: `ib:Item/ib:Areas/ib:Area/ib:Name`

#### E. Matcher specifications (how triggers are matched)

This section defines how each event type is matched against triggers and their regions.

##### Shared: trigger prerequisites

- Triggers are loaded from the database as “active and not deleted”.
- Triggers are filtered by **frequency throttling** before matching:
  - If `frequency_hours` is missing/invalid (<= 0): the trigger is allowed (fail-open).
  - If `last_triggered_at` is missing: the trigger is allowed.
  - Otherwise, the trigger is allowed only when `now - last_triggered_at >= frequency_hours`.
- A trigger can have multiple `trigger_region` rows; **any one** matching region is sufficient.

##### Shared: region matching (`_region_matches`)

The matcher uses a shared region predicate with the following rules:

- If a `trigger_region` row has **`prefecture_id`**:
  - It matches only when the event’s `prefecture_id` equals that `prefecture_id`.
- Else if a `trigger_region` row has **`region_id` only**:
  - It matches only when the event’s `prefecture_id` is in the set of prefectures belonging to that region.
  - The region → prefectures map is loaded from `common/constants/jma_areas.json`.
- Else (no `prefecture_id` and no `region_id`):
  - It matches any prefecture (broad, backward compatible).

Some event types additionally support a stricter code-level match:

- `jma_city_code` for city-level matching (earthquake, weather city-level, volcano, landslide).
- `jma_tsunami_code` for tsunami coastal-zone matching.

##### 1) Earthquake matcher

Trigger configuration:

- Requires `trigger.earthquake_intensity` (float threshold). If missing, the trigger never matches earthquake events.

Matching logic:

- For each prefecture in the telegram:
  - Convert JMA `Pref.Code` (2-digit string) to system `prefecture_id` via `jma_eq_pref_code_to_prefecture_id`.
  - For each `trigger_region` row:
    - Require `_region_matches(trigger_region, prefecture_id)`.
    - If the region row has `jma_city_code`:
      - Match only when any `City.Code` equals `jma_city_code` and that city’s MaxInt meets/exceeds the threshold.
    - Else:
      - Match when the prefecture’s MaxInt meets/exceeds the threshold.

##### 2) Weather matcher

Trigger configuration:

- Requires `trigger.weather_alerts` (list/JSON list of system alert values). If empty, the trigger never matches weather events.

Matching logic:

- Only considers warning items that are “active/triggerable”:
  - If item status is present, it must be one of: `発表`, `継続`, `特別警報から警報`.
- Map each item’s `warning_code` to a system alert value via `map_jma_weather_code`.
  - The item can match only when the system alert is present in `trigger.weather_alerts`.
- Region match depends on the item granularity:
  - For `info_type == 気象警報・注意報（府県予報区等）`:
    - Convert item `area_code` (6-digit weather area) to `prefecture_id` via `jma_weather_area_code_to_prefecture_id`.
    - Require `_region_matches(trigger_region, prefecture_id)` for any region row.
  - For `info_type == 気象警報・注意報（市町村等）`:
    - If `trigger_region.jma_city_code` is set, match only when it equals the item’s `area_code`.
    - Otherwise, derive the city’s `prefecture_id` via `jma_areas.json` (city code → prefecture) and require `_region_matches(trigger_region, prefecture_id)`.

##### 3) Tsunami matcher

Trigger configuration:

- Requires `trigger.other_alerts` to include `tsunami_warning`.
- Additionally validates the telegram warning kind:
  - The first item’s `warning_code` must map to `tsunami_warning` via `map_jma_tsunami_warning_code`.

Matching logic:

- For each tsunami forecast item:
  - If a region row has `jma_tsunami_code`, it matches only when it equals the item’s `area_code` (exact coastal-zone match).
  - Otherwise (region/prefecture only):
    - Derive `prefecture_id` from the tsunami `area_code` via `jma_areas.json` (tsunami code → prefecture) and require `_region_matches(trigger_region, prefecture_id)`.

##### 4) Volcano matcher

Trigger configuration:

- Requires `trigger.other_alerts` to include `volcanic_eruption_warning`.

Matching logic (strict Kind filter):

- Matches only when:
  - `warning_name == 噴火警報`
  - `warning_code` is `01` or `02`
  - `warning_condition` is `発表` or `切替` (excludes `解除`)
  - `affected_cities[]` is non-empty

Region match:

- For each affected city code:
  - If a region row has `jma_city_code`, it matches only when it equals the affected city code.
  - Otherwise:
    - Derive `prefecture_id` for that city via `jma_areas.json` (city code → prefecture), with a fallback heuristic of `int(city_code[:2])` if needed.
    - Require `_region_matches(trigger_region, prefecture_id)`.

##### 5) Landslide matcher

Trigger configuration:

- Requires `trigger.other_alerts` to include `sediment_disaster_warning`.

Matching logic:

- Only considers areas where:
  - `warning_code == "3"` (警戒)
  - `status` is `発表` or `継続`
- Derive `prefecture_id` from `target_area_code` using the first two digits (e.g. `140000` → 14).
- For each warned area:
  - For each region row:
    - Require `_region_matches(trigger_region, prefecture_id)`.
    - If `trigger_region.jma_city_code` is set, it must equal the area `code`.
    - Otherwise, a prefecture/region-level match is sufficient.

### What the handler guarantees vs what the service guarantees

- The handler guarantees only that it will attempt to parse each SQS record and invoke the service once per record.
- The service guarantees:
  - Status transitions for the `jma_event` row.
  - Duplicate-safe behavior by skipping events that are already not in `queued`/`error`.
  - Partial success behavior when some triggers fail to fire.

## Operational Notes

- **Idempotency**: SQS/Lambda may retry deliveries. Idempotency and duplicate protection should be handled by the service layer and/or database status checks.
- **Observability**: The handler logs:
  - A startup marker for the invocation.
  - Per-record results from the worker service.
  - Exceptions per record.
