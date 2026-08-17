# probe-output — live endpoint shapes (T0.2)

Generated: 2026-08-17T10:13:52.757Z
Node: v22.16.0

Run with `npm run probe`. API keys are redacted from URLs before printing.

---

## 1. Open-Meteo Geocoding

**q="Bengaluru" → 200 in 888ms**

```
https://geocoding-api.open-meteo.com/v1/search?name=Bengaluru&count=5&language=en&format=json

result count: 1

first result:
{
  id: number(1277333)
  name: string("Bengaluru")
  latitude: number(12.97194)
  longitude: number(77.59369)
  elevation: number(920)
  feature_code: string("PPLA")
  country_code: string("IN")
  admin1_id: number(1267701)
  admin2_id: number(1277331)
  timezone: string("Asia/Kolkata")
  population: number(8495492)
  country_id: number(1269750)
  country: string("India")
  admin1: string("Karnataka")
  admin2: string("Bengaluru Urban")
}
```

**q="Tromso" → 200 in 171ms**

```
https://geocoding-api.open-meteo.com/v1/search?name=Tromso&count=5&language=en&format=json

result count: 1

first result:
{
  id: number(3133894)
  name: string("Romssasuolu")
  latitude: number(69.66761)
  longitude: number(18.9258)
  elevation: number(60)
  feature_code: string("ISL")
  country_code: string("NO")
  admin1_id: number(3133897)
  admin2_id: number(6453316)
  timezone: string("Europe/Oslo")
  population: number(39882)
  country_id: number(3144096)
  country: string("Norway")
  admin1: string("Troms")
  admin2: string("Tromsø")
}
```

**q="beng" → 200 in 170ms**

```
https://geocoding-api.open-meteo.com/v1/search?name=beng&count=5&language=en&format=json

result count: 5

first result:
{
  id: number(88319)
  name: string("Benghazi")
  latitude: number(32.11486)
  longitude: number(20.06859)
  elevation: number(3)
  feature_code: string("PPLA")
  country_code: string("LY")
  admin1_id: number(88318)
  timezone: string("Africa/Tripoli")
  population: number(757490)
  country_id: number(2215636)
  country: string("Libya")
  admin1: string("Banghazi")
}
```


## 2. Open-Meteo Forecast (cloud cover)

**Bengaluru → 200 in 702ms**

```
https://api.open-meteo.com/v1/forecast?latitude=12.97&longitude=77.59&hourly=cloud_cover&forecast_days=2&timezone=Asia%2FKolkata

{
  latitude: number(12.970123)
  longitude: number(77.56364)
  generationtime_ms: number(0.020623207092285156)
  utc_offset_seconds: number(19800)
  timezone: string("Asia/Kolkata")
  timezone_abbreviation: string("GMT+5:30")
  elevation: number(914)
  hourly_units: {
    time: string("iso8601")
    cloud_cover: string("%")
  }
  hourly: undefined(undefined)
}

hourly.time[0..2]: ["2026-08-17T00:00","2026-08-17T01:00","2026-08-17T02:00"]
hourly.time length: 48
hourly.cloud_cover[0..5]: [100,99,73,97,99,82]
```

**Tromso → 200 in 187ms**

```
https://api.open-meteo.com/v1/forecast?latitude=69.65&longitude=18.96&hourly=cloud_cover&forecast_days=2&timezone=Europe%2FOslo

{
  latitude: number(69.638565)
  longitude: number(18.967834)
  generationtime_ms: number(0.4451274871826172)
  utc_offset_seconds: number(7200)
  timezone: string("Europe/Oslo")
  timezone_abbreviation: string("GMT+2")
  elevation: number(9)
  hourly_units: {
    time: string("iso8601")
    cloud_cover: string("%")
  }
  hourly: undefined(undefined)
}

hourly.time[0..2]: ["2026-08-17T00:00","2026-08-17T01:00","2026-08-17T02:00"]
hourly.time length: 48
hourly.cloud_cover[0..5]: [99,99,100,99,99,100]
```


## 3. NOAA SWPC — OVATION aurora grid

**→ 200 in 783ms**

```
https://services.swpc.noaa.gov/json/ovation_aurora_latest.json

top-level keys: ["Observation Time","Forecast Time","Data Format","coordinates","type"]
Observation Time: 2026-08-17T07:15:00Z
Forecast Time: 2026-08-17T08:43:00Z
coordinates length: 65160
coordinates[0]: [0,-90,3]  // [lon, lat, probability]
max probability in grid: 29

Bengaluru (lon 77.59, lat 12.97) → nearest cell [78,13,0]
Tromso (lon 18.96, lat 69.65) → nearest cell [19,70,2]
```


