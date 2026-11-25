import { Ban, Download, Pause, Pin, Play, Save, SkipBack, X } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Carte, type PaysCarte } from "../composants/Carte";
import { Attente, Bouton, BoutonIcone, Choix, Curseur, Echec, Feuille, Pastille } from "../composants/base";
import { annoncer, signaler } from "../composants/Global";
import { Courbe } from "../composants/Graphiques";
import { calculer, telecharger } from "../lib/api";
import { garderPlan } from "../lib/espace";
import { couleur } from "../lib/couleurs";
import { useDiffere, useMedia, useTitre } from "../lib/crochets";
import { argent, nombre, parNom, pluriel } from "../lib/format";
import { useComparaison, usePlan, useReferentiel, useSituation } from "../lib/requetes";
import type { LigneComparaison, ParametresPlan, Referentiel, ResultatPlan, Situation, Strategie } from "../lib/types";

const APERCU = 12;
const STRATEGIES: Strategie[] = ["sorties", "urgence", "seuil", "rotation"];

export function PagePlan() {
  useTitre("Plan d’aide");
  const situation = useSituation();
  const referentiel = useReferentiel();
  const erreur = situation.error ?? referentiel.error;
  if (erreur) return <Echec erreur={erreur} reessayer={() => (situation.refetch(), referentiel.refetch())} />;
  if (!situation.data || !referentiel.data) return <Attente />;
  return <Vue situation={situation.data} referentiel={referentiel.data} />;
}

function lireParametres(adresse: URLSearchParams, referentiel: Referentiel): ParametresPlan {
  const { budget, cout, duree } = referentiel.hypotheses;
  const lire = (cle: string, defaut: number, min: number, max: number) => {
    const v = Number(adresse.get(cle));
    return adresse.has(cle) && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : defaut;
  };
  const liste = (cle: string) => (adresse.get(cle) ?? "").split(",").filter((i) => /^[A-Z]{3}$/.test(i));
  const strategie = adresse.get("strategie") as Strategie;
  return {
    budget: lire("budget", budget, 0.5, 500),
    cout: lire("cout", cout, 0.1, 100),
    duree: Math.round(lire("duree", duree, 1, 25)),
    strategie: STRATEGIES.includes(strategie) ? strategie : "sorties",
    imposes: [...new Set([...liste("imposes"), ...liste("imposer")])],
    exclus: liste("exclus"),
  };
}

