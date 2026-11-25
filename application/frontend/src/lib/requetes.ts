import { keepPreviousData, QueryClient, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { calculer, ErreurApi, lire } from "./api";
import { marqueDesDonnees, useContexte, useEspace } from "./espace";
import type {
  Analyse,
  Cle,
  Configuration,
  DonneesAdmin,
  Fiche,
  LigneComparaison,
  Modele,
  ParametresPlan,
  PointCourbe,
  Referentiel,
  ResultatPlan,
  Situation,
} from "./types";

export const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: (essais, erreur) => !(erreur instanceof ErreurApi && erreur.statut >= 400 && erreur.statut < 500) && essais < 2,
    },
  },
});

const REFERENCE = 0;

/** Ce qui est commun à tous, avec les hypothèses du visiteur. */
export function useReferentiel() {
  const requete = useQuery({ queryKey: ["referentiel"], queryFn: ({ signal }) => lire<Referentiel>("/referentiel", signal) });
  const { hypotheses } = useEspace();
  const data = useMemo(() => requete.data && { ...requete.data, hypotheses: hypotheses ?? requete.data.hypotheses }, [requete.data, hypotheses]);
  return { data, error: requete.error, refetch: requete.refetch };
}

export function useSituation() {
  const contexte = useContexte();
  return useQuery({
    queryKey: ["situation", contexte],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => calculer<Situation>("/situation", {}, signal),
  });
}

export function useFiche(id: string) {
  const contexte = useContexte();
  return useQuery<Fiche>({
    queryKey: ["fiche", id, contexte],
    placeholderData: (ancienne) => (ancienne?.id === id ? ancienne : undefined),
    queryFn: ({ signal }) => calculer<Fiche>(`/pays/${id}`, {}, signal),
  });
}

export function usePlan(parametres: ParametresPlan | null) {
  const contexte = useContexte();
  return useQuery({
    queryKey: ["plan", parametres, contexte],
    enabled: parametres !== null,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => calculer<ResultatPlan>("/plans/calculer", { parametres }, signal),
  });
}

export function useComparaison(parametres: ParametresPlan | null) {
  const contexte = useContexte();
  const commun = parametres && { ...parametres, strategie: "sorties" as const };
  return useQuery({
    queryKey: ["comparaison", commun, contexte],
    enabled: parametres !== null,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => calculer<LigneComparaison[]>("/plans/comparer", { parametres: commun }, signal),
  });
}

export function useAnalyse(configuration: Configuration, axes: [Cle, Cle] | null) {
  const contexte = useContexte();
  return useQuery({
    queryKey: ["analyse", configuration, axes, contexte],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      calculer<Analyse>("/simulation/laboratoire", { configuration, axe_x: axes?.[0] ?? null, axe_y: axes?.[1] ?? null }, signal),
  });
}

export function useCourbes(configuration: Configuration) {
  const { donnees, remplacees } = useEspace();
  return useQuery({
    queryKey: ["courbes", { ...configuration, k: 0 }, donnees, remplacees],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => calculer<PointCourbe[]>("/simulation/courbes", { configuration }, signal),
  });
}

/** Le modèle du notebook, puis ceux du visiteur ; le modèle publié en tête. */
export function useModeles() {
  const { data: referentiel, error, refetch } = useReferentiel();
  const espace = useEspace();
  const data = useMemo<Modele[] | undefined>(() => {
    if (!referentiel) return undefined;
    const publie = espace.modeles.some((m) => m.id === espace.publie) ? espace.publie : REFERENCE;
    const marque = marqueDesDonnees();
    const tous = [
      ...espace.modeles,
      { ...referentiel.modele, id: REFERENCE, nom: "Modèle du notebook", cree_le: "", marque: 0 },
    ].map((m) => ({ ...m, publie: m.id === publie, reference: m.id === REFERENCE, a_jour: m.marque === marque }));
    return tous.sort((a, b) => Number(b.publie) - Number(a.publie));
  }, [referentiel, espace]);
  return { data, error, refetch };
}

export function useDonnees() {
  const { data: referentiel, error, refetch } = useReferentiel();
  const { donnees, remplacees } = useEspace();
  const data = useMemo<DonneesAdmin | undefined>(() => {
    if (!referentiel) return undefined;
    const pays = referentiel.pays
      .filter((p) => !remplacees || donnees[p.id])
      .map((p) => {
        const propres = donnees[p.id] ?? {};
        return { ...p, valeurs: { ...p.valeurs, ...propres }, modifie: Object.entries(propres).some(([c, v]) => v !== p.valeurs[c as Cle]) };
      });
    return { pays, modifies: pays.filter((p) => p.modifie).length, remplacees };
  }, [referentiel, donnees, remplacees]);
  return { data, error, refetch };
}
