# Card database

This directory is the simulator's canonical local card database.

## Policy
- Official Japanese Standard search (form value `XY`) provides the candidate ID list.
- Current Standard scope: regulation marks H / I / J.
- The search result does not identify each card's printed regulation mark.
  `regulation: null` means unverified; never infer a printed mark from the set
  code, ID, search membership, or this reference dataset. Search results may
  include permitted reprints and cards not yet legal for a given event.
- `cardType` is pokemon/trainer/energy; `trainerType` is
  item/supporter/stadium/tool (or `unspecified` for unusual printed
  "トレーナー" cards requiring review) and `energyType` is basic/special.
- Preserve official text in `raw` before converting it to engine effects.
- Never silently guess an unknown effect. Mark it `needs_review`.
- Card images/OCR are verification/fallback sources, not the primary parser.
- Special cards may use `custom_handler`.

## Engine status
- `unparsed`: official data collected, effect not interpreted yet
- `supported`: represented by generic engine effects
- `needs_review`: parser is uncertain or a new rule pattern was found
- `custom_handler`: requires card-specific code

The sync workflow refreshes the official ID manifest, then imports missing
records from a local clone of type-null/PTCG-database using
`scripts/import-reference-card-db.py`. Existing records are preserved.
Raw reference records are retained for later verification and reparsing.

Run `npm run compile:attacks` to inspect each printed attack separately.
The generated `attack-effects.json` keeps original text and marks unknown
patterns `needs_review`. See `docs/attack-engine.md` for the restricted sandbox.