function Vue({ situation, referentiel }: { situation: Situation; referentiel: Referentiel }) {
  const [adresse, changerAdresse] = useSearchParams();
  const [parametres, changer] = useState(() => lireParametres(adresse, referentiel));
  const differes = useDiffere(parametres);
  const plan = usePlan(differes);
  const comparaison = useComparaison(differes);
  const [annee, aller] = useState(0);
  const [lecture, lire] = useState(false);
  const [enregistrement, ouvrirEnregistrement] = useState(false);
  const reduit = useMedia("(prefers-reduced-motion: reduce)");
  const large = useMedia("(min-width: 900px)");
  const k = situation.groupes.length;

  useEffect(() => {
    const suite = new URLSearchParams();
    suite.set("strategie", differes.strategie);
    suite.set("budget", String(differes.budget));
    suite.set("cout", String(differes.cout));
    suite.set("duree", String(differes.duree));
    if (differes.imposes.length) suite.set("imposes", differes.imposes.join(","));
    if (differes.exclus.length) suite.set("exclus", differes.exclus.join(","));
    changerAdresse(suite, { replace: true });
  }, [differes, changerAdresse]);

  const resultat = plan.data;
  const derniere = resultat ? resultat.annees.length - 1 : 0;
  const visible = Math.min(annee, derniere);

  useEffect(() => {
    if (!lecture) return;
    if (visible >= derniere) {
      lire(false);
      return;
    }
    const minuterie = setTimeout(() => aller(visible + 1), reduit ? 1200 : 850);
    return () => clearTimeout(minuterie);
  }, [lecture, visible, derniere, reduit]);

  const parId = useMemo(() => new Map(situation.pays.map((p) => [p.id, p])), [situation]);
  const etat = resultat?.annees[visible];
  const prioritesAnnee = useMemo(() => new Map(resultat?.pays.map((id, i) => [id, etat?.priorites[i] ?? 1])), [resultat, etat]);
  const surCarte: PaysCarte[] = useMemo(
    () =>
      situation.pays.map((p) => ({
        id: p.id,
        numero: p.numero,
        nom: p.nom,
        couleur: couleur(prioritesAnnee.get(p.id) ?? p.priorite, k),
        estompe: p.priorite !== 1,
      })),
    [situation, prioritesAnnee, k],
  );
  const aides = useMemo(() => new Set(etat?.aides ?? []), [etat]);

  const jouer = () => {
    if (visible >= derniere) aller(0);
    lire(!lecture);
  };

  if (plan.error && !resultat) return <Echec erreur={plan.error} reessayer={() => plan.refetch()} />;
  if (!resultat || !etat) return <Attente libelle="Calcul du plan…" />;
  const { synthese } = resultat;

  return (
    <div className="page plan" aria-busy={plan.isFetching}>
      <header className="plan__tete">
        <h1>Plan d’aide</h1>
        <div className="plan__gestes">
          <Bouton icone={Download} onClick={() => telecharger("/plans/export", "plan-d-aide.csv", { parametres }).then(() => annoncer("Plan exporté."), signaler)}>
            Exporter
          </Bouton>
          <Bouton variante="principal" icone={Save} onClick={() => ouvrirEnregistrement(true)}>
            Enregistrer
          </Bouton>
        </div>
      </header>

      <section className="plan__reglages" aria-label="Moyens">
        <Curseur libelle="Budget par an" valeur={parametres.budget} min={1} max={60} pas={1} affichage={argent(parametres.budget)} onChange={(budget) => changer((p) => ({ ...p, budget }))} />
        <Curseur libelle="Aide par pays et par an" valeur={parametres.cout} min={0.5} max={10} pas={0.5} affichage={argent(parametres.cout)} onChange={(cout) => changer((p) => ({ ...p, cout }))} />
        <Curseur libelle="Durée" valeur={parametres.duree} min={1} max={25} affichage={pluriel(parametres.duree, "an")} onChange={(duree) => changer((p) => ({ ...p, duree }))} />
      </section>

      {synthese.aides_par_an === 0 ? (
        <p className="note note--alerte" role="status">
          Ce budget ne permet d’aider aucun pays. Augmentez-le, ou réduisez l’aide par pays.
        </p>
      ) : null}

      <div className="plan__coeur">
        <section className="plan__resultat" aria-label="Résultat">
          <p className="plan__phrase">
            <b>{synthese.sorties}</b>
            <span>
              {synthese.sorties < 2 ? "pays sort" : "pays sortent"} de la priorité 1 en {pluriel(parametres.duree, "an")}, sur {synthese.prioritaires_depart}
            </span>
          </p>
          <dl className="mesures">
            <div>
              <dt>Pays aidés par an</dt>
              <dd>{nombre(synthese.aides_par_an)}</dd>
            </div>
            <div>
              <dt>Budget utilisé</dt>
              <dd>{argent(synthese.depense)}</dd>
            </div>
            <div>
              <dt>Coût par sortie</dt>
              <dd>{synthese.cout_par_sortie === null ? "–" : argent(synthese.cout_par_sortie)}</dd>
            </div>
            <div>
              <dt data-bulle="Moyenne des pays en priorité 1 au départ">Mortalité infantile</dt>
              <dd>
                {nombre(synthese.mortalite_depart ?? 0, 1)} → {nombre(synthese.mortalite_fin ?? 0, 1)}&nbsp;‰
              </dd>
            </div>
          </dl>
          <ChoixStrategie lignes={comparaison.data} valeur={parametres.strategie} onChange={(strategie) => changer((p) => ({ ...p, strategie }))} noms={referentiel.strategies} />
        </section>

        <section className="plan__monde" aria-label="Projection">
          <div className="plan__carte">
            <Carte
              pays={surCarte}
              libelle={`Année ${visible} : ${pluriel(etat.effectifs[0] ?? 0, "pays", "pays")} en priorité 1`}
              marques={aides}
              commandes={large}
              marge={{ haut: 10, bas: 10, gauche: 10, droite: large ? 48 : 10 }}
              infobulle={(id) => (
                <>
                  <Pastille priorite={prioritesAnnee.get(id) ?? parId.get(id)!.priorite} k={k} />
                  {aides.has(id) && <span>Aidé cette année</span>}
                </>
              )}
            />
            <p className="plan__annee" aria-live="polite">
              <b>Année {visible}</b>
              <span>{pluriel(etat.effectifs[0] ?? 0, "pays", "pays")} en priorité 1</span>
            </p>
          </div>
          <div className="lecteur">
            <BoutonIcone icone={SkipBack} libelle="Revenir au départ" onClick={() => (lire(false), aller(0))} disabled={visible === 0} />
            <BoutonIcone className="lecteur__jouer" icone={lecture ? Pause : Play} libelle={lecture ? "Mettre en pause" : "Lancer la projection"} onClick={jouer} />
            <input
              type="range"
              min={0}
              max={derniere}
              value={visible}
              aria-label="Année"
              aria-valuetext={`Année ${visible}`}
              style={{ "--part": `${(visible / Math.max(1, derniere)) * 100}%` } as CSSProperties}
              onChange={(e) => (lire(false), aller(Number(e.target.value)))}
            />
            <span className="legende-jeton">
              <i aria-hidden /> Aidé
            </span>
          </div>
        </section>
      </div>

      {comparaison.data && (
        <section>
          <h2>Pays en priorité 1, année après année</h2>
          <Courbe
            hauteur={large ? 260 : 220}
            libelle="Nombre de pays en priorité 1 selon la stratégie"
            abscisses={comparaison.data[0]!.courbe.map((_, i) => i)}
            formatX={(a) => `An ${a}`}
            format={(v) => nombre(v)}
            depuisZero
            etiquettes={large}
            repereX={visible}
            onChoisirX={(a) => (lire(false), aller(a))}
            series={comparaison.data.map((l) => ({ cle: l.strategie, libelle: NOMS_COURTS[l.strategie], valeurs: l.courbe, forte: l.strategie === parametres.strategie, couleur: l.strategie === parametres.strategie ? "var(--groupe-1)" : undefined }))}
          />
        </section>
      )}

      <Calendrier resultat={resultat} situation={situation} annee={visible} parametres={parametres} changer={changer} />

      <Enregistrement ouverte={enregistrement} onFermer={() => ouvrirEnregistrement(false)} parametres={parametres} suggestion={`${referentiel.strategies[parametres.strategie]}, ${argent(parametres.budget)} par an`} />
    </div>
  );
}

