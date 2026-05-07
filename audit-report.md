# VPG Dashboard Independent Accuracy Audit

Generated: 2026-05-07T17:28:33.941Z
Dashboard generatedAt: 2026-05-07T16:28:29.916Z
Dashboard version: 0.2.0

## Summary

- 144 of 169 comparisons match exactly (85.2%).
- 25 mismatches across 8 of 13 sub-accounts.
- 0 sub-accounts had fetch errors — all 13 PIT tokens worked, all GHL endpoints answered.
- Dashboard was built ~1 hour before this audit (delta = ~3640s). Most/all mismatches are explainable as live drift in that window.
- All 9 opportunity-derived metrics match for 11 of 13 pairs. Only **anthony/MI** and **axel/AZ** show opp-metric drift, both consistent with stage transitions in the last hour.

### Constants used
- moStart = 1777593600000 (= 2026-05-01T00:00:00.000Z)
- wkStart = 1777852800000 (= 2026-05-04T00:00:00.000Z)

Note: the audit spec listed `moStart = 1746057600000`, but that value is May 1 **2025** UTC, not 2026.
I used 1777593600000 (= May 1 2026 00:00 UTC), which matches the dashboard's own daily-array timestamps for 2026-05-01. Using the spec's literal would have made every revenue/contract/dealsClosed comparison meaningless.

### Pattern of note: convos delta is exactly +15 in 5 sub-accounts

The five highest-volume sub-accounts (`patrick/NC`, `daniel/AZ`, `daniel/TX`, `axel/AZ`, `axel/FL`) all show **independent − dashboard = +15** on BOTH `convosWeek` AND `convosAllTime`. A delta being equal between week and all-time for a single pair is expected (every brand-new conversation this week also bumps all-time by 1) — but the same `+15` magnitude in five unrelated pairs is unlikely to be pure coincidence.

Plausible explanations, in order of likelihood:
1. **GHL outbound dialer / Twilio batch.** A scheduled outreach pushed to multiple sub-accounts in roughly the same window, creating ~15 net-new conversations per high-volume location during the ~1h gap.
2. **GHL `total` field caching at a 15-row boundary.** Less likely — `total` is reported as an integer count, and other low-volume pairs (`jack/AZ`, `jack/NC`, `anthony/*`, `patrick/AZ`, `patrick/GA`) match exactly, which they wouldn't if there were a system-wide cap.
3. **Genuine coincidence** of 15 new conversations per sub-account in 1h on the busiest 5 locations — possible but worth flagging.

Worth a follow-up: re-run the audit ~1h later and see whether the delta shifts, stays at 15, or grows. If it stays exactly at 15, dig into the snapshot pipeline.

## Full comparison table

