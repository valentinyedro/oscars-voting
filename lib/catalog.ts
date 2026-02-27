import oscars2026Raw from "./oscars-2026.json";

export type CatalogCategory = {
  key: string; // id estable
  name: string; // display
  nominees: string[];
  sort_order?: number;
};

// Cuando haya que agregar 2027, solo sumo otro JSON acá.
export const catalogs = {
  "oscars-2026": oscars2026Raw as CatalogCategory[],
} as const;

export type CatalogKey = keyof typeof catalogs;

// Default (tu app hoy probablemente asume “el catálogo”)
export const OSCARS_CATALOG: CatalogCategory[] = catalogs["oscars-2026"];

// Helper opcional si después querés elegir por año
export function getCatalog(key: CatalogKey = "oscars-2026"): CatalogCategory[] {
  return catalogs[key];
}