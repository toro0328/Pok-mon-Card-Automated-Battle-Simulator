# Deck-driven effect learning

The AI battle page compiles every distinct card in the submitted deck codes and
records the results in a browser-local effect encyclopedia
(`pokemon-card-simulator-effect-library-v1`). Card IDs are deduplicated, while
effect entries are shared by effect kind and whitespace-normalized printed
text. Each entry keeps the official text, observed card IDs, support status,
and a compiled program when the current engine supports it.

When a later deck contains the same effect text on a different card ID, the
engine can reuse that saved program for that card. This is restricted to exact
text and matching effect kinds. New, unsupported text is saved as
`needs_learning` for later compiler work; saving its text does not claim that
the simulator understands or can execute it. The encyclopedia is local to the
browser and is not shared between devices.
