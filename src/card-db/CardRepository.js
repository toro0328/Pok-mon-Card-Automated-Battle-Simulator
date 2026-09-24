import { validateCard } from "./validate.js";

export class CardRepository {
  constructor(database) {
    if (!database || !Array.isArray(database.cards)) {
      throw new TypeError("Card database must contain a cards array");
    }
    this.updatedAt = database.updatedAt;
    this.cards = new Map();
    this.byName = new Map();
    for (const card of database.cards) {
      const result = validateCard(card);
      if (!result.ok) throw new Error(`Invalid card ${card?.officialCardId}: ${result.errors.join(", ")}`);
      if (this.cards.has(card.officialCardId)) {
        throw new Error(`Duplicate officialCardId: ${card.officialCardId}`);
      }
      this.cards.set(card.officialCardId, card);
      const matches = this.byName.get(card.name) ?? [];
      matches.push(card);
      this.byName.set(card.name, matches);
    }
  }

  static async load(url = "./data/cards/cards.json", fetcher = fetch) {
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`Card DB request failed: ${response.status}`);
    return new CardRepository(await response.json());
  }

  get(officialCardId) {
    return this.cards.get(Number(officialCardId)) ?? null;
  }

  findByName(name) {
    return [...(this.byName.get(name) ?? [])];
  }

  list({ cardType, trainerType, energyType } = {}) {
    return [...this.cards.values()].filter(card =>
      (!cardType || card.cardType === cardType) &&
      (!trainerType || card.trainerType === trainerType) &&
      (!energyType || card.energyType === energyType)
    );
  }
}
