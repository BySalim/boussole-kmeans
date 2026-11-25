import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { FlaskConical, Search, Square } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Attente, Bouton, BoutonIcone, Choix, Curseur, Puce } from "../../composants/base";
import { signaler } from "../../composants/Global";
import { envoyer } from "../../lib/api";
import { useDiffere, useTitre } from "../../lib/crochets";
import { nombre, pluriel } from "../../lib/format";
import { arreterRecherche, lancerRecherche, useRecherche } from "../../lib/recherche";
import { useReferentiel } from "../../lib/requetes";
import type { Cle, Critere, DemandeRecherche, EchelleCle, ResultatRecherche } from "../../lib/types";
import { DEPART, ECHELLES, useAtelier } from "./contexte";

const CRITERES: Record<Critere, string> = {
  silhouette: "Silhouette",
  silhouette_commune: "Silhouette commune",
  davies_bouldin: "Davies-Bouldin",
  calinski_harabasz: "Calinski-Harabasz",
};
const AIDES: Record<Critere, string> = {
  silhouette: "Mesurée dans l’espace de chaque réglage",
  silhouette_commune: "Mesurée pour tous dans le même espace, les neuf indicateurs standardisés : seule comparable d’un réglage à l’autre",
  davies_bouldin: "Plus il est bas, mieux les groupes sont séparés",
  calinski_harabasz: "Plus il est haut, mieux les groupes sont séparés",
};

const DEMANDE: DemandeRecherche = {
  indicateurs: ["mortalite", "esperance", "fecondite", "revenu", "pib", "sante", "inflation", "exportations", "importations"],
  taille_min: 3,
  taille_max: 6,
  echelles: ["standard", "robuste"],
  k_min: 3,
  k_max: 6,
  effectif_min: 10,
  critere: "silhouette_commune",
};

