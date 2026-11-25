import { ArrowRight, ChevronLeft, Download } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Carte, type PaysCarte } from "../composants/Carte";
import { Attente, Bouton, BoutonIcone, Choix, Echec, Pastille } from "../composants/base";
import { annoncer, signaler } from "../composants/Global";
import { Bande, JaugeFrontiere, LegendeBandes, MiniJauge, Repartition } from "../composants/Graphiques";
import { telecharger } from "../lib/api";
import { couleur } from "../lib/couleurs";
import { useMedia, useTitre } from "../lib/crochets";
import { pluriel, valeurIndicateur } from "../lib/format";
import { useReferentiel, useSituation } from "../lib/requetes";
import type { Pays, Referentiel, Situation } from "../lib/types";

const APERCU = 6;
const TOUTES = "toutes";

export function PageCarte() {
  useTitre("Carte");
  const situation = useSituation();
  const referentiel = useReferentiel();
  if (situation.error || referentiel.error) {
    return <Echec erreur={situation.error ?? referentiel.error} reessayer={() => (situation.refetch(), referentiel.refetch())} />;
  }
  if (!situation.data || !referentiel.data) return <Attente />;
  return <Vue situation={situation.data} referentiel={referentiel.data} />;
}

function Vue({ situation, referentiel }: { situation: Situation; referentiel: Referentiel }) {
  const [parametres, changer] = useSearchParams();
  const large = useMedia("(min-width: 900px)");
  const { groupes, pays } = situation;
  const k = groupes.length;
  const priorite = Number(parametres.get("priorite")) || null;
  const region = parametres.get("region") ?? TOUTES;
  const choisi = pays.find((p) => p.id === parametres.get("pays")) ?? null;

  const regler = (cle: string, valeur: string | null) =>
    changer(
      (avant) => {
        const apres = new URLSearchParams(avant);
        if (valeur) apres.set(cle, valeur);
        else apres.delete(cle);
        return apres;
      },
      { replace: true },
    );

  const regions = useMemo(() => [...new Set(pays.map((p) => p.region))].sort((a, b) => a.localeCompare(b, "fr")), [pays]);
  const retenu = (p: Pays) => (!priorite || p.priorite === priorite) && (region === TOUTES || p.region === region);
  const parId = useMemo(() => new Map(pays.map((p) => [p.id, p])), [pays]);
  const mortalite = referentiel.indicateurs.find((i) => i.cle === "mortalite")!;

  const surCarte: PaysCarte[] = useMemo(
    () => pays.map((p) => ({ id: p.id, numero: p.numero, nom: p.nom, couleur: couleur(p.priorite, k), estompe: !retenu(p) })),
    [pays, k, priorite, region],
  );
  const compte = groupes.map((g) => ({ ...g, effectif: pays.filter((p) => p.priorite === g.priorite && (region === TOUTES || p.region === region)).length }));

  return (
    <div className="page-carte">
      <Carte
        pays={surCarte}
        libelle={`Carte du monde : ${groupes.map((g) => `${pluriel(g.effectif, "pays", "pays")} en priorité ${g.priorite}`).join(", ")}`}
        selection={choisi?.id}
        viser={choisi?.id}
        onChoisir={(id) => regler("pays", id === choisi?.id ? null : id)}
        marge={large ? { gauche: 420, droite: 56, haut: 24, bas: 24 } : { haut: 8, bas: 8, gauche: 8, droite: 8 }}
        infobulle={(id) => {
          const p = parId.get(id)!;
          return (
            <>
              <Pastille priorite={p.priorite} k={k} />
              <span>{valeurIndicateur(mortalite, p.valeurs.mortalite)} de mortalité infantile</span>
            </>
          );
        }}
      />
      <aside className="volet" aria-label="Pays">
        {choisi ? (
          <Apercu pays={choisi} situation={situation} referentiel={referentiel} onRetour={() => regler("pays", null)} />
        ) : (
          <Liste
            pays={pays.filter(retenu)}
            k={k}
            compte={compte}
            priorite={priorite}
            region={region}
            regions={regions}
            onPriorite={(p) => regler("priorite", p ? String(p) : null)}
            onRegion={(r) => regler("region", r === TOUTES ? null : r)}
            onChoisir={(id) => regler("pays", id)}
            mortalite={(p) => valeurIndicateur(mortalite, p.valeurs.mortalite)}
          />
        )}
      </aside>
    </div>
  );
}