const NOMS_COURTS: Record<Strategie, string> = {
  sorties: "Plus de sorties",
  urgence: "Plus touchés",
  seuil: "Proches du seuil",
  rotation: "Tour de rôle",
};

const PRINCIPES: Record<Strategie, string> = {
  sorties: "La meilleure combinaison pour ce budget : aucun autre choix ne fait sortir plus de pays",
  urgence: "Là où la mortalité infantile est la plus forte ; c’est aussi ce qui la fait le plus baisser",
  seuil: "Les pays les plus près de la frontière de leur groupe",
  rotation: "Chaque pays à son tour, en commençant par le moins aidé",
};

function ChoixStrategie({ lignes, valeur, onChange, noms }: { lignes?: LigneComparaison[]; valeur: Strategie; onChange: (s: Strategie) => void; noms: Record<Strategie, string> }) {
  const meilleures = lignes && Math.max(...lignes.map((l) => l.sorties));
  const plusBasse = lignes && Math.min(...lignes.map((l) => l.mortalite_fin ?? Infinity));
  return (
    <div className="strategies" role="radiogroup" aria-label="Stratégie">
      <div className="strategies__entete" aria-hidden>
        <span>Stratégie</span>
        <span>Sorties</span>
        <span>Mortalité</span>
      </div>
      {STRATEGIES.map((s) => {
        const l = lignes?.find((x) => x.strategie === s);
        return (
          <label key={s} className={`strategie ${s === valeur ? "est-choisie" : ""}`}>
            <input type="radio" name="strategie" className="hors-ecran" checked={s === valeur} onChange={() => onChange(s)} />
            <span className="strategie__nom" data-bulle={PRINCIPES[s]}>
              {noms[s]}
            </span>
            <span className={l && l.sorties === meilleures ? "est-meilleur" : ""}>{l ? nombre(l.sorties) : "–"}</span>
            <span className={l && l.mortalite_fin !== null && l.mortalite_fin - (plusBasse ?? 0) < 0.05 ? "est-meilleur" : ""}>{l && l.mortalite_fin !== null ? `${nombre(l.mortalite_fin, 1)} ‰` : "–"}</span>
          </label>
        );
      })}
    </div>
  );
}

