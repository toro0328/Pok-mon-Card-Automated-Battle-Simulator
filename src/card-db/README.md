# Official card DB importer

Goal: synchronize the simulator DB from the official Japanese Pokemon Card Game card search.

Pipeline:
1. discover official card IDs
2. fetch official detail pages
3. extract printed/raw fields without interpretation
4. normalize into data/cards/cards.json
5. parse raw effects into generic engine effects
6. mark unknown/ambiguous effects needs_review
7. optionally verify against official card image

Standard scope is H / I / J. The official regulation page is the source of truth for legal marks.

Important: discovery and parsing are separate. If the official search list is dynamically loaded or changes format, collected cards remain valid and only the discovery adapter needs repair.

## Effect coverage audit

Run `npm run audit:cards` to compile the current card database and write
`reports/card-effect-audit.json`. The report groups identical unresolved text
across reprints and records affected official card IDs, while separating
Abilities, attacks, Trainer cards, Energy, and card rule text.

The report's `compiled` status means only that the current text compiler
recognized a block. It is not proof that every game-state interaction or
official ruling is implemented. Runtime and ruling validation must be recorded
as separate stages before a card can be called fully supported.