export function PageRecherche() {
  useTitre("Meilleurs réglages");
  const { data: referentiel } = useReferentiel();
  const [demande, regler] = useState(DEMANDE);
  const changer = (c: Partial<DemandeRecherche>) => regler((d) => ({ ...d, ...c }));
  const recherche = useRecherche();
  const [lancement, lancer] = useState(false);

  const differee = useDiffere(demande, 250);
  const estimation = useQuery({
    queryKey: ["estimation", differee],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => envoyer<{ essais: number; maximum: number }>("/simulation/recherche/estimer", differee, signal),
  });

  if (!referentiel) return <Attente />;
  const enCours = lancement || (!!recherche && !recherche.terminee);
  const essais = estimation.data?.essais ?? 0;
  const tropLarge = essais > (estimation.data?.maximum ?? Infinity);

  const demarrer = async () => {
    lancer(true);
    try {
      await lancerRecherche(demande);
    } catch (e) {
      signaler(e);
    }
    lancer(false);
  };

  return (
    <div className="labo labo--recherche">
      <aside className="labo__reglages" aria-label="Étendue de la recherche">
        <div className="labo__titre">
          <h1>Meilleurs réglages</h1>
        </div>
        <Choix libelle="Classer selon" valeur={demande.critere} onChange={(critere) => changer({ critere })} options={Object.entries(CRITERES).map(([valeur, libelle]) => ({ valeur: valeur as Critere, libelle }))} />
        <p className="note">{AIDES[demande.critere]}.</p>
        <fieldset className="champ">
          <legend className="champ__libelle">Indicateurs à combiner</legend>
          <div className="puces">
            {referentiel.indicateurs.map((i) => {
              const choisie = demande.indicateurs.includes(i.cle);
              return (
                <Puce
                  key={i.cle}
                  choisie={choisie}
                  desactivee={choisie && demande.indicateurs.length <= 3}
                  onChange={(v) => {
                    const indicateurs = referentiel.indicateurs.map((x) => x.cle).filter((c: Cle) => (c === i.cle ? v : demande.indicateurs.includes(c)));
                    changer({ indicateurs, taille_max: Math.min(demande.taille_max, indicateurs.length), taille_min: Math.min(demande.taille_min, indicateurs.length) });
                  }}
                >
                  {i.court}
                </Puce>
              );
            })}
          </div>
        </fieldset>
        <Curseur libelle="Indicateurs au minimum" valeur={demande.taille_min} min={2} max={demande.indicateurs.length} affichage={String(demande.taille_min)} onChange={(v) => changer({ taille_min: v, taille_max: Math.max(v, demande.taille_max) })} />
        <Curseur libelle="Indicateurs au maximum" valeur={demande.taille_max} min={2} max={demande.indicateurs.length} affichage={String(demande.taille_max)} onChange={(v) => changer({ taille_max: v, taille_min: Math.min(v, demande.taille_min) })} />
        <fieldset className="champ">
          <legend className="champ__libelle">Échelles</legend>
          <div className="puces">
            {(Object.entries(ECHELLES) as [EchelleCle, string][]).map(([cle, nom]) => {
              const choisie = demande.echelles.includes(cle);
              return (
                <Puce key={cle} choisie={choisie} desactivee={choisie && demande.echelles.length === 1} onChange={(v) => changer({ echelles: v ? [...demande.echelles, cle] : demande.echelles.filter((e) => e !== cle) })}>
                  {nom}
                </Puce>
              );
            })}
          </div>
        </fieldset>
        <Curseur libelle="Groupes au minimum" valeur={demande.k_min} min={2} max={8} affichage={String(demande.k_min)} onChange={(v) => changer({ k_min: v, k_max: Math.max(v, demande.k_max) })} />
        <Curseur libelle="Groupes au maximum" valeur={demande.k_max} min={2} max={8} affichage={String(demande.k_max)} onChange={(v) => changer({ k_max: v, k_min: Math.min(v, demande.k_min) })} />
        <Curseur libelle="Pays par groupe au minimum" aide="Écarte les groupes formés par quelques valeurs extrêmes" valeur={demande.effectif_min} min={1} max={30} affichage={String(demande.effectif_min)} onChange={(effectif_min) => changer({ effectif_min })} />
        {enCours ? (
          <Bouton icone={Square} className="bouton--large" onClick={arreterRecherche}>
            Arrêter
          </Bouton>
        ) : (
          <Bouton variante="principal" icone={Search} className="bouton--large" onClick={demarrer} disabled={tropLarge || !essais}>
            Essayer {nombre(essais)} réglages
          </Bouton>
        )}
        {tropLarge && <p className="champ__refus">Réduisez l’étendue : {nombre(estimation.data!.maximum)} réglages au maximum.</p>}
      </aside>

      <section className="labo__resultat labo__resultat--simple" aria-label="Résultats">
        {recherche ? (
          <>
            <div className="progression">
              <div className="progression__piste" style={{ "--part": `${(recherche.faites / Math.max(1, recherche.total)) * 100}%` } as CSSProperties} role="progressbar" aria-valuenow={recherche.faites} aria-valuemin={0} aria-valuemax={recherche.total} aria-label="Réglages essayés" />
              <p>
                <b>
                  {nombre(recherche.faites)} / {nombre(recherche.total)}
                </b>{" "}
                réglages essayés en {nombre(recherche.duree, recherche.duree < 10 ? 1 : 0)}&nbsp;s
                {recherche.ecartees > 0 && `, ${pluriel(recherche.ecartees, "écarté")} faute de pays dans un groupe`}
              </p>
            </div>
            <Resultats resultats={recherche.resultats} critere={recherche.critere} nommer={(c) => referentiel.indicateurs.find((i) => i.cle === c)!.court} termine={recherche.terminee} />
          </>
        ) : (
          <div className="vide">
            <Search size={28} strokeWidth={1.5} aria-hidden />
            <p className="vide__titre">Lancez la recherche pour classer les combinaisons d’indicateurs, d’échelles et de groupes.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Resultats({ resultats, critere, nommer, termine }: { resultats: ResultatRecherche[]; critere: Critere; nommer: (c: Cle) => string; termine: boolean }) {
  const { remplacer } = useAtelier();
  const naviguer = useNavigate();
  const [tout, voirTout] = useState(false);
  if (!resultats.length) return termine ? <p className="note">Aucun réglage ne respecte le nombre minimal de pays par groupe.</p> : null;
  const colonnes = Object.keys(CRITERES) as Critere[];
  return (
    <>
      <div className="tableau-cadre" tabIndex={0} role="region" aria-label="Meilleurs réglages">
        <table className="tableau tableau--resultats">
          <thead>
            <tr>
              <th scope="col" className="nombre">
                Rang
              </th>
              <th scope="col">Réglage</th>
              <th scope="col">Pays par groupe</th>
              {colonnes.map((c) => (
                <th key={c} scope="col" className={`nombre ${c === critere ? "est-trie" : ""}`} data-bulle={AIDES[c]}>
                  {CRITERES[c]}
                </th>
              ))}
              <th scope="col" className="nombre" data-bulle="Indice de Rand ajusté avec le modèle publié">
                Accord
              </th>
              <th scope="col">
                <span className="hors-ecran">Gestes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(tout ? resultats : resultats.slice(0, 12)).map((r, i) => (
              <tr key={`${r.k}-${r.echelle}-${r.indicateurs.join()}`}>
                <td className="nombre">{i + 1}</td>
                <th scope="row">
                  <b>{r.k} groupes</b>, échelle {ECHELLES[r.echelle].toLowerCase()}
                  <small>{r.indicateurs.map(nommer).join(", ")}</small>
                </th>
                <td className="effectifs">{r.effectifs.join(" · ")}</td>
                {colonnes.map((c) => (
                  <td key={c} className={`nombre ${c === critere ? "est-trie" : ""}`}>
                    {nombre(r[c], c === "calinski_harabasz" ? 1 : 3)}
                  </td>
                ))}
                <td className="nombre">{r.accord === null ? "–" : nombre(r.accord, 2)}</td>
                <td>
                  <BoutonIcone
                    icone={FlaskConical}
                    libelle="Ouvrir au laboratoire"
                    onClick={() => {
                      remplacer({ ...DEPART, indicateurs: r.indicateurs, echelle: r.echelle, k: r.k });
                      naviguer("/simulation");
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {resultats.length > 12 && (
        <Bouton variante="discret" onClick={() => voirTout(!tout)}>
          {tout ? "Réduire" : `Voir les ${resultats.length} meilleurs`}
        </Bouton>
      )}
    </>
  );
}
