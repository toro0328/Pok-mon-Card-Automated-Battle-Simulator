export function createCardRecord(input) {
  if (!Number.isInteger(input.officialCardId)) throw new Error("officialCardId is required");
  if (!input.name) throw new Error("name is required");
  return {
    officialCardId: input.officialCardId,
    name: input.name,
    regulation: input.regulation ?? null,
    cardType: input.cardType,
    source: {
      detailUrl: input.detailUrl,
      imageUrl: input.imageUrl ?? null,
      fetchedAt: input.fetchedAt ?? null
    },
    raw: input.raw ?? {},
    engine: {
      status: "unparsed",
      effects: [],
      handler: null,
      notes: []
    }
  };
}
