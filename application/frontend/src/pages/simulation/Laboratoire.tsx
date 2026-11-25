import { Dices, Pause, Play, RotateCcw, Save, SkipBack, SkipForward, SlidersHorizontal, StepBack, StepForward, X } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Carte, type PaysCarte } from "../../composants/Carte";
import { Attente, Bouton, BoutonIcone, Choix, Curseur, Echec, Feuille, Pastille, Puce, Segment } from "../../composants/base";
import { annoncer, signaler } from "../../composants/Global";
import { Repartition } from "../../composants/Graphiques";
import { RepereKMeans } from "../../composants/RepereKMeans";
import { calculer } from "../../lib/api";
import { garderModele } from "../../lib/espace";
import { couleur } from "../../lib/couleurs";
import { useDiffere, useMedia, useTitre } from "../../lib/crochets";
import { nombre, pourcent, valeurIndicateur } from "../../lib/format";
import { useAnalyse, useReferentiel, useSituation } from "../../lib/requetes";
import type { Analyse, Cle, Indicateur, ModeleEntraine, Referentiel, Situation } from "../../lib/types";
import { DEPART, decrireEchelle, ECHELLES, SANS_LIMITE, useAtelier } from "./contexte";

const ETAPES_MAX = 25;

export function Laboratoire() {
  useTitre("Laboratoire");
  const situation = useSituation();
  const referentiel = useReferentiel();
  const erreur = situation.error ?? referentiel.error;
  if (erreur) return <Echec erreur={erreur} reessayer={() => (situation.refetch(), referentiel.refetch())} />;
  if (!situation.data || !referentiel.data) return <Attente />;
  return <Vue situation={situation.data} referentiel={referentiel.data} />;
}

