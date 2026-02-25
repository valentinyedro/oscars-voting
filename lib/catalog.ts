export type CatalogCategory = {
  key: string;
  name: string;
  nominees: string[];
};

// MVP demo catalog (podés ajustar después)
export const OSCARS_CATALOG_2026: CatalogCategory[] = [
  {
    key: "best_picture",
    name: "Best Picture",
    nominees: [
      "Nominee A",
      "Nominee B",
      "Nominee C",
      "Nominee D",
      "Nominee E",
    ],
  },
  {
    key: "best_actor",
    name: "Best Actor",
    nominees: ["Nominee A", "Nominee B", "Nominee C", "Nominee D", "Nominee E"],
  },
  {
    key: "best_actress",
    name: "Best Actress",
    nominees: ["Nominee A", "Nominee B", "Nominee C", "Nominee D", "Nominee E"],
  },
];