| pair | metric | dashboard | independent | diff | notes |
|---|---|---:|---:|---:|---|
| jack/AZ | convosWeek | 2 | 2 | 0 | OK |
| jack/AZ | convosAllTime | 761 | 761 | 0 | OK |
| jack/AZ | agentsTotal | 364 | 364 | 0 | OK |
| jack/AZ | offersWeek | 8 | 8 | 0 | OK |
| jack/AZ | contractsMonth | 7 | 7 | 0 | OK |
| jack/AZ | dealsClosedMonth | 7 | 7 | 0 | OK |
| jack/AZ | abandoned | 0 | 0 | 0 | OK |
| jack/AZ | lost | 0 | 0 | 0 | OK |
| jack/AZ | revenueMonth | 61500 | 61500 | 0 | OK |
| jack/AZ | tier1 | 6 | 6 | 0 | OK |
| jack/AZ | tier2 | 154 | 154 | 0 | OK |
| jack/AZ | tier3 | 40 | 40 | 0 | OK |
| jack/AZ | tier4 | 40 | 40 | 0 | OK |
| jack/NC | convosWeek | 0 | 0 | 0 | OK |
| jack/NC | convosAllTime | 373 | 373 | 0 | OK |
| jack/NC | agentsTotal | 199 | 199 | 0 | OK |
| jack/NC | offersWeek | 0 | 0 | 0 | OK |
| jack/NC | contractsMonth | 0 | 0 | 0 | OK |
| jack/NC | dealsClosedMonth | 0 | 0 | 0 | OK |
| jack/NC | abandoned | 0 | 0 | 0 | OK |
| jack/NC | lost | 0 | 0 | 0 | OK |
| jack/NC | revenueMonth | 0 | 0 | 0 | OK |
| jack/NC | tier1 | 2 | 2 | 0 | OK |
| jack/NC | tier2 | 108 | 108 | 0 | OK |
| jack/NC | tier3 | 29 | 29 | 0 | OK |
| jack/NC | tier4 | 28 | 28 | 0 | OK |
| anthony/AZ | convosWeek | 60 | 60 | 0 | OK |
| anthony/AZ | convosAllTime | 1868 | 1868 | 0 | OK |
| anthony/AZ | agentsTotal | 0 | 0 | 0 | OK |
| anthony/AZ | offersWeek | 7 | 7 | 0 | OK |
| anthony/AZ | contractsMonth | 5 | 5 | 0 | OK |
| anthony/AZ | dealsClosedMonth | 0 | 0 | 0 | OK |
| anthony/AZ | abandoned | 21 | 21 | 0 | OK |
| anthony/AZ | lost | 7 | 7 | 0 | OK |
| anthony/AZ | revenueMonth | 0 | 0 | 0 | OK |
| anthony/AZ | tier1 | 0 | 0 | 0 | OK |
| anthony/AZ | tier2 | 318 | 318 | 0 | OK |
| anthony/AZ | tier3 | 124 | 124 | 0 | OK |
| anthony/AZ | tier4 | 33 | 33 | 0 | OK |
| anthony/MI | convosWeek | 40 | 40 | 0 | OK |
| anthony/MI | convosAllTime | 775 | 775 | 0 | OK |
| anthony/MI | agentsTotal | 0 | 0 | 0 | OK |
| anthony/MI | offersWeek | 2 | 4 | 2 | MISMATCH |
| anthony/MI | contractsMonth | 1 | 3 | 2 | MISMATCH |
| anthony/MI | dealsClosedMonth | 0 | 0 | 0 | OK |
| anthony/MI | abandoned | 11 | 11 | 0 | OK |
| anthony/MI | lost | 4 | 4 | 0 | OK |
| anthony/MI | revenueMonth | 0 | 0 | 0 | OK |
| anthony/MI | tier1 | 0 | 0 | 0 | OK |
| anthony/MI | tier2 | 244 | 244 | 0 | OK |
| anthony/MI | tier3 | 103 | 103 | 0 | OK |
| anthony/MI | tier4 | 61 | 61 | 0 | OK |
| anthony/OH | convosWeek | 20 | 20 | 0 | OK |
| anthony/OH | convosAllTime | 787 | 787 | 0 | OK |
| anthony/OH | agentsTotal | 0 | 0 | 0 | OK |
| anthony/OH | offersWeek | 1 | 1 | 0 | OK |
| anthony/OH | contractsMonth | 1 | 1 | 0 | OK |
| anthony/OH | dealsClosedMonth | 1 | 1 | 0 | OK |
| anthony/OH | abandoned | 3 | 3 | 0 | OK |
| anthony/OH | lost | 2 | 2 | 0 | OK |
| anthony/OH | revenueMonth | 4389.5 | 4389.5 | 0 | OK |
| anthony/OH | tier1 | 0 | 0 | 0 | OK |
| anthony/OH | tier2 | 358 | 358 | 0 | OK |
| anthony/OH | tier3 | 222 | 222 | 0 | OK |
| anthony/OH | tier4 | 68 | 68 | 0 | OK |
| anthony/NC | convosWeek | 40 | 40 | 0 | OK |
| anthony/NC | convosAllTime | 990 | 990 | 0 | OK |
| anthony/NC | agentsTotal | 0 | 0 | 0 | OK |
| anthony/NC | offersWeek | 0 | 0 | 0 | OK |
| anthony/NC | contractsMonth | 4 | 4 | 0 | OK |
| anthony/NC | dealsClosedMonth | 0 | 0 | 0 | OK |
| anthony/NC | abandoned | 2 | 2 | 0 | OK |
| anthony/NC | lost | 2 | 2 | 0 | OK |
| anthony/NC | revenueMonth | 0 | 0 | 0 | OK |
| anthony/NC | tier1 | 0 | 0 | 0 | OK |
| anthony/NC | tier2 | 260 | 260 | 0 | OK |
| anthony/NC | tier3 | 130 | 130 | 0 | OK |
| anthony/NC | tier4 | 49 | 49 | 0 | OK |
| patrick/AZ | convosWeek | 49 | 49 | 0 | OK |
| patrick/AZ | convosAllTime | 1438 | 1438 | 0 | OK |
| patrick/AZ | agentsTotal | 602 | 602 | 0 | OK |
| patrick/AZ | offersWeek | 1 | 1 | 0 | OK |
| patrick/AZ | contractsMonth | 1 | 1 | 0 | OK |
| patrick/AZ | dealsClosedMonth | 1 | 1 | 0 | OK |
| patrick/AZ | abandoned | 4 | 4 | 0 | OK |
| patrick/AZ | lost | 2 | 2 | 0 | OK |
| patrick/AZ | revenueMonth | 3500 | 3500 | 0 | OK |
| patrick/AZ | tier1 | 1 | 1 | 0 | OK |
| patrick/AZ | tier2 | 504 | 504 | 0 | OK |
| patrick/AZ | tier3 | 237 | 254 | 17 | MISMATCH |
| patrick/AZ | tier4 | 73 | 73 | 0 | OK |
| patrick/GA | convosWeek | 121 | 121 | 0 | OK |
| patrick/GA | convosAllTime | 991 | 991 | 0 | OK |
| patrick/GA | agentsTotal | 433 | 435 | 2 | MISMATCH |
| patrick/GA | offersWeek | 0 | 0 | 0 | OK |
| patrick/GA | contractsMonth | 1 | 1 | 0 | OK |
| patrick/GA | dealsClosedMonth | 0 | 0 | 0 | OK |
| patrick/GA | abandoned | 2 | 2 | 0 | OK |
| patrick/GA | lost | 2 | 2 | 0 | OK |
| patrick/GA | revenueMonth | 0 | 0 | 0 | OK |
| patrick/GA | tier1 | 1 | 1 | 0 | OK |
| patrick/GA | tier2 | 273 | 273 | 0 | OK |
| patrick/GA | tier3 | 332 | 332 | 0 | OK |
| patrick/GA | tier4 | 108 | 109 | 1 | MISMATCH |
| patrick/NC | convosWeek | 41 | 56 | 15 | MISMATCH |
| patrick/NC | convosAllTime | 997 | 1012 | 15 | MISMATCH |
| patrick/NC | agentsTotal | 542 | 545 | 3 | MISMATCH |
| patrick/NC | offersWeek | 1 | 1 | 0 | OK |
| patrick/NC | contractsMonth | 2 | 2 | 0 | OK |
| patrick/NC | dealsClosedMonth | 1 | 1 | 0 | OK |
| patrick/NC | abandoned | 2 | 2 | 0 | OK |
| patrick/NC | lost | 0 | 0 | 0 | OK |
| patrick/NC | revenueMonth | 13000 | 13000 | 0 | OK |
| patrick/NC | tier1 | 3 | 3 | 0 | OK |
| patrick/NC | tier2 | 342 | 342 | 0 | OK |
| patrick/NC | tier3 | 204 | 204 | 0 | OK |
| patrick/NC | tier4 | 56 | 56 | 0 | OK |
| daniel/AZ | convosWeek | 31 | 46 | 15 | MISMATCH |
| daniel/AZ | convosAllTime | 932 | 947 | 15 | MISMATCH |
| daniel/AZ | agentsTotal | 159 | 159 | 0 | OK |
| daniel/AZ | offersWeek | 2 | 2 | 0 | OK |
| daniel/AZ | contractsMonth | 1 | 1 | 0 | OK |
| daniel/AZ | dealsClosedMonth | 0 | 0 | 0 | OK |
| daniel/AZ | abandoned | 0 | 0 | 0 | OK |
| daniel/AZ | lost | 1 | 1 | 0 | OK |
| daniel/AZ | revenueMonth | 0 | 0 | 0 | OK |
| daniel/AZ | tier1 | 7 | 7 | 0 | OK |
| daniel/AZ | tier2 | 358 | 358 | 0 | OK |
| daniel/AZ | tier3 | 213 | 235 | 22 | MISMATCH |
| daniel/AZ | tier4 | 68 | 69 | 1 | MISMATCH |
| daniel/TX | convosWeek | 101 | 116 | 15 | MISMATCH |
| daniel/TX | convosAllTime | 373 | 388 | 15 | MISMATCH |
| daniel/TX | agentsTotal | 25 | 25 | 0 | OK |
| daniel/TX | offersWeek | 0 | 0 | 0 | OK |
| daniel/TX | contractsMonth | 0 | 0 | 0 | OK |
| daniel/TX | dealsClosedMonth | 0 | 0 | 0 | OK |
| daniel/TX | abandoned | 0 | 0 | 0 | OK |
| daniel/TX | lost | 0 | 0 | 0 | OK |
| daniel/TX | revenueMonth | 0 | 0 | 0 | OK |
| daniel/TX | tier1 | 0 | 0 | 0 | OK |
| daniel/TX | tier2 | 5 | 5 | 0 | OK |
| daniel/TX | tier3 | 103 | 103 | 0 | OK |
| daniel/TX | tier4 | 43 | 45 | 2 | MISMATCH |
| axel/AZ | convosWeek | 105 | 120 | 15 | MISMATCH |
| axel/AZ | convosAllTime | 939 | 954 | 15 | MISMATCH |
| axel/AZ | agentsTotal | 63 | 65 | 2 | MISMATCH |
| axel/AZ | offersWeek | 1 | 2 | 1 | MISMATCH |
| axel/AZ | contractsMonth | 0 | 1 | 1 | MISMATCH |
| axel/AZ | dealsClosedMonth | 0 | 0 | 0 | OK |
| axel/AZ | abandoned | 5 | 5 | 0 | OK |
| axel/AZ | lost | 2 | 2 | 0 | OK |
| axel/AZ | revenueMonth | 0 | 0 | 0 | OK |
| axel/AZ | tier1 | 0 | 0 | 0 | OK |
| axel/AZ | tier2 | 222 | 222 | 0 | OK |
| axel/AZ | tier3 | 267 | 276 | 9 | MISMATCH |
| axel/AZ | tier4 | 76 | 76 | 0 | OK |
| axel/FL | convosWeek | 101 | 116 | 15 | MISMATCH |
| axel/FL | convosAllTime | 741 | 756 | 15 | MISMATCH |
| axel/FL | agentsTotal | 337 | 339 | 2 | MISMATCH |
| axel/FL | offersWeek | 0 | 0 | 0 | OK |
| axel/FL | contractsMonth | 0 | 0 | 0 | OK |
| axel/FL | dealsClosedMonth | 0 | 0 | 0 | OK |
| axel/FL | abandoned | 3 | 3 | 0 | OK |
| axel/FL | lost | 0 | 0 | 0 | OK |
| axel/FL | revenueMonth | 0 | 0 | 0 | OK |
| axel/FL | tier1 | 0 | 0 | 0 | OK |
| axel/FL | tier2 | 170 | 170 | 0 | OK |
| axel/FL | tier3 | 224 | 224 | 0 | OK |
| axel/FL | tier4 | 65 | 68 | 3 | MISMATCH |

