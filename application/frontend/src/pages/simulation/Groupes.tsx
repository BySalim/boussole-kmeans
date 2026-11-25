import { FlaskConical } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Attente, Bouton, Echec } from "../../composants/base";
import { Courbe } from "../../composants/Graphiques";
import { useDiffere, useTitre } from "../../lib/crochets";
import { abrege, nombre, pourcent } from "../../lib/format";
import { useCourbes, useReferentiel } from "../../lib/requetes";
import type { PointCourbe } from "../../lib/types";
import { resumer, useAtelier } from "./contexte";

type Champ = "inertie" | "silhouette" | "davies_bouldin" | "calinski_harabasz" | "stabilite";

const inertieTotale = (points: PointCourbe[]) => points[0]!.inertie / (1 - points[0]!.part_expliquee || 1);

/** Le coude : le point le plus éloigné de la corde qui relie un seul groupe à dix groupes. */
function coude(points: PointCourbe[]): number {
  const a = { k: 1, inertie: inertieTotale(points) };
  const b = points.at(-1)!;
  let meilleur = 2;
  let ecart = -Infinity;
  for (const p of points) {
    const x = (p.k - a.k) / (b.k - a.k);
    const y = (p.inertie - b.inertie) / (a.inertie - b.inertie || 1);
    if (1 - x - y > ecart) [ecart, meilleur] = [1 - x - y, p.k];
  }
  return meilleur;
}

const extremum = (points: PointCourbe[], champ: Champ, sens: 1 | -1) =>
  points.reduce((m, p) => ((p[champ] ?? -Infinity * sens) * sens > (m[champ] ?? -Infinity * sens) * sens ? p : m)).k;

export function Groupes() {
  useTitre("Nombre de groupes");
  const { configuration, regler } = useAtelier();
  const referentiel = useReferentiel();
  const { data, error, refetch, isFetching } = useCourbes(useDiffere(configuration));
  const naviguer = useNavigate();
  const [survole, retenir] = useState<number | null>(null);

  const avis = useMemo(
    () =>
      data && [
        { nom: "Coude de l’inertie", k: coude(data) },
        { nom: "Silhouette la plus haute", k: extremum(data, "silhouette", 1) },
        { nom: "Davies-Bouldin le plus bas", k: extremum(data, "davies_bouldin", -1) },
        { nom: "Calinski-Harabasz le plus haut", k: extremum(data, "calinski_harabasz", 1) },
      ],
    [data],
  );

  if (error && !data) return <Echec erreur={error} reessayer={refetch} />;
  if (!data || !avis || !referentiel.data) return <Attente libelle="Comparaison de 2 à 10 groupes…" />;

  const nommer = (c: string) => referentiel.data!.indicateurs.find((i) => i.cle === c)?.court ?? c;
  const votes = new Map<number, number>();
  avis.forEach((a) => votes.set(a.k, (votes.get(a.k) ?? 0) + 1));
  const [conseil, voix] = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]!;
  const k = survole ?? configuration.k;
  const point = data.find((p) => p.k === k);
  const abscisses = data.map((p) => p.k);
  const tracer = (champ: Champ, format: (v: number) => string, titre: string, aide: string, depuisZero = false) => (
    <section className="petit-graphique">
      <h2 data-bulle={aide}>{titre}</h2>
      <Courbe hauteur={190} libelle={`${titre} selon le nombre de groupes`} abscisses={abscisses} format={format} formatX={(v) => `${v}`} depuisZero={depuisZero} repereX={Math.min(10, k)} onChoisirX={retenir} series={[{ cle: champ, libelle: titre, valeurs: data.map((p) => p[champ]), forte: true }]} />
    </section>
  );

  return (
    <div className="page" aria-busy={isFetching}>
      <header className="plan__tete">
        <div>
          <h1>Nombre de groupes</h1>
          <p className="page__contexte">{resumer(configuration, nommer).split(" · ").slice(1).join(" · ")}</p>
        </div>
        <Bouton
          variante="principal"
          icone={FlaskConical}
          onClick={() => {
            regler({ k: Math.min(8, k) });
            naviguer("/simulation");
          }}
        >
          Voir {Math.min(8, k)} groupes au laboratoire
        </Bouton>
      </header>

      <div className="avis">
        <p className="avis__conseil">
          <b>{conseil}</b>
          <span>
            groupes d’après {voix} critère{voix > 1 ? "s" : ""} sur {avis.length}
          </span>
        </p>
        <ul>
          {avis.map((a) => (
            <li key={a.nom} className={a.k === conseil ? "est-choisi" : ""}>
              <span>{a.nom}</span>
              <b>{a.k}</b>
            </li>
          ))}
        </ul>
        {point && (
          <dl className="mesures mesures--ligne">
            <div>
              <dt>Avec {point.k} groupes</dt>
              <dd>{pourcent(point.part_expliquee)} de l’inertie expliquée</dd>
            </div>
            <div>
              <dt>Plus petit groupe</dt>
              <dd>{point.plus_petit_groupe} pays</dd>
            </div>
          </dl>
        )}
      </div>

      <div className="petits-graphiques">
        <section className="petit-graphique">
          <h2 data-bulle="Elle baisse toujours : on cherche où la baisse ralentit">Inertie</h2>
          <Courbe hauteur={190} libelle="Inertie selon le nombre de groupes" abscisses={[1, ...abscisses]} format={abrege} formatX={String} depuisZero repereX={Math.min(10, k)} onChoisirX={(v) => v > 1 && retenir(v)} series={[{ cle: "inertie", libelle: "Inertie", valeurs: [inertieTotale(data), ...data.map((p) => p.inertie)], forte: true }]} />
        </section>
        {tracer("silhouette", (v) => nombre(v, 2), "Silhouette", "Plus elle est haute, mieux les groupes sont séparés")}
        {tracer("davies_bouldin", (v) => nombre(v, 2), "Davies-Bouldin", "Plus il est bas, mieux les groupes sont séparés")}
        {tracer("stabilite", (v) => nombre(v, 2), "Stabilité", "Accord moyen entre douze tirages au sort d’un seul essai (indice de Rand ajusté)")}
      </div>
    </div>
  );
}
