export type Cle =
  | "mortalite"
  | "esperance"
  | "fecondite"
  | "revenu"
  | "pib"
  | "sante"
  | "inflation"
  | "exportations"
  | "importations";

export type Valeurs = Record<Cle, number>;
export type Strategie = "sorties" | "urgence" | "seuil" | "rotation";
export type EchelleCle = "standard" | "robuste" | "minmax" | "aucune";

export interface Indicateur {
  cle: Cle;
  libelle: string;
  court: string;
  unite: string;
  sens: 1 | -1;
  decimales: number;
  definition: string;
}

export interface Hypotheses {
  progres: number;
  leviers: Cle[];
  budget: number;
  cout: number;
  duree: number;
}

export interface Referentiel {
  indicateurs: Indicateur[];
  retenus: Cle[];
  strategies: Record<Strategie, string>;
  hypotheses: Hypotheses;
  pays: { id: string; nom: string; region: string; valeurs: Valeurs }[];
  modele: Pick<Modele, "configuration" | "mesures">;
}

export interface ParametresModele {
  indicateurs: Cle[];
  origine: number[];
  pas: number[];
  centres: number[][];
}

export interface Contexte {
  donnees: Record<string, Partial<Valeurs>>;
  remplacees: boolean;
  modele?: ParametresModele;
  hypotheses?: Hypotheses;
}

export interface ModeleEntraine {
  configuration: Configuration;
  parametres: ParametresModele;
  mesures: Modele["mesures"];
}

export interface ModeleGarde extends ModeleEntraine {
  id: number;
  nom: string;
  cree_le: string;
  marque: number;
}

export interface Pays {
  id: string;
  numero: string;
  nom: string;
  region: string;
  latitude: number;
  longitude: number;
  priorite: number;
  marge: number;
  profondeur: number;
  groupe_voisin: number;
  valeurs: Valeurs;
}

export interface Groupe {
  priorite: number;
  effectif: number;
  moyennes: Record<Cle, number | null>;
  silhouette?: number | null;
}

export interface Configuration {
  indicateurs: Cle[];
  echelle: EchelleCle;
  k: number;
  initialisation: "k-means++" | "hasard";
  etapes: number;
  essais: number;
  graine: number;
}

export interface Mesures {
  silhouette: number | null;
  davies_bouldin: number | null;
  calinski_harabasz: number | null;
  inertie: number;
  part_expliquee: number;
  iterations: number;
}

export interface Modele {
  id: number;
  nom: string;
  cree_le: string;
  publie: boolean;
  reference: boolean;
  configuration: Configuration;
  mesures: Mesures & { groupes: Groupe[] };
  a_jour: boolean;
}

export interface Situation {
  groupes: Groupe[];
  pays: Pays[];
  bornes: Record<Cle, [number, number]>;
  indicateurs_modele: Cle[];
}

export interface Levier {
  indicateur: Cle;
  requis: number | null;
  atteignable: boolean;
  bornes: [number, number];
}

export interface Lecture {
  priorite: number;
  distances: number[];
  marge: number;
  profondeur: number;
  groupe_voisin: number;
  contributions: { indicateur: Cle; valeur: number }[];
  leviers: {
    vers: number;
    seuls: Levier[];
    ensemble: { part: number; annees: number; valeurs: Partial<Valeurs> } | null;
  } | null;
}

export interface Fiche extends Lecture {
  id: string;
  rangs: Record<Cle, number>;
  effectif_total: number;
  semblables: { id: string; distance: number }[];
  indicateurs_modele: Cle[];
}

export interface ParametresPlan {
  budget: number;
  cout: number;
  duree: number;
  strategie: Strategie;
  imposes: string[];
  exclus: string[];
}

export interface Synthese {
  prioritaires_depart: number;
  prioritaires_fin: number;
  sorties: number;
  premiere_sortie: number | null;
  mortalite_depart: number | null;
  mortalite_fin: number | null;
  depense: number;
  budget_total: number;
  cout_par_sortie: number | null;
  aides_par_an: number;
  pays_aides: number;
}

export interface AnneePlan {
  annee: number;
  priorites: number[];
  aides: string[];
  effectifs: number[];
  mortalite_prioritaires: number | null;
  leviers: Record<string, Partial<Valeurs>>;
}

export interface ResultatPlan {
  parametres: ParametresPlan;
  strategie: string;
  pays: string[];
  annees: AnneePlan[];
  detail: { id: string; annees_aide: number; annees_necessaires: number | null; sortie: number | null }[];
  synthese: Synthese;
}

export interface LigneComparaison extends Synthese {
  strategie: Strategie;
  libelle: string;
  courbe: number[];
}

export interface PlanEnregistre {
  id: string;
  nom: string;
  cree_le: string;
  parametres: ParametresPlan;
  synthese: Synthese & { courbe: number[] };
}

export interface AxeRepere {
  cle?: Cle;
  libelle: string;
  centre: number;
  pas: number;
  variance?: number;
  poids?: Partial<Record<Cle, number>>;
}

export interface EtapeRepere {
  inertie: number;
  centres: [number, number, number][];
  priorites: number[];
}

export interface Repere {
  mode: "acp" | "indicateurs";
  frontieres: "exactes" | "coupe" | "aucune";
  axes: [AxeRepere, AxeRepere];
  points: [number, number][];
  etapes: EtapeRepere[];
}

export interface Analyse {
  configuration: Configuration;
  mesures: Mesures & { essais: number[]; accord_modele_publie: number | null };
  groupes: Groupe[];
  pays: { id: string; priorite: number; silhouette: number }[];
  repere: Repere;
}

export interface PointCourbe {
  k: number;
  silhouette: number | null;
  davies_bouldin: number | null;
  calinski_harabasz: number | null;
  inertie: number;
  part_expliquee: number;
  stabilite: number;
  plus_petit_groupe: number;
}

export type Critere = "silhouette" | "silhouette_commune" | "davies_bouldin" | "calinski_harabasz";

export interface DemandeRecherche {
  indicateurs: Cle[];
  taille_min: number;
  taille_max: number;
  echelles: EchelleCle[];
  k_min: number;
  k_max: number;
  effectif_min: number;
  critere: Critere;
}

export interface ResultatRecherche {
  indicateurs: Cle[];
  echelle: EchelleCle;
  k: number;
  silhouette: number;
  silhouette_commune: number;
  davies_bouldin: number;
  calinski_harabasz: number;
  effectifs: number[];
  accord: number | null;
}

export interface EtatRecherche {
  total: number;
  faites: number;
  ecartees: number;
  terminee: boolean;
  arretee: boolean;
  duree: number;
  critere: Critere;
  resultats: ResultatRecherche[];
}

export interface DonneesAdmin {
  pays: { id: string; nom: string; region: string; modifie: boolean; valeurs: Valeurs }[];
  modifies: number;
  remplacees: boolean;
}
