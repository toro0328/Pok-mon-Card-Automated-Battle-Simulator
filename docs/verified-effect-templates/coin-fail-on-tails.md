# Verified effect template: coin tails makes the attack fail

## Card text handled

`コインを1回投げウラなら、このワザは失敗。`

Only this exact, standalone instruction is compiled. If combined with other effect clauses, it remains `needs_review` until their ordering is implemented.

## Rule basis

The official Pokémon Card Game Advanced Player Rule Guide, Ver. 3.4, section A-01 (attack procedure), step 2-a says a failed attack ends the player's turn and does not proceed to the next attack step. The attack procedure then resolves pre-damage instructions, damage, and non-damage effects in later steps. This template therefore checks the coin before damage and skips the rest of the attack on tails.

- [Official Advanced Player Rule Guide, Ver. 3.4 (PDF)](https://www.pokemon-card.com/assets/document/advanced_manual.pdf), pp. 4–5, section A-01.
- [Official card database: Gligar, card 17107](https://www.pokemon-card.com/card-search/details.php/card/17107/regu/DP), with the matching printed instruction.

## Limits

This does not implement other coin conditions, extra costs, or multi-clause coin effects. It does not authorize AI notes as rules. Only the exact text above is marked supported.
