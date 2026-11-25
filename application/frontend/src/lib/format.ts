import type { Cle, Indicateur } from "./types";

const formats = new Map<string, Intl.NumberFormat>();

export function nombre(valeur: number, decimales = 0): string {
  const cle = String(decimales);
  let format = formats.get(cle);
  if (!format) {
    format = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    formats.set(cle, format);
  }
  return format.format(Object.is(valeur, -0) ? 0 : valeur).replace("-", "−");
}

export const pourcent = (part: number, decimales = 0) => `${nombre(part * 100, decimales)} %`;

const millions = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export const argent = (valeur: number) => `${millions.format(valeur)} M$`;

const SUFFIXES: Record<Cle, string> = {
  mortalite: " ‰",
  esperance: " ans",
  fecondite: "",
  revenu: " $",
  pib: " $",
  sante: " %",
  inflation: " %",
  exportations: " %",
  importations: " %",
};

export const valeurIndicateur = (indicateur: Indicateur, valeur: number) =>
  nombre(valeur, indicateur.decimales) + SUFFIXES[indicateur.cle];

const compact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumSignificantDigits: 3 });
export const abrege = (valeur: number) => compact.format(valeur).replace("-", "−");

const dates = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const heures = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const dateCourte = (iso: string) => {
  const date = new Date(iso);
  return `${dates.format(date)}, ${heures.format(date)}`;
};

export const pluriel = (n: number, singulier: string, plusieurs = `${singulier}s`) =>
  `${nombre(n)} ${Math.abs(n) < 2 ? singulier : plusieurs}`;

/** Met la première lettre en minuscule, sauf dans un sigle comme PIB. */
export const minuscule = (texte: string) =>
  /^\p{Lu}{2}/u.test(texte) ? texte : texte.charAt(0).toLowerCase() + texte.slice(1);

const sansAccents = (texte: string) => texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export const contient = (texte: string, recherche: string) => sansAccents(texte).includes(sansAccents(recherche.trim()));

export const parNom = (a: { nom: string }, b: { nom: string }) => a.nom.localeCompare(b.nom, "fr");
