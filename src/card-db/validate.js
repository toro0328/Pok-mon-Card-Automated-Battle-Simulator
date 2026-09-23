const VALID_TYPES = new Set(["pokemon", "trainer", "energy"]);
const VALID_STATUS = new Set(["unparsed", "supported", "needs_review", "custom_handler"]);

export function validateCard(card) {
  const errors = [];
  if (!Number.isInteger(card?.officialCardId)) errors.push("officialCardId");
  if (!card?.name) errors.push("name");
  if (!VALID_TYPES.has(card?.cardType)) errors.push("cardType");
  if (!card?.source?.detailUrl) errors.push("source.detailUrl");
  if (!VALID_STATUS.has(card?.engine?.status)) errors.push("engine.status");
  if (!Array.isArray(card?.engine?.effects)) errors.push("engine.effects");
  return { ok: errors.length === 0, errors };
}
