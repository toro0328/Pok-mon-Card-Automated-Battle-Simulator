const VALID_TYPES = new Set(["pokemon", "trainer", "energy"]);
const VALID_STATUS = new Set(["unparsed", "supported", "needs_review", "custom_handler"]);
const TRAINER_TYPES = new Set(["item", "supporter", "stadium", "tool", "unspecified"]);
const ENERGY_TYPES = new Set(["basic", "special"]);

export function validateCard(card) {
  const errors = [];
  if (!Number.isInteger(card?.officialCardId)) errors.push("officialCardId");
  if (!card?.name) errors.push("name");
  if (!VALID_TYPES.has(card?.cardType)) errors.push("cardType");
  if (card?.cardType === "trainer" && !TRAINER_TYPES.has(card?.trainerType)) errors.push("trainerType");
  if (card?.cardType === "energy" && !ENERGY_TYPES.has(card?.energyType)) errors.push("energyType");
  if (card?.regulation != null && !["H", "I", "J"].includes(card.regulation)) errors.push("regulation");
  if (!card?.source?.detailUrl) errors.push("source.detailUrl");
  if (!VALID_STATUS.has(card?.engine?.status)) errors.push("engine.status");
  if (!Array.isArray(card?.engine?.effects)) errors.push("engine.effects");
  return { ok: errors.length === 0, errors };
}