## Mismatches

| pair | metric | dashboard | independent | diff | likely cause |
|---|---|---:|---:|---:|---|
| anthony/MI | offersWeek | 2 | 4 | 2 | Stage transition since last dashboard build, or pipeline stage-name mapping difference. |
| anthony/MI | contractsMonth | 1 | 3 | 2 | Status flip (won/lost/abandoned) between dashboard build and audit. |
| patrick/AZ | tier3 | 237 | 254 | 17 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| patrick/GA | agentsTotal | 433 | 435 | 2 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| patrick/GA | tier4 | 108 | 109 | 1 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| patrick/NC | convosWeek | 41 | 56 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| patrick/NC | convosAllTime | 997 | 1012 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| patrick/NC | agentsTotal | 542 | 545 | 3 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| daniel/AZ | convosWeek | 31 | 46 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| daniel/AZ | convosAllTime | 932 | 947 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| daniel/AZ | tier3 | 213 | 235 | 22 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| daniel/AZ | tier4 | 68 | 69 | 1 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| daniel/TX | convosWeek | 101 | 116 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| daniel/TX | convosAllTime | 373 | 388 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| daniel/TX | tier4 | 43 | 45 | 2 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| axel/AZ | convosWeek | 105 | 120 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| axel/AZ | convosAllTime | 939 | 954 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| axel/AZ | agentsTotal | 63 | 65 | 2 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| axel/AZ | offersWeek | 1 | 2 | 1 | Stage transition since last dashboard build, or pipeline stage-name mapping difference. |
| axel/AZ | contractsMonth | 0 | 1 | 1 | Status flip (won/lost/abandoned) between dashboard build and audit. |
| axel/AZ | tier3 | 267 | 276 | 9 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| axel/FL | convosWeek | 101 | 116 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| axel/FL | convosAllTime | 741 | 756 | 15 | Live mid-stream new conversation between dashboard build and audit run (timing). |
| axel/FL | agentsTotal | 337 | 339 | 2 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |
| axel/FL | tier4 | 65 | 68 | 3 | Tag added/removed between dashboard build and audit (timing) or tag-casing variance. |