## 4. NOAA SWPC — planetary K-index forecast

**→ 200 in 127ms**

```
https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json

rows: 81
row container type: OBJECT (differs from API_REFERENCE)
rows[0]: {"time_tag":"2026-08-10T00:00:00","kp":1.67,"observed":"observed","noaa_scale":null}
rows[1]: {"time_tag":"2026-08-10T03:00:00","kp":1,"observed":"observed","noaa_scale":null}

last 4 rows:
  {"time_tag":"2026-08-19T15:00:00","kp":1.67,"observed":"predicted","noaa_scale":null}
  {"time_tag":"2026-08-19T18:00:00","kp":1.67,"observed":"predicted","noaa_scale":null}
  {"time_tag":"2026-08-19T21:00:00","kp":1.33,"observed":"predicted","noaa_scale":null}
  {"time_tag":"2026-08-20T00:00:00","kp":1.67,"observed":"predicted","noaa_scale":null}

distinct "observed" values: ["observed","estimated","predicted"]
kp range: 0 .. 4
time_tag span: 2026-08-10T00:00:00 .. 2026-08-20T00:00:00
rows with time_tag in the future: 21
```


## 5. SunriseSunset.io (v2) — sun + moon

**Bengaluru (2026-08-17) → 200 in 85ms**

```
https://api.sunrisesunset.io/json?lat=12.97&lng=77.59&date=2026-08-17&timezone=Asia%2FKolkata&time_format=24

{
  results: {
    date: string("2026-08-17")
    sunrise: string("06:03:15")
    sunset: string("18:44:08")
    first_light: string("04:49:38")
    last_light: string("19:57:38")
    dawn: string("05:41:17")
    dusk: string("19:06:04")
    solar_noon: string("12:23:47")
    golden_hour: string("18:15:20")
    day_length: string("12:40:53")
    nautical_twilight_begin: string("05:15:36")
    nautical_twilight_end: string("19:31:43")
    timezone: string("Asia/Kolkata")
    utc_offset: number(330)
    sun_altitude: number(89.58)
    sun_azimuth: number(0)
    sunrise_azimuth: number(75.72)
    sunset_azimuth: number(284.11)
    moonrise: string("09:59:45")
    moonset: string("21:55:29")
    moon_illumination: number(23.33)
    moon_phase: string("Waxing Crescent")
    moon_phase_value: number(0.16)
    moon_always_up: boolean(false)
    moon_always_down: boolean(false)
    elevation: number(910)
    sun_status: string("normal")
    golden_hour_morning: {
      begin: string("05:49:48")
      end: string("06:32:05")
    }
    golden_hour_evening: {
      begin: string("18:15:20")
      end: string("18:57:34")
    }
    blue_hour_morning: {
      begin: string("05:41:17")
      end: string("05:49:48")
    }
    blue_hour_evening: {
      begin: string("18:57:34")
      end: string("19:06:04")
    }
  }
  status: string("OK")
  tzid: string("Asia/Kolkata")
}

raw:
{
  "results": {
    "date": "2026-08-17",
    "sunrise": "06:03:15",
    "sunset": "18:44:08",
    "first_light": "04:49:38",
    "last_light": "19:57:38",
    "dawn": "05:41:17",
    "dusk": "19:06:04",
    "solar_noon": "12:23:47",
    "golden_hour": "18:15:20",
    "day_length": "12:40:53",
    "nautical_twilight_begin": "05:15:36",
    "nautical_twilight_end": "19:31:43",
    "timezone": "Asia/Kolkata",
    "utc_offset": 330,
    "sun_altitude": 89.58,
    "sun_azimuth": 0,
    "sunrise_azimuth": 75.72,
    "sunset_azimuth": 284.11,
    "moonrise": "09:59:45",
    "moonset": "21:55:29",
    "moon_illumination": 23.33,
    "moon_phase": "Waxing Crescent",
    "moon_phase_value": 0.16,
    "moon_always_up": false,
    "moon_always_down": false,
    "elevation": 910,
    "sun_status": "normal",
    "golden_hour_morning": {
      "begin": "05:49:48",
      "end": "06:32:05"
    },
    "golden_hour_evening": {
      "begin": "18:15:20",
      "end": "18:57:34"
    },
    "blue_hour_morning": {
      "begin": "05:41:17",
      "end": "05:49:48"
    },
    "blue_hour_evening": {
      "begin": "18:57:34",
      "end": "19:06:04"
    }
  },
  "status": "OK",
  "tzid": "Asia/Kolkata"
}
```