function Vue({ situation, referentiel }: { situation: Situation; referentiel: Referentiel }) {
  const { configuration, regler, remplacer, modifiee } = useAtelier();
  const [axes, choisirAxes] = useState<[Cle, Cle] | null>(null);
  const differee = useDiffere(configuration, 90);
  const { data: analyse, error, isFetching, refetch } = useAnalyse(differee, axes);
  const [enregistrement, ouvrir] = useState(false);
  const [reglage, montrerReglage] = useState(false);
  const indicateurs = useMemo(() => new Map(referentiel.indicateurs.map((i) => [i.cle as string, i])), [referentiel]);

  return (
    <div className={`labo labo--atelier ${reglage ? "est-en-reglage" : ""}`}>
      <aside className="labo__reglages" aria-label="Réglages">
        <div className="labo__titre">
          <h1>Laboratoire</h1>
          <div>
            <BoutonIcone icone={RotateCcw} libelle="Revenir aux réglages de départ" disabled={!modifiee} onClick={() => remplacer(DEPART)} />
            <BoutonIcone className="labo__fermer" icone={X} libelle="Fermer les réglages" onClick={() => montrerReglage(false)} />
          </div>
        </div>
        <Curseur libelle="Nombre de groupes" valeur={configuration.k} min={2} max={8} affichage={String(configuration.k)} onChange={(k) => regler({ k })} />
        <fieldset className="champ">
          <legend className="champ__libelle">Indicateurs</legend>
          <div className="puces">
            {referentiel.indicateurs.map((i) => {
              const choisie = configuration.indicateurs.includes(i.cle);
              return (
                <Puce
                  key={i.cle}
                  choisie={choisie}
                  desactivee={choisie && configuration.indicateurs.length <= 2}
                  bulle={choisie && configuration.indicateurs.length <= 2 ? "Deux indicateurs au minimum" : i.definition}
                  onChange={(v) => regler({ indicateurs: referentiel.indicateurs.map((x) => x.cle).filter((c) => (c === i.cle ? v : configuration.indicateurs.includes(c))) })}
                >
                  {i.court}
                </Puce>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="champ">
          <legend className="champ__libelle" data-bulle={decrireEchelle[configuration.echelle]}>
            Mise à l’échelle
          </legend>
          <Segment libelle="Mise à l’échelle" plein valeur={configuration.echelle} onChange={(echelle) => regler({ echelle })} options={Object.entries(ECHELLES).map(([valeur, libelle]) => ({ valeur: valeur as keyof typeof ECHELLES, libelle }))} />
        </fieldset>
        <fieldset className="champ">
          <legend className="champ__libelle">Centres de départ</legend>
          <Segment
            libelle="Centres de départ"
            plein
            valeur={configuration.initialisation}
            onChange={(initialisation) => regler({ initialisation })}
            options={[
              { valeur: "k-means++", libelle: "k-means++" },
              { valeur: "hasard", libelle: "Au hasard" },
            ]}
          />
        </fieldset>
        <Curseur
          libelle="Étapes au maximum"
          valeur={Math.min(configuration.etapes, ETAPES_MAX + 1)}
          min={1}
          max={ETAPES_MAX + 1}
          affichage={configuration.etapes > ETAPES_MAX ? "Sans limite" : String(configuration.etapes)}
          onChange={(v) => regler({ etapes: v > ETAPES_MAX ? SANS_LIMITE : v })}
        />
        <Curseur libelle="Essais" aide="Départs essayés ; le plus petit total d’inertie est gardé" valeur={configuration.essais} min={1} max={25} affichage={String(configuration.essais)} onChange={(essais) => regler({ essais })} />
        <div className="tirage">
          <Curseur libelle="Tirage au sort" valeur={configuration.graine} min={0} max={99} affichage={String(configuration.graine)} onChange={(graine) => regler({ graine })} />
          <BoutonIcone icone={Dices} libelle="Nouveau tirage" onClick={() => regler({ graine: Math.floor(Math.random() * 100) })} />
        </div>
        <Bouton variante="principal" icone={Save} className="bouton--large" onClick={() => ouvrir(true)} disabled={!analyse}>
          Enregistrer ce modèle
        </Bouton>
      </aside>

      {error && !analyse ? (
        <Echec erreur={error} reessayer={refetch} />
      ) : analyse ? (
        <Resultat analyse={analyse} situation={situation} referentiel={referentiel} indicateurs={indicateurs} axes={axes} choisirAxes={choisirAxes} occupe={isFetching} />
      ) : (
        <Attente libelle="Calcul des groupes…" />
      )}
      <Bouton
        variante="principal"
        icone={SlidersHorizontal}
        className="labo__ouvrir"
        onClick={() => {
          montrerReglage(true);
          document.getElementById("contenu")?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        Réglages
      </Bouton>
      <Enregistrement ouverte={enregistrement} onFermer={() => ouvrir(false)} />
    </div>
  );
}

function Resultat({ analyse, situation, referentiel, indicateurs, axes, choisirAxes, occupe }: { analyse: Analyse; situation: Situation; referentiel: Referentiel; indicateurs: Map<string, Indicateur>; axes: [Cle, Cle] | null; choisirAxes: (a: [Cle, Cle] | null) => void; occupe: boolean }) {
  const { repere, mesures, groupes } = analyse;
  const k = groupes.length;
  const derniere = repere.etapes.length - 1;
  const [etape, aller] = useState(derniere);
  const [lecture, lire] = useState(false);
  const [selection, choisir] = useState<string | null>(null);
  const reduit = useMedia("(prefers-reduced-motion: reduce)");
  const naviguer = useNavigate();

  useEffect(() => {
    aller(repere.etapes.length - 1);
    lire(false);
  }, [repere]);

  const visible = Math.min(etape, derniere);
  useEffect(() => {
    if (!lecture) return;
    if (visible >= derniere) {
      lire(false);
      return;
    }
    const minuterie = setTimeout(() => aller(visible + 1), reduit ? 1100 : 750);
    return () => clearTimeout(minuterie);
  }, [lecture, visible, derniere, reduit]);

  const parId = useMemo(() => new Map(situation.pays.map((p) => [p.id, p])), [situation]);
  const noms = useMemo(() => analyse.pays.map((p) => ({ id: p.id, nom: parId.get(p.id)?.nom ?? p.id })), [analyse, parId]);
  const priorites = repere.etapes[visible]?.priorites;
  const surCarte: PaysCarte[] = useMemo(
    () =>
      analyse.pays.flatMap((p, i) => {
        const connu = parId.get(p.id);
        return connu ? [{ id: p.id, numero: connu.numero, nom: connu.nom, couleur: couleur(priorites?.[i] ?? p.priorite, k) }] : [];
      }),
    [analyse, priorites, parId, k],
  );
  const options = referentiel.indicateurs.map((i) => ({ valeur: i.cle, libelle: i.court }));
  const deuxDuModele = (): [Cle, Cle] => {
    const c = analyse.configuration.indicateurs;
    return [c.includes("revenu") ? "revenu" : c[0]!, c.includes("esperance") ? "esperance" : c[1]!];
  };
  const inertie = repere.etapes[visible]?.inertie ?? mesures.inertie;
  const pays = selection ? parId.get(selection) : null;
  const rangSelection = selection ? analyse.pays.findIndex((p) => p.id === selection) : -1;

  return (
    <div className="labo__resultat" aria-busy={occupe}>
      <section className="labo__repere" aria-label="Repère">
        <div className="labo__outils">
          <Segment
            libelle="Vue du repère"
            valeur={axes ? "indicateurs" : "acp"}
            onChange={(v) => choisirAxes(v === "acp" ? null : deuxDuModele())}
            options={[
              { valeur: "acp", libelle: "Plan principal" },
              { valeur: "indicateurs", libelle: "Deux indicateurs" },
            ]}
          />
          {axes && (
            <div className="labo__axes">
              <Choix libelle="Axe horizontal" visible={false} valeur={axes[0]} options={options.filter((o) => o.valeur !== axes[1])} onChange={(v) => choisirAxes([v, axes[1]])} />
              <Choix libelle="Axe vertical" visible={false} valeur={axes[1]} options={options.filter((o) => o.valeur !== axes[0])} onChange={(v) => choisirAxes([axes[0], v])} />
            </div>
          )}
          <p className="labo__frontieres">
            {repere.frontieres === "exactes" ? "Frontières exactes" : repere.frontieres === "coupe" ? "Frontières dans le plan principal" : "Frontières non visibles sur ces deux axes"}
          </p>
        </div>
        <RepereKMeans repere={repere} etape={visible} k={k} pays={noms} indicateurs={indicateurs} selection={selection} onChoisir={(id) => choisir(id === selection ? null : id)} />
        <div className="lecteur">
          <BoutonIcone icone={SkipBack} libelle="Centres de départ" disabled={visible === 0} onClick={() => (lire(false), aller(0))} />
          <BoutonIcone icone={StepBack} libelle="Étape précédente" disabled={visible === 0} onClick={() => (lire(false), aller(visible - 1))} />
          <BoutonIcone className="lecteur__jouer" icone={lecture ? Pause : Play} libelle={lecture ? "Mettre en pause" : "Dérouler l’algorithme"} onClick={() => (visible >= derniere && !lecture && aller(0), lire(!lecture))} />
          <BoutonIcone icone={StepForward} libelle="Étape suivante" disabled={visible >= derniere} onClick={() => (lire(false), aller(visible + 1))} />
          <BoutonIcone icone={SkipForward} libelle="Dernière étape" disabled={visible >= derniere} onClick={() => (lire(false), aller(derniere))} />
          <input type="range" min={0} max={derniere} value={visible} aria-label="Étape" style={{ "--part": `${(visible / Math.max(1, derniere)) * 100}%` } as CSSProperties} onChange={(e) => (lire(false), aller(Number(e.target.value)))} />
          <output className="lecteur__texte">
            <b>{visible === 0 ? "Départ" : `Étape ${visible} sur ${derniere}`}</b>
            <span>inertie {nombre(inertie, inertie < 10_000 ? 1 : 0)}</span>
          </output>
        </div>
      </section>

      <aside className="labo__mesures" aria-label="Mesures">
        <div className="labo__carte">
          <Carte pays={surCarte} libelle="Groupes sur la carte du monde" selection={selection} onChoisir={(id) => choisir(id === selection ? null : id)} commandes={false} marge={{ haut: 6, bas: 6, gauche: 6, droite: 6 }} infobulle={(id) => <Pastille priorite={priorites?.[analyse.pays.findIndex((p) => p.id === id)] ?? 1} k={k} />} />
        </div>
        {pays && rangSelection >= 0 && (
          <div className="labo__pays">
            <div>
              <b>{pays.nom}</b>
              <Pastille priorite={priorites?.[rangSelection] ?? 1} k={k} />
            </div>
            <span data-bulle="De −1 (mal placé) à 1 (bien placé)">Silhouette {nombre(analyse.pays[rangSelection]!.silhouette, 2)}</span>
            <Bouton variante="discret" onClick={() => naviguer(`/pays/${pays.id}`)}>
              Ouvrir la fiche
            </Bouton>
          </div>
        )}
        <Repartition groupes={groupes} />
        <dl className="mesures mesures--colonne">
          <Mesure nom="Silhouette" aide="Séparation des groupes, de −1 à 1. À comparer seulement entre réglages de mêmes indicateurs et de même échelle." valeur={mesures.silhouette === null ? "–" : nombre(mesures.silhouette, 3)} />
          <Mesure nom="Inertie" aide="Somme des distances au carré entre les pays et leur centre" valeur={nombre(mesures.inertie, mesures.inertie < 10_000 ? 1 : 0)} />
          <Mesure nom="Inertie expliquée" aide="Part de la dispersion totale expliquée par les groupes" valeur={pourcent(mesures.part_expliquee)} />
          <Mesure nom="Davies-Bouldin" aide="Plus il est bas, mieux les groupes sont séparés" valeur={mesures.davies_bouldin === null ? "–" : nombre(mesures.davies_bouldin, 3)} />
          <Mesure nom="Calinski-Harabasz" aide="Plus il est haut, mieux les groupes sont séparés" valeur={mesures.calinski_harabasz === null ? "–" : nombre(mesures.calinski_harabasz, 1)} />
          <Mesure nom="Accord avec le modèle publié" aide="Indice de Rand ajusté : 1 pour les mêmes groupes, environ 0 au hasard" valeur={mesures.accord_modele_publie === null ? "–" : nombre(mesures.accord_modele_publie, 2)} />
        </dl>
        {mesures.essais.length > 1 && <Essais essais={mesures.essais} />}
      </aside>

      <section className="labo__profils">
        <h2>Profil des groupes</h2>
        <div className="tableau-cadre" tabIndex={0} role="region" aria-label="Moyennes par groupe">
          <table className="tableau">
            <thead>
              <tr>
                <th scope="col">Groupe</th>
                <th scope="col" className="nombre">
                  Pays
                </th>
                {referentiel.indicateurs.map((i) => (
                  <th key={i.cle} scope="col" className={`nombre ${analyse.configuration.indicateurs.includes(i.cle) ? "" : "est-hors-modele"}`}>
                    {i.court}
                  </th>
                ))}
                <th scope="col" className="nombre">
                  Silhouette
                </th>
              </tr>
            </thead>
            <tbody>
              {groupes.map((g) => (
                <tr key={g.priorite}>
                  <th scope="row">
                    <Pastille priorite={g.priorite} k={k} />
                  </th>
                  <td className="nombre">{g.effectif}</td>
                  {referentiel.indicateurs.map((i) => (
                    <td key={i.cle} className={`nombre ${analyse.configuration.indicateurs.includes(i.cle) ? "" : "est-hors-modele"}`}>
                      {g.moyennes[i.cle] === null ? "–" : valeurIndicateur(i, g.moyennes[i.cle]!)}
                    </td>
                  ))}
                  <td className="nombre">{g.silhouette == null ? "–" : nombre(g.silhouette, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Mesure({ nom, aide, valeur }: { nom: string; aide: string; valeur: string }) {
  return (
    <div>
      <dt data-bulle={aide}>{nom}</dt>
      <dd>{valeur}</dd>
    </div>
  );
}

function Essais({ essais }: { essais: number[] }) {
  const min = Math.min(...essais);
  const max = Math.max(...essais);
  const premier = essais.indexOf(min);
  return (
    <div className="essais">
      <p className="champ__libelle">Inertie de chaque essai</p>
      <ol aria-label="Inertie de chaque essai">
        {essais.map((v, i) => (
          <li key={i} data-bulle={`Essai ${i + 1} : ${nombre(v, v < 10_000 ? 1 : 0)}${i === premier ? ", gardé" : ""}`} className={i === premier ? "est-garde" : ""} style={{ "--hauteur": `${max === min ? 30 : 18 + ((v - min) / (max - min)) * 82}%` } as CSSProperties}>
            <span className="hors-ecran">{nombre(v, 1)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Enregistrement({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { configuration } = useAtelier();
  const [nom, nommer] = useState("");
  const [occupe, occuper] = useState<"" | "garder" | "publier">("");
  const naviguer = useNavigate();
  useEffect(() => {
    if (ouverte) nommer(`${configuration.k} groupes, ${configuration.indicateurs.length} indicateurs`);
  }, [ouverte]);

  const enregistrer = async (publier: boolean) => {
    occuper(publier ? "publier" : "garder");
    try {
      const modele = await calculer<ModeleEntraine>("/simulation/modeles", { configuration });
      garderModele({ ...modele, nom: nom.trim() }, publier);
      annoncer(publier ? "Modèle publié : la carte et les plans en tiennent compte." : "Modèle enregistré.");
      onFermer();
      naviguer("/simulation/modeles");
    } catch (e) {
      signaler(e);
    }
    occuper("");
  };
  return (
    <Feuille
      titre="Enregistrer ce modèle"
      ouverte={ouverte}
      onFermer={onFermer}
      actions={
        <>
          <Bouton onClick={() => enregistrer(false)} occupe={occupe === "garder"} disabled={!nom.trim() || !!occupe}>
            Enregistrer
          </Bouton>
          <Bouton variante="principal" onClick={() => enregistrer(true)} occupe={occupe === "publier"} disabled={!nom.trim() || !!occupe}>
            Enregistrer et publier
          </Bouton>
        </>
      }
    >
      <label className="champ">
        <span className="champ__libelle">Nom du modèle</span>
        <input className="champ__saisie" data-depart maxLength={60} value={nom} onChange={(e) => nommer(e.target.value)} />
      </label>
      <p className="note">
        Publié, il décide des priorités affichées sur la carte, dans les fiches et dans les plans, sur cet appareil uniquement.
      </p>
    </Feuille>
  );
}
