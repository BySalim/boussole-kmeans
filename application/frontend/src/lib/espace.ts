import { useSyncExternalStore } from "react";
import type { Cle, Contexte, Hypotheses, ModeleGarde, PlanEnregistre, Valeurs } from "./types";

// Tout ce que le visiteur change reste dans son navigateur et accompagne chaque demande.

interface Espace {
  donnees: Contexte["donnees"];
  remplacees: boolean;
  hypotheses: Hypotheses | null;
  modeles: ModeleGarde[];
  publie: number | null;
  plans: PlanEnregistre[];
}

const CLE = "boussole-espace";
const VIDE: Espace = { donnees: {}, remplacees: false, hypotheses: null, modeles: [], publie: null, plans: [] };
const MODELES_MAX = 25;
const PLANS_MAX = 30;

function relire(): Espace {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE) ?? "null");
    const valable =
      brut && typeof brut === "object" && typeof brut.donnees === "object" && brut.donnees && Array.isArray(brut.modeles) && Array.isArray(brut.plans);
    return valable ? { ...VIDE, ...brut } : VIDE;
  } catch {
    return VIDE;
  }
}

let espace = relire();
let contexte = preparer(espace);
const abonnes = new Set<() => void>();

function preparer(e: Espace): Contexte {
  const modele = e.modeles.find((m) => m.id === e.publie)?.parametres;
  return {
    donnees: e.donnees,
    remplacees: e.remplacees,
    ...(modele && { modele }),
    ...(e.hypotheses && { hypotheses: e.hypotheses }),
  };
}

function installer(suivant: Espace) {
  espace = suivant;
  contexte = preparer(suivant);
  abonnes.forEach((prevenir) => prevenir());
}

function changer(changement: Partial<Espace>) {
  installer({ ...espace, ...changement });
  try {
    localStorage.setItem(CLE, JSON.stringify(espace));
  } catch {
    /* navigation privée : l'espace dure le temps de la visite */
  }
}

window.addEventListener("storage", (e) => {
  if (e.key === CLE || e.key === null) installer(relire());
});

const abonner = (prevenir: () => void) => {
  abonnes.add(prevenir);
  return () => abonnes.delete(prevenir);
};

export const useEspace = () => useSyncExternalStore(abonner, () => espace);
export const useContexte = () => useSyncExternalStore(abonner, () => contexte);
export const contexteActuel = () => contexte;

const trier = (valeurs: Partial<Valeurs>) => Object.entries(valeurs).sort(([a], [b]) => (a < b ? -1 : 1));

/** Deux états identiques des données ont la même empreinte. */
const empreinte = (e: Pick<Espace, "donnees" | "remplacees">) =>
  e.remplacees || Object.keys(e.donnees).length
    ? JSON.stringify([e.remplacees, Object.entries(e.donnees).sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, v]) => [id, trier(v)])])
    : "";

const numero = (texte: string) => {
  let n = 0;
  for (let i = 0; i < texte.length; i++) n = (Math.imul(n, 31) + texte.charCodeAt(i)) | 0;
  return texte ? n || 1 : 0;
};
export const marqueDesDonnees = () => numero(empreinte(espace));

export function corriger(id: string, nouvelles: Partial<Valeurs>, reference: Valeurs) {
  const propres: Partial<Valeurs> = { ...espace.donnees[id], ...nouvelles };
  const donnees = { ...espace.donnees };
  if (espace.remplacees) donnees[id] = propres;
  else {
    const restantes = Object.entries(propres).filter(([c, v]) => v !== reference[c as Cle]);
    if (restantes.length) donnees[id] = Object.fromEntries(restantes);
    else delete donnees[id];
  }
  changer({ donnees });
}

export const importer = (donnees: Contexte["donnees"]) => changer({ donnees, remplacees: true });
export const retablir = () => changer({ donnees: {}, remplacees: false });
export const fixerHypotheses = (hypotheses: Hypotheses) => changer({ hypotheses });
export const reinitialiser = () => changer({ ...VIDE, plans: espace.plans });

export function garderModele(modele: Omit<ModeleGarde, "id" | "cree_le" | "marque">, publier: boolean) {
  if (espace.modeles.length >= MODELES_MAX) throw new Error("Vous avez atteint 25 modèles. Supprimez-en un pour enregistrer celui-ci.");
  const id = Math.max(0, ...espace.modeles.map((m) => m.id)) + 1;
  const garde: ModeleGarde = { ...modele, id, cree_le: new Date().toISOString(), marque: marqueDesDonnees() };
  changer({ modeles: [garde, ...espace.modeles], publie: publier ? id : espace.publie });
}

export const publierModele = (id: number) => changer({ publie: id || null });
export const supprimerModele = (id: number) => changer({ modeles: espace.modeles.filter((m) => m.id !== id) });

export function garderPlan(plan: Omit<PlanEnregistre, "id" | "cree_le">) {
  if (espace.plans.length >= PLANS_MAX) throw new Error("Vous avez atteint 30 plans. Supprimez-en un pour enregistrer celui-ci.");
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  changer({ plans: [{ ...plan, id, cree_le: new Date().toISOString() }, ...espace.plans] });
}

export const supprimerPlan = (id: string) => changer({ plans: espace.plans.filter((p) => p.id !== id) });
