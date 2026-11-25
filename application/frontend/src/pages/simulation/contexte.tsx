import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { minuscule } from "../../lib/format";
import type { Cle, Configuration, EchelleCle } from "../../lib/types";

export const SANS_LIMITE = 100;

export const DEPART: Configuration = {
  indicateurs: ["mortalite", "esperance", "fecondite", "revenu", "pib"],
  echelle: "standard",
  k: 3,
  initialisation: "k-means++",
  etapes: SANS_LIMITE,
  essais: 10,
  graine: 0,
};

export const ECHELLES: Record<EchelleCle, string> = {
  standard: "Standard",
  robuste: "Robuste",
  minmax: "Min-max",
  aucune: "Aucune",
};

export const decrireEchelle: Record<EchelleCle, string> = {
  standard: "Moyenne 0, écart-type 1",
  robuste: "Médiane et quartiles, moins sensible aux extrêmes",
  minmax: "Toutes les valeurs entre 0 et 1",
  aucune: "Valeurs d’origine : les plus grands nombres dominent",
};

interface Atelier {
  configuration: Configuration;
  regler: (changement: Partial<Configuration>) => void;
  remplacer: (configuration: Configuration) => void;
  modifiee: boolean;
}

const Contexte = createContext<Atelier | null>(null);
const CLE = "boussole-atelier";

const lire = (): Configuration => {
  try {
    const brut = sessionStorage.getItem(CLE);
    return brut ? { ...DEPART, ...JSON.parse(brut) } : DEPART;
  } catch {
    return DEPART;
  }
};

export function Fournisseur({ children }: { children: ReactNode }) {
  const [configuration, remplacer] = useState(lire);
  useEffect(() => {
    try {
      sessionStorage.setItem(CLE, JSON.stringify(configuration));
    } catch {
      /* le réglage vaut pour cette page */
    }
  }, [configuration]);
  const valeur = useMemo<Atelier>(
    () => ({
      configuration,
      remplacer,
      regler: (changement) => remplacer((c) => ({ ...c, ...changement })),
      modifiee: JSON.stringify(configuration) !== JSON.stringify(DEPART),
    }),
    [configuration],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useAtelier(): Atelier {
  const atelier = useContext(Contexte);
  if (!atelier) throw new Error("Atelier absent");
  return atelier;
}

export const resumer = (c: Configuration, nommer: (cle: Cle) => string) =>
  `${c.k} groupes · ${c.indicateurs.length === 9 ? "les neuf indicateurs" : c.indicateurs.map((i) => minuscule(nommer(i))).join(", ")} · échelle ${ECHELLES[c.echelle].toLowerCase()}`;
