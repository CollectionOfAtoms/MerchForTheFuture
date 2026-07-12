## Epic MFTF-2: T-Mill API Discovery Spike

_Tracked as a chore, not TDD user stories. Output is a decision document, not shipped code._

_**Scope:** Resolve T-Mill account access (2FA), make exploratory API calls against their sandbox or live account, and document the findings in `/docs/teemill-api-notes.md` in the repo. This document unblocks MFTF-3 (abstraction layer) and MFTF-4 (platform product catalog)._

_**Investigate and document:**_
- _Product creation endpoint: what inputs are required, what does the response shape look like, when do color and size options come back_
- _Color and size catalog: how are available colors and sizes retrieved for a given product type, what fields identify a color (name, hex, SKU code)_
- _Order submission: required fields, how color and size are specified, what confirmation comes back_
- _Webhooks: what events are available, what does the payload look like for fulfillment status updates_
- _Mockups endpoint: what inputs are required, what formats are returned, latency characteristics_
- _Authentication: API key format, rate limits, sandbox vs. live environment behavior_