## Fetch errors

None — every sub-account answered every API call.

## Per-pair raw independent results

```json
[
  {
    "repId": "jack",
    "marketId": "AZ",
    "locationId": "IjTrTBLsiRDWZAvPPgFd",
    "errors": [],
    "convosAllTime": 761,
    "convosWeek": 2,
    "agentsTotal": 364,
    "agentTiers": {
      "1": 6,
      "2": 154,
      "3": 40,
      "4": 40
    },
    "oppCount": 9,
    "offersWeek": 8,
    "contractsMonth": 7,
    "dealsClosedMonth": 7,
    "abandoned": 0,
    "lost": 0,
    "revenueMonth": 61500
  },
  {
    "repId": "jack",
    "marketId": "NC",
    "locationId": "ZNHJiLMXDDtxCvOX1oxT",
    "errors": [],
    "convosAllTime": 373,
    "convosWeek": 0,
    "agentsTotal": 199,
    "agentTiers": {
      "1": 2,
      "2": 108,
      "3": 29,
      "4": 28
    },
    "oppCount": 0,
    "offersWeek": 0,
    "contractsMonth": 0,
    "dealsClosedMonth": 0,
    "abandoned": 0,
    "lost": 0,
    "revenueMonth": 0
  },
  {
    "repId": "anthony",
    "marketId": "AZ",
    "locationId": "O1lZGP1vlqfU0GzbCPTO",
    "errors": [],
    "convosAllTime": 1868,
    "convosWeek": 60,
    "agentsTotal": 0,
    "agentTiers": {
      "1": 0,
      "2": 318,
      "3": 124,
      "4": 33
    },
    "oppCount": 37,
    "offersWeek": 7,
    "contractsMonth": 5,
    "dealsClosedMonth": 0,
    "abandoned": 21,
    "lost": 7,
    "revenueMonth": 0
  },
  {
    "repId": "anthony",
    "marketId": "MI",
    "locationId": "4UtYECpuatg8Q1XMfGqk",
    "errors": [],
    "convosAllTime": 775,
    "convosWeek": 40,
    "agentsTotal": 0,
    "agentTiers": {
      "1": 0,
      "2": 244,
      "3": 103,
      "4": 61
    },
    "oppCount": 25,
    "offersWeek": 4,
    "contractsMonth": 3,
    "dealsClosedMonth": 0,
    "abandoned": 11,
    "lost": 4,
    "revenueMonth": 0
  },
  {
    "repId": "anthony",
    "marketId": "OH",
    "locationId": "9qFG0hfeVy6kaSL28RMd",
    "errors": [],
    "convosAllTime": 787,
    "convosWeek": 20,
    "agentsTotal": 0,
    "agentTiers": {
      "1": 0,
      "2": 358,
      "3": 222,
      "4": 68
    },
    "oppCount": 10,
    "offersWeek": 1,
    "contractsMonth": 1,
    "dealsClosedMonth": 1,
    "abandoned": 3,
    "lost": 2,
    "revenueMonth": 4389.5
  },
  {
    "repId": "anthony",
    "marketId": "NC",
    "locationId": "HcRtBNpPRDI4nHPpO9zb",
    "errors": [],
    "convosAllTime": 990,
    "convosWeek": 40,
    "agentsTotal": 0,
    "agentTiers": {
      "1": 0,
      "2": 260,
      "3": 130,
      "4": 49
    },
    "oppCount": 13,
    "offersWeek": 0,
    "contractsMonth": 4,
    "dealsClosedMonth": 0,
    "abandoned": 2,
    "lost": 2,
    "revenueMonth": 0
  },
  {
    "repId": "patrick",
    "marketId": "AZ",
    "locationId": "kUB590U9xsaXCtInnuvF",
    "errors": [],
    "convosAllTime": 1438,
    "convosWeek": 49,
    "agentsTotal": 602,
    "agentTiers": {
      "1": 1,
      "2": 504,
      "3": 254,
      "4": 73
    },
    "oppCount": 9,
    "offersWeek": 1,
    "contractsMonth": 1,
    "dealsClosedMonth": 1,
    "abandoned": 4,
    "lost": 2,
    "revenueMonth": 3500
  },
  {
    "repId": "patrick",
    "marketId": "GA",
    "locationId": "y6AYkI53ArJpgyrqKqA1",
    "errors": [],
    "convosAllTime": 991,
    "convosWeek": 121,
    "agentsTotal": 435,
    "agentTiers": {
      "1": 1,
      "2": 273,
      "3": 332,
      "4": 109
    },
    "oppCount": 5,
    "offersWeek": 0,
    "contractsMonth": 1,
    "dealsClosedMonth": 0,
    "abandoned": 2,
    "lost": 2,
    "revenueMonth": 0
  },
  {
    "repId": "patrick",
    "marketId": "NC",
    "locationId": "rrN44jJQPaDQ8rfhFMed",
    "errors": [],
    "convosAllTime": 1012,
    "convosWeek": 56,
    "agentsTotal": 545,
    "agentTiers": {
      "1": 3,
      "2": 342,
      "3": 204,
      "4": 56
    },
    "oppCount": 4,
    "offersWeek": 1,
    "contractsMonth": 2,
    "dealsClosedMonth": 1,
    "abandoned": 2,
    "lost": 0,
    "revenueMonth": 13000
  },
  {
    "repId": "daniel",
    "marketId": "AZ",
    "locationId": "fzh8Ebl8UytO3UEtR24p",
    "errors": [],
    "convosAllTime": 947,
    "convosWeek": 46,
    "agentsTotal": 159,
    "agentTiers": {
      "1": 7,
      "2": 358,
      "3": 235,
      "4": 69
    },
    "oppCount": 8,
    "offersWeek": 2,
    "contractsMonth": 1,
    "dealsClosedMonth": 0,
    "abandoned": 0,
    "lost": 1,
    "revenueMonth": 0
  },
  {
    "repId": "daniel",
    "marketId": "TX",
    "locationId": "4O98H14LqmZr5Lk30E7A",
    "errors": [],
    "convosAllTime": 388,
    "convosWeek": 116,
    "agentsTotal": 25,
    "agentTiers": {
      "1": 0,
      "2": 5,
      "3": 103,
      "4": 45
    },
    "oppCount": 1,
    "offersWeek": 0,
    "contractsMonth": 0,
    "dealsClosedMonth": 0,
    "abandoned": 0,
    "lost": 0,
    "revenueMonth": 0
  },
  {
    "repId": "axel",
    "marketId": "AZ",
    "locationId": "xtyFkqv9DKxqhb8Iolmg",
    "errors": [],
    "convosAllTime": 954,
    "convosWeek": 120,
    "agentsTotal": 65,
    "agentTiers": {
      "1": 0,
      "2": 222,
      "3": 276,
      "4": 76
    },
    "oppCount": 9,
    "offersWeek": 2,
    "contractsMonth": 1,
    "dealsClosedMonth": 0,
    "abandoned": 5,
    "lost": 2,
    "revenueMonth": 0
  },
  {
    "repId": "axel",
    "marketId": "FL",
    "locationId": "jgK6encOpnzh9SI4mt90",
    "errors": [],
    "convosAllTime": 756,
    "convosWeek": 116,
    "agentsTotal": 339,
    "agentTiers": {
      "1": 0,
      "2": 170,
      "3": 224,
      "4": 68
    },
    "oppCount": 5,
    "offersWeek": 0,
    "contractsMonth": 0,
    "dealsClosedMonth": 0,
    "abandoned": 3,
    "lost": 0,
    "revenueMonth": 0
  }
]
```