**Tromso (2026-08-17) → 200 in 28ms**

```
https://api.sunrisesunset.io/json?lat=69.65&lng=18.96&date=2026-08-17&timezone=Europe%2FOslo&time_format=24

{
  results: {
    date: string("2026-08-17")
    sunrise: string("03:54:30")
    sunset: string("21:38:20")
    first_light: null
    last_light: null
    dawn: string("01:57:10")
    dusk: string("23:28:48")
    solar_noon: string("12:48:16")
    golden_hour: string("20:04:09")
    day_length: string("17:43:50")
    nautical_twilight_begin: null
    nautical_twilight_end: null
    timezone: string("Europe/Oslo")
    utc_offset: number(120)
    sun_altitude: number(33.71)
    sun_azimuth: number(180)
    sunrise_azimuth: number(44.91)
    sunset_azimuth: number(314.16)
    moonrise: string("13:06:55")
    moonset: string("19:31:46")
    moon_illumination: number(24.61)
    moon_phase: string("Waxing Crescent")
    moon_phase_value: number(0.17)
    moon_always_up: boolean(false)
    moon_always_down: boolean(false)
    elevation: number(0)
    sun_status: string("normal")
    golden_hour_morning: {
      begin: string("02:54:43")
      end: string("05:30:05")
    }
    golden_hour_evening: {
      begin: string("20:04:09")
      end: string("22:36:07")
    }
    blue_hour_morning: {
      begin: string("01:57:10")
      end: string("02:54:43")
    }
    blue_hour_evening: {
      begin: string("22:36:07")
      end: string("23:28:48")
    }
  }
  status: string("OK")
  tzid: string("Europe/Oslo")
}

raw:
{
  "results": {
    "date": "2026-08-17",
    "sunrise": "03:54:30",
    "sunset": "21:38:20",
    "first_light": null,
    "last_light": null,
    "dawn": "01:57:10",
    "dusk": "23:28:48",
    "solar_noon": "12:48:16",
    "golden_hour": "20:04:09",
    "day_length": "17:43:50",
    "nautical_twilight_begin": null,
    "nautical_twilight_end": null,
    "timezone": "Europe/Oslo",
    "utc_offset": 120,
    "sun_altitude": 33.71,
    "sun_azimuth": 180,
    "sunrise_azimuth": 44.91,
    "sunset_azimuth": 314.16,
    "moonrise": "13:06:55",
    "moonset": "19:31:46",
    "moon_illumination": 24.61,
    "moon_phase": "Waxing Crescent",
    "moon_phase_value": 0.17,
    "moon_always_up": false,
    "moon_always_down": false,
    "elevation": 0,
    "sun_status": "normal",
    "golden_hour_morning": {
      "begin": "02:54:43",
      "end": "05:30:05"
    },
    "golden_hour_evening": {
      "begin": "20:04:09",
      "end": "22:36:07"
    },
    "blue_hour_morning": {
      "begin": "01:57:10",
      "end": "02:54:43"
    },
    "blue_hour_evening": {
      "begin": "22:36:07",
      "end": "23:28:48"
    }
  },
  "status": "OK",
  "tzid": "Europe/Oslo"
}
```


## 6. Geoapify Static Maps

**style="dark-matter-brown" → 200 in 91ms**

```
https://maps.geoapify.com/v1/staticmap?style=dark-matter-brown&width=1200&height=630&center=lonlat:77.59,12.97&zoom=9&marker=lonlat:77.59,12.97;color:%2300d5be;size:large&apiKey=***REDACTED***

content-type: image/jpeg
bytes: 107906
PNG magic bytes present: false

```

**style="dark-matter" → 200 in 72ms**

```
https://maps.geoapify.com/v1/staticmap?style=dark-matter&width=1200&height=630&center=lonlat:77.59,12.97&zoom=9&marker=lonlat:77.59,12.97;color:%2300d5be;size:large&apiKey=***REDACTED***

content-type: image/jpeg
bytes: 116023
PNG magic bytes present: false

```

**style="osm-carto" → 200 in 20ms**

```
https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=1200&height=630&center=lonlat:77.59,12.97&zoom=9&marker=lonlat:77.59,12.97;color:%2300d5be;size:large&apiKey=***REDACTED***

content-type: image/jpeg
bytes: 282265
PNG magic bytes present: false

```


## 7. OpenFreeMap style JSON (interactive map)

**style="dark" → 200 in 75ms**

```
https://tiles.openfreemap.org/styles/dark

name="undefined", layers=47
```

