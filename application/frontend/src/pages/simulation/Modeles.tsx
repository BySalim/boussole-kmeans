import { CircleCheck, FlaskConical, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Attente, Bouton, BoutonIcone, Confirmation, Echec } from "../../composants/base";
import { annoncer } from "../../composants/Global";
import { Repartition } from "../../composants/Graphiques";
import { useTitre } from "../../lib/crochets";
import { publierModele, supprimerModele } from "../../lib/espace";
import { dateCourte, nombre, pourcent } from "../../lib/format";
import { useModeles, useReferentiel } from "../../lib/requetes";
import type { Modele } from "../../lib/types";
import { DEPART, resumer, useAtelier } from "./contexte";

export function Modeles() {
  useTitre("Modèles");
  const { data, error, refetch } = useModeles();
  const { data: referentiel } = useReferentiel();
  const { remplacer } = useAtelier();
  const naviguer = useNavigate();
  const [aSupprimer, demander] = useState<Modele | null>(null);

  if (error) return <Echec erreur={error} reessayer={refetch} />;
  if (!data || !referentiel) return <Attente />;
  const nommer = (c: string) => referentiel.indicateurs.find((i) => i.cle === c)?.court ?? c;

  const agir = (action: () => void, message: string) => {
    action();
    annoncer(message);
    demander(null);
  };

  return (
    <div className="page">
      <header className="plan__tete">
        <div>
          <h1>Modèles</h1>
          <p className="page__contexte">Vos modèles, vos données et vos hypothèses restent sur cet appareil.</p>
        </div>
        <Bouton icone={FlaskConical} onClick={() => naviguer("/simulation")}>
          Nouveau modèle
        </Bouton>
      </header>
      <ul className="modeles">
        {data.map((m) => (
          <li key={m.id} className={`modele ${m.publie ? "est-publie" : ""}`}>
            <div className="modele__texte">
              <h2>
                {m.nom}
                {m.publie && (
                  <span className="etat">
                    <CircleCheck size={15} aria-hidden /> Publié
                  </span>
                )}
              </h2>
              <p>{resumer(m.configuration, nommer)}</p>
              <small>
                {m.reference ? "Référence du projet" : dateCourte(m.cree_le)}
                {!m.a_jour && " · entraîné sur des données modifiées depuis"}
              </small>
            </div>
            <Repartition groupes={m.mesures.groupes} />
            <dl className="mesures mesures--ligne">
              <div>
                <dt>Silhouette</dt>
                <dd>{m.mesures.silhouette === null ? "–" : nombre(m.mesures.silhouette, 3)}</dd>
              </div>
              <div>
                <dt>Inertie expliquée</dt>
                <dd>{pourcent(m.mesures.part_expliquee)}</dd>
              </div>
            </dl>
            <div className="modele__gestes">
              {!m.publie && (
                <Bouton onClick={() => agir(() => publierModele(m.id), "Modèle publié : la carte et les plans en tiennent compte.")}>
                  Publier
                </Bouton>
              )}
              <BoutonIcone icone={FlaskConical} libelle="Ouvrir au laboratoire" onClick={() => (remplacer({ ...DEPART, ...m.configuration }), naviguer("/simulation"))} />
              {!m.reference && !m.publie && <BoutonIcone icone={Trash2} libelle="Supprimer le modèle" onClick={() => demander(m)} />}
            </div>
          </li>
        ))}
      </ul>
      <Confirmation titre="Supprimer ce modèle ?" texte={`« ${aSupprimer?.nom ?? ""} » sera supprimé définitivement. Les plans enregistrés ne changent pas.`} action="Supprimer le modèle" ouverte={aSupprimer !== null} onFermer={() => demander(null)} onConfirmer={() => aSupprimer && agir(() => supprimerModele(aSupprimer.id), "Modèle supprimé.")} />
    </div>
  );
}