interface ProprietesListe {
  pays: Pays[];
  k: number;
  compte: Situation["groupes"];
  priorite: number | null;
  region: string;
  regions: string[];
  onPriorite: (p: number | null) => void;
  onRegion: (r: string) => void;
  onChoisir: (id: string) => void;
  mortalite: (p: Pays) => string;
}

function Liste({ pays, k, compte, priorite, region, regions, onPriorite, onRegion, onChoisir, mortalite }: ProprietesListe) {
  const [tout, voirTout] = useState(false);
  const [export_, exporter] = useState(false);
  const tries = [...pays].sort((a, b) => a.priorite - b.priorite || b.valeurs.mortalite - a.valeurs.mortalite);
  const affiches = tout ? tries : tries.slice(0, APERCU);
  const urgents = compte[0]?.effectif ?? 0;

  return (
    <>
      <div className="volet__tete">
        <h1 className="chiffre-titre">
          <b style={{ color: "var(--groupe-1-texte)" }}>{urgents}</b>
          <span>pays à aider en premier</span>
        </h1>
        <Repartition groupes={compte} actif={priorite} onChoisir={onPriorite} />
        <Choix libelle="Région" visible={false} valeur={region} onChange={onRegion} options={[{ valeur: TOUTES, libelle: "Toutes les régions" }, ...regions.map((r) => ({ valeur: r, libelle: r }))]} />
      </div>
      <ul className="liste-pays">
        {affiches.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onChoisir(p.id)}>
              <i className="liste-pays__teinte" style={{ background: couleur(p.priorite, k) }} aria-hidden />
              <span className="liste-pays__nom">{p.nom}</span>
              <MiniJauge profondeur={p.profondeur} priorite={p.priorite} k={k} />
              <span className="liste-pays__valeur" data-bulle="Mortalité infantile">
                {mortalite(p)}
              </span>
            </button>
          </li>
        ))}
        {!tries.length && <li className="liste-pays__vide">Aucun pays ne correspond à ces filtres.</li>}
      </ul>
      <div className="volet__pied">
        {tries.length > APERCU && (
          <Bouton variante="discret" onClick={() => voirTout(!tout)}>
            {tout ? "Réduire la liste" : `Voir les ${tries.length} pays`}
          </Bouton>
        )}
        <BoutonIcone
          icone={Download}
          libelle="Exporter en CSV"
          disabled={export_}
          onClick={async () => {
            exporter(true);
            try {
              await telecharger("/export/pays", "pays-par-priorite.csv");
              annoncer("Liste exportée.");
            } catch (e) {
              signaler(e);
            }
            exporter(false);
          }}
        />
      </div>
    </>
  );
}

function Apercu({ pays, situation, referentiel, onRetour }: { pays: Pays; situation: Situation; referentiel: Referentiel; onRetour: () => void }) {
  const k = situation.groupes.length;
  const cles = situation.indicateurs_modele;
  const indicateurs = referentiel.indicateurs.filter((i) => cles.includes(i.cle)).slice(0, 5);
  return (
    <div className="apercu">
      <div className="apercu__tete">
        <BoutonIcone icone={ChevronLeft} libelle="Retour à la liste" onClick={onRetour} />
        <div>
          <h1>{pays.nom}</h1>
          <p>{pays.region}</p>
        </div>
        <Pastille priorite={pays.priorite} k={k} />
      </div>
      <JaugeFrontiere priorite={pays.priorite} voisin={pays.groupe_voisin} profondeur={pays.profondeur} k={k} />
      <div className="bandes">
        {indicateurs.map((i) => (
          <Bande key={i.cle} indicateur={i} valeur={pays.valeurs[i.cle]} bornes={situation.bornes[i.cle]} groupes={situation.groupes} />
        ))}
        <LegendeBandes k={k} nom={pays.nom} />
      </div>
      <Link className="bouton bouton--principal bouton--large" to={`/pays/${pays.id}`}>
        <span>Ouvrir la fiche</span>
        <ArrowRight size={17} aria-hidden />
      </Link>
    </div>
  );
}
