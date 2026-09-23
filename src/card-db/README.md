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
