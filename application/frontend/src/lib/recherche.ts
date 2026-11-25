import { useSyncExternalStore } from "react";
import { calculer } from "./api";
import type { DemandeRecherche, EtatRecherche, ResultatRecherche } from "./types";

// La recherche avance par lots et continue pendant qu'on visite les autres écrans.

interface Lot {
  suite: number | null;
  faites: number;
  total: number;
  ecartees: number;
  resultats: ResultatRecherche[];
}

const GARDE = 40;
let etat: EtatRecherche | null = null;
let arret: AbortController | null = null;
const abonnes = new Set<() => void>();

function publier(suivant: EtatRecherche | null) {
  etat = suivant;
  abonnes.forEach((prevenir) => prevenir());
}

export function useRecherche(): EtatRecherche | null {
  return useSyncExternalStore(
    (prevenir) => {
      abonnes.add(prevenir);
      return () => abonnes.delete(prevenir);
    },
    () => etat,
  );
}

export async function lancerRecherche(demande: DemandeRecherche): Promise<void> {
  arret?.abort();
  const propre = new AbortController();
  arret = propre;
  const debut = performance.now();
  const sens = demande.critere === "davies_bouldin" ? 1 : -1;
  let courant: EtatRecherche = { faites: 0, total: 0, ecartees: 0, terminee: false, arretee: false, duree: 0, critere: demande.critere, resultats: [] };
  let depart: number | null = 0;
  try {
    while (depart !== null) {
      const lot: Lot = await calculer<Lot>("/simulation/recherche", { recherche: demande, depart }, propre.signal);
      if (arret !== propre) return;
      depart = lot.suite;
      courant = {
        ...courant,
        faites: lot.faites,
        total: lot.total,
        ecartees: courant.ecartees + lot.ecartees,
        duree: (performance.now() - debut) / 1000,
        terminee: depart === null,
        resultats: [...courant.resultats, ...lot.resultats].sort((a, b) => sens * (a[demande.critere] - b[demande.critere])).slice(0, GARDE),
      };
      publier(courant);
    }
  } catch (e) {
    if (arret !== propre) return;
    if (courant.total) publier({ ...courant, terminee: true, arretee: true });
    if (!propre.signal.aborted) throw e;
  }
}

export function arreterRecherche(): void {
  arret?.abort();
}
