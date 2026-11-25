/** Teintes des groupes : de la plus urgente à la moins urgente. */
const PALETTES: Record<number, number[]> = {
  2: [1, 4],
  3: [1, 2, 4],
  4: [1, 2, 3, 4],
};

const numero = (priorite: number, k: number) => (PALETTES[k] ?? [1, 2, 3, 4, 5, 6, 7, 8])[priorite - 1] ?? 8;

export const couleur = (priorite: number, k: number) => `var(--groupe-${numero(priorite, k)})`;
export const couleurTexte = (priorite: number, k: number) => `var(--groupe-${numero(priorite, k)}-texte)`;
