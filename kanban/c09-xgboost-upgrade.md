---
id: 9
status: backlog
priority: Normal
blocked_by: [6]
assignee: "@personC"
tags: [person-c, h16, nice-to-have, ml]
---

# C-09 — XGBoost forecasting upgrade (NICE-TO-HAVE)

Train an XGBoost regressor on 90 days of AirNow + NWS weather features. Hold out the last 7 days, report MAE in README. If MAE is reasonable and H14 is green, swap the model output behind the time-scrubber. EPA forecast remains the must-have driver.

## Acceptance Criteria
- Only attempted if H14 is green and all must-haves work on hero + 2 backup pairs
- Held-out MAE in README per forecast horizon
- Output JSON shape identical to AirNow forecast — drop-in swap, no consumer changes
- If the model is worse than EPA forecast, ship EPA — no ego

## Narrative
- 2026-04-25: Created. NICE-TO-HAVE only. The plan explicitly downgraded this from MUST when v6 picked EPA's published forecast as the demo driver. (by @personC)
