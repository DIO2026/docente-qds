# QDS specs

`creator-viability.sd_qds_v2.json` is the governed decision spec for this
service. It is a copy of the file in `STDC26/stardance-qds` at
`specs/creator-viability.sd_qds_v2.json` and must not be edited here — the
platform repo owns it, and `meta.qds_platform.spec_hash` on every response
records which revision produced the decision.

Scoring values are NOT in this file. They live in the platform's
`canon/maps/creator-v1.json` and are owned by the kernel (QDS-CANON-001 §C-6).