function Calendrier({ resultat, situation, annee, parametres, changer }: { resultat: ResultatPlan; situation: Situation; annee: number; parametres: ParametresPlan; changer: (f: (p: ParametresPlan) => ParametresPlan) => void }) {
  const [tout, voirTout] = useState(false);
  const parId = useMemo(() => new Map(situation.pays.map((p) => [p.id, p])), [situation]);
  const k = situation.groupes.length;
  const duree = resultat.annees.length - 1;
  const annees = Array.from({ length: duree }, (_, i) => i);
  const aides = useMemo(() => resultat.annees.map((a) => new Set(a.aides)), [resultat]);
  const lignes = useMemo(
    () =>
      resultat.detail
        .filter((d) => d.annees_aide > 0 || parametres.imposes.includes(d.id))
        .sort((a, b) => (a.sortie ?? 99) - (b.sortie ?? 99) || b.annees_aide - a.annees_aide || parNom(parId.get(a.id)!, parId.get(b.id)!)),
    [resultat, parametres.imposes, parId],
  );
  const affichees = tout ? lignes : lignes.slice(0, APERCU);
  const retirables = resultat.detail.filter((d) => !parametres.imposes.includes(d.id) && !parametres.exclus.includes(d.id)).map((d) => parId.get(d.id)!).sort(parNom);

  const basculer = (champ: "imposes" | "exclus", id: string) =>
    changer((p) => {
      const autre = champ === "imposes" ? "exclus" : "imposes";
      const present = p[champ].includes(id);
      return { ...p, [champ]: present ? p[champ].filter((i) => i !== id) : [...p[champ], id], [autre]: p[autre].filter((i) => i !== id) };
    });

  return (
    <section>
      <div className="titre-avec-geste">
        <h2>Qui est aidé, et quand</h2>
        {retirables.length > 0 && (
          <Choix
            libelle="Imposer un pays"
            visible={false}
            className="choix--geste"
            valeur=""
            options={[{ valeur: "", libelle: "Imposer un pays" }, ...retirables.map((p) => ({ valeur: p.id, libelle: p.nom }))]}
            onChange={(id) => id && basculer("imposes", id)}
          />
        )}
      </div>
      {(parametres.imposes.length > 0 || parametres.exclus.length > 0) && (
        <ul className="etiquettes">
          {parametres.imposes.map((id) => (
            <li key={id}>
              <Pin size={13} aria-hidden /> {parId.get(id)?.nom ?? id}
              <BoutonIcone icone={X} taille={14} libelle={`Ne plus imposer ${parId.get(id)?.nom ?? id}`} onClick={() => basculer("imposes", id)} />
            </li>
          ))}
          {parametres.exclus.map((id) => (
            <li key={id} className="est-exclu">
              <Ban size={13} aria-hidden /> {parId.get(id)?.nom ?? id}
              <BoutonIcone icone={X} taille={14} libelle={`Ne plus écarter ${parId.get(id)?.nom ?? id}`} onClick={() => basculer("exclus", id)} />
            </li>
          ))}
        </ul>
      )}
      <div className="calendrier" role="region" aria-label="Calendrier des aides" tabIndex={0}>
        <table style={{ "--annees": duree } as CSSProperties}>
          <thead>
            <tr>
              <th scope="col">Pays</th>
              {annees.map((a) => (
                <th key={a} scope="col" className={a === annee ? "est-courante" : ""}>
                  {a + 1}
                </th>
              ))}
              <th scope="col">Sortie</th>
              <th scope="col">
                <span className="hors-ecran">Gestes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {affichees.map((d) => {
              const p = parId.get(d.id)!;
              return (
                <tr key={d.id}>
                  <th scope="row">
                    <Link to={`/pays/${d.id}`}>{p.nom}</Link>
                  </th>
                  {annees.map((a) => {
                    const aide = aides[a]?.has(d.id);
                    const sorti = d.sortie !== null && a >= d.sortie;
                    return (
                      <td key={a} className={`${a === annee ? "est-courante" : ""}`}>
                        <i className={aide ? "case case--aide" : sorti ? "case case--sortie" : "case"} style={sorti ? ({ "--teinte": couleur(2, k) } as CSSProperties) : undefined} />
                        <span className="hors-ecran">{aide ? "Aidé" : sorti ? "Sorti" : "Non aidé"}</span>
                      </td>
                    );
                  })}
                  <td className="calendrier__sortie">{d.sortie === null ? "–" : `An ${d.sortie}`}</td>
                  <td className="calendrier__gestes">
                    <BoutonIcone icone={Pin} taille={15} libelle={parametres.imposes.includes(d.id) ? "Ne plus imposer" : "Toujours aider en premier"} aria-pressed={parametres.imposes.includes(d.id)} onClick={() => basculer("imposes", d.id)} />
                    <BoutonIcone icone={Ban} taille={15} libelle="Écarter du plan" onClick={() => basculer("exclus", d.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="calendrier__pied">
        <ul className="legende">
          <li>
            <i className="case case--aide" /> Année d’aide
          </li>
          <li>
            <i className="case case--sortie" style={{ "--teinte": couleur(2, k) } as CSSProperties} /> Sorti de la priorité 1
          </li>
        </ul>
        {lignes.length > APERCU && (
          <Bouton variante="discret" onClick={() => voirTout(!tout)}>
            {tout ? "Réduire" : `Voir les ${lignes.length} pays`}
          </Bouton>
        )}
      </div>
    </section>
  );
}

function Enregistrement({ ouverte, onFermer, parametres, suggestion }: { ouverte: boolean; onFermer: () => void; parametres: ParametresPlan; suggestion: string }) {
  const naviguer = useNavigate();
  const [nom, nommer] = useState("");
  const [occupe, occuper] = useState(false);
  useEffect(() => {
    if (ouverte) nommer(suggestion.slice(0, 60));
  }, [ouverte, suggestion]);
  const enregistrer = async () => {
    if (!nom.trim()) return;
    occuper(true);
    try {
      const { annees, synthese } = await calculer<ResultatPlan>("/plans/calculer", { parametres });
      garderPlan({ nom: nom.trim(), parametres, synthese: { ...synthese, courbe: annees.map((a) => a.effectifs[0]) } });
      annoncer("Plan enregistré.");
      onFermer();
      naviguer("/plans");
    } catch (e) {
      signaler(e);
    }
    occuper(false);
  };
  return (
    <Feuille
      titre="Enregistrer le plan"
      ouverte={ouverte}
      onFermer={onFermer}
      actions={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" onClick={enregistrer} occupe={occupe} disabled={!nom.trim()}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <label className="champ">
        <span className="champ__libelle">Nom du plan</span>
        <input className="champ__saisie" data-depart maxLength={60} value={nom} onChange={(e) => nommer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enregistrer()} />
      </label>
    </Feuille>
  );
}
