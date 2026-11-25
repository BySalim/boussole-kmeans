import { RotateCcw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Attente, Bouton, Confirmation, Curseur, Echec, Puce } from "../../composants/base";
import { annoncer } from "../../composants/Global";
import { Courbe } from "../../composants/Graphiques";
import { useTitre } from "../../lib/crochets";
import { fixerHypotheses, reinitialiser } from "../../lib/espace";
import { argent, nombre, pluriel, pourcent } from "../../lib/format";
import { useReferentiel } from "../../lib/requetes";
import type { Hypotheses as Type, Referentiel } from "../../lib/types";

export function Hypotheses() {
  useTitre("Hypothèses");
  const { data, error, refetch } = useReferentiel();
  if (error) return <Echec erreur={error} reessayer={refetch} />;
  if (!data) return <Attente />;
  return <Vue referentiel={data} />;
}

function Vue({ referentiel }: { referentiel: Referentiel }) {
  const [valeurs, changer] = useState<Type>(referentiel.hypotheses);
  const [remise, demander] = useState(false);
  useEffect(() => changer(referentiel.hypotheses), [referentiel.hypotheses]);
  const modifiees = JSON.stringify(valeurs) !== JSON.stringify(referentiel.hypotheses);
  const annees = useMemo(() => Array.from({ length: 11 }, (_, i) => i), []);

  const enregistrer = () => {
    fixerHypotheses(valeurs);
    annoncer("Hypothèses enregistrées.");
  };
  const effacer = () => {
    reinitialiser();
    demander(false);
    annoncer("Tout est revenu à l’état de départ.");
  };

  return (
    <div className="page hypotheses">
      <header className="plan__tete">
        <h1>Hypothèses</h1>
        <Bouton variante="principal" icone={Save} onClick={enregistrer} disabled={!modifiees}>
          Enregistrer
        </Bouton>
      </header>

      <section className="hypotheses__bloc">
        <div>
          <h2>Effet de l’aide</h2>
          <Curseur libelle="Retard rattrapé par année d’aide" valeur={Math.round(valeurs.progres * 100)} min={1} max={60} affichage={pourcent(valeurs.progres)} onChange={(v) => changer({ ...valeurs, progres: v / 100 })} />
          <fieldset className="champ">
            <legend className="champ__libelle">Indicateurs que l’aide améliore</legend>
            <div className="puces">
              {referentiel.indicateurs.map((i) => {
                const choisie = valeurs.leviers.includes(i.cle);
                return (
                  <Puce key={i.cle} choisie={choisie} desactivee={choisie && valeurs.leviers.length === 1} onChange={(v) => changer({ ...valeurs, leviers: referentiel.indicateurs.map((x) => x.cle).filter((c) => (c === i.cle ? v : valeurs.leviers.includes(c))) })}>
                    {i.court}
                  </Puce>
                );
              })}
            </div>
          </fieldset>
        </div>
        <div>
          <h3>Retard restant après plusieurs années d’aide</h3>
          <Courbe hauteur={190} libelle="Part du retard restant selon le nombre d’années d’aide" abscisses={annees} formatX={(a) => `${a}`} format={(v) => `${nombre(v)} %`} depuisZero series={[{ cle: "retard", libelle: "Retard restant", valeurs: annees.map((a) => 100 * (1 - valeurs.progres) ** a), forte: true, couleur: "var(--groupe-1)" }]} />
        </div>
      </section>

      <section className="hypotheses__bloc">
        <div>
          <h2>Valeurs proposées dans un nouveau plan</h2>
          <Curseur libelle="Budget par an" valeur={valeurs.budget} min={1} max={60} affichage={argent(valeurs.budget)} onChange={(budget) => changer({ ...valeurs, budget })} />
          <Curseur libelle="Aide par pays et par an" valeur={valeurs.cout} min={0.5} max={10} pas={0.5} affichage={argent(valeurs.cout)} onChange={(cout) => changer({ ...valeurs, cout })} />
          <Curseur libelle="Durée" valeur={valeurs.duree} min={1} max={25} affichage={pluriel(valeurs.duree, "an")} onChange={(duree) => changer({ ...valeurs, duree })} />
        </div>
        <div className="hypotheses__remise">
          <h3>Revenir à l’état de départ</h3>
          <p>Les modèles enregistrés, les données modifiées et les hypothèses sont effacés. Les plans sont conservés.</p>
          <Bouton icone={RotateCcw} onClick={() => demander(true)}>
            Tout réinitialiser
          </Bouton>
        </div>
      </section>

      <Confirmation titre="Tout réinitialiser ?" texte="Les modèles enregistrés, les données modifiées et les hypothèses seront effacés définitivement." action="Tout réinitialiser" ouverte={remise} onFermer={() => demander(false)} onConfirmer={effacer} />
    </div>
  );
}