**style="liberty" → 200 in 19ms**

```
https://tiles.openfreemap.org/styles/liberty

name="undefined", layers=111
```

**style="positron" → 200 in 23ms**

```
https://tiles.openfreemap.org/styles/positron

name="undefined", layers=55
```

**style="bright" → 200 in 19ms**

```
https://tiles.openfreemap.org/styles/bright

name="undefined", layers=119
```


---

# Findings vs docs/API_REFERENCE.md

All 7 endpoints are **live**. No provider is dead and no substitution is needed.
Four shape/behaviour deltas were observed; `docs/API_REFERENCE.md` has been
corrected to match reality, and `lib/schemas.ts` is written from the responses
above rather than from the original prose.

### D1 — Kp forecast rows are OBJECTS, not arrays (breaking for parsing)

API_REFERENCE said: `Rows of [time_tag, kp, observed|estimated|predicted]`.

Reality: a flat array of 81 objects, no header row:

    { "time_tag": "2026-08-19T15:00:00", "kp": 1.67, "observed": "predicted", "noaa_scale": null }

- `kp` is a **number** and can be fractional (1.67, 1.33), not an integer string.
- `observed` is one of `observed` | `estimated` | `predicted`.
- `time_tag` is UTC without a `Z` suffix, 3-hourly, spanning ~7 days past + ~3 days future.
- Consequence: "max predicted Kp for tonight" must filter `observed === 'predicted'`
  and parse `time_tag` as UTC by appending `Z`.

### D2 — Geoapify static maps return image/jpeg, not PNG

The endpoint responds `content-type: image/jpeg` (~113KB at 1200x630) even though
ARCHITECTURE.md calls it "the static map PNG". This is **fine**: Satori accepts
JPEG as well as PNG. We keep JPEG (smaller than PNG for photographic map raster).
Style check at 1200x630, Bengaluru, zoom 9:

| style | bytes | verdict |
|---|---|---|
| `dark-matter-brown` | 113 KB | chosen — darkest, warm neutral, reads well behind text |
| `dark-matter` | 122 KB | viable alternative |
| `osm-carto` | 298 KB | light style, unusable for a dark card |

Latency was 3–7.5s cold, which is why the fetch must go through our 30-day
cached helper and never happen inline on a user request path.

### D3 — SunriseSunset.io v2 is RICHER than documented, and nullable at high latitude

Present and usable (so we use the API, with `suncalc` kept only as a fallback):

- `golden_hour_evening: { begin, end }` and `blue_hour_evening: { begin, end }`
  as objects — better than the single `golden_hour` scalar the doc implied.
- Moon fields all present: `moon_phase` ("Waxing Crescent"), `moon_illumination`
  (23.33, a **percentage** 0–100), `moon_phase_value` (0.16, a 0–1 cycle position),
  `moonrise`, `moonset`, `moon_always_up`, `moon_always_down`.
- Wrapper is `{ results: {...}, status: "OK", tzid }` — parse `results`, assert `status`.

Nullable at Tromso (69.65N) in August: `first_light`, `last_light`,
`nautical_twilight_begin`, `nautical_twilight_end` are all `null`. There is also a
`sun_status` field ("normal") which will report polar day/night. The zod schema
must make every time field nullable, and the polar-day/night test case in
`lib/score.test.ts` depends on this.

### D4 — Open-Meteo geocoding is diacritic-sensitive

`?name=Tromso` returns **Romssasuolu**, an island (feature_code `ISL`,
population 39,882), not the city of Tromso. `?name=Bengaluru` is exact.

Consequences:
- `lib/cities.ts` must carry hardcoded lat/lon/timezone per seeded city. Never
  resolve an SEO slug through geocoding at request time.
- The search box should prefer higher `population` and `feature_code` starting
  with `PPL` (populated place) when ranking results.

### Confirmed as documented

- OVATION grid: `coordinates` is an array of 65,160 `[lon, lat, probability]`
  triples, lon 0–359. Extra top-level keys `Observation Time`, `Forecast Time`,
  `Data Format`, `type`. Nearest-cell lookup works (Bengaluru 0%, Tromso 2%).
- Open-Meteo forecast: `hourly.time` (48 entries, local naked ISO like
  `2026-08-17T00:00`) + `hourly.cloud_cover` (0–100 integers), `utc_offset_seconds`
  and `timezone` echoed back.
- OpenFreeMap: `dark` (47 layers), `liberty`, `positron`, `bright` all 200. Using
  `dark`. Note the style JSON has no `name` property.
