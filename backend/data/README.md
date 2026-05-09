## Brock Frozen Dataset Notes

These JSON files are a frozen MVP snapshot for Pathwise AI and are intended for deterministic decision-support only.

- Scope: selected Brock CS ladder and supporting courses (roughly 20-30 entries).
- Sources: manually curated from 2024-2025 style Brock calendar/program information.
- Guarantee: this is not a complete, authoritative degree audit dataset.

### Prerequisite Parsing Limits

Prerequisites are normalized into simplified structures:

- `requires_all`
- `requires_one_of` (list of alternative groups)
- `coreq`
- optional `min_grade_by_course`
- optional `restricted_to`

Calendar prose can be more complex than these fields (department approval, standing, non-course restrictions). In those cases, rules are represented as best-effort approximations and must be verified with official advising.
