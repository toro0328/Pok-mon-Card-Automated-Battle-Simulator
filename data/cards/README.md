# Card database

This directory is the simulator's canonical local card database.

## Policy
- Primary source: official Japanese Pokemon Card Game card search.
- Current Standard scope: regulation marks H / I / J.
- Preserve official text in `raw` before converting it to engine effects.
- Never silently guess an unknown effect. Mark it `needs_review`.
- Card images/OCR are verification/fallback sources, not the primary parser.
- Special cards may use `custom_handler`.

## Engine status
- `unparsed`: official data collected, effect not interpreted yet
- `supported`: represented by generic engine effects
- `needs_review`: parser is uncertain or a new rule pattern was found
- `custom_handler`: requires card-specific code

The importer/synchronizer will be added separately so new official cards can be detected and appended without rewriting existing verified records.
