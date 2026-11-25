import { FolderOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BoutonIcone, Confirmation, Vide } from "../composants/base";
import { annoncer } from "../composants/Global";
import { Courbe } from "../composants/Graphiques";
import { useMedia, useTitre } from "../lib/crochets";
import { supprimerPlan, useEspace } from "../lib/espace";
import { argent, dateCourte, nombre, pluriel } from "../lib/format";
import type { PlanEnregistre } from "../lib/types";

const TEINTES = ["var(--groupe-1)", "var(--groupe-4)", "var(--groupe-3)", "var(--groupe-2)"];

const adresse = ({ parametres: p }: PlanEnregistre) => {
  const a = new URLSearchParams({ strategie: p.strategie, budget: String(p.budget), cout: String(p.cout), duree: String(p.duree) });
  if (p.imposes.length) a.set("imposes", p.imposes.join(","));
  if (p.exclus.length) a.set("exclus", p.exclus.join(","));
  return `/plan?${a}`;
};

export function PagePlans() {
  useTitre("Mes plans");
  const { plans } = useEspace();
  const large = useMedia("(min-width: 900px)");
  const [choisis, choisir] = useState<string[] | null>(null);
  const [aSupprimer, demander] = useState<PlanEnregistre | null>(null);

  if (!plans.length) {
    return (
      <div className="page">
        <h1>Mes plans</h1>
        <Vide icone={FolderOpen} titre="Vos plans d’aide enregistrés apparaîtront ici.">
          <Link className="bouton bouton--principal" to="/plan">
            <span>Préparer un plan</span>
          </Link>
        </Vide>
      </div>
    );
  }

  const selection = choisis ?? plans.slice(0, 3).map((p) => p.id);
  const compares = plans.filter((p) => selection.includes(p.id)).slice(0, 4);
  const teinte = (id: string) => {
    const rang = compares.findIndex((p) => p.id === id);
    return rang < 0 ? undefined : TEINTES[rang];
  };
  const basculer = (id: string) =>
    choisir(selection.includes(id) ? selection.filter((i) => i !== id) : [...selection, id].slice(-4));
  const duree = Math.max(...compares.map((p) => p.synthese.courbe.length), 1);

  const supprimer = () => {
    if (!aSupprimer) return;
    supprimerPlan(aSupprimer.id);
    annoncer("Plan supprimé.");
    demander(null);
  };

  return (
    <div className="page">
      <header className="plan__tete">
        <h1>Mes plans</h1>
        <Link className="bouton bouton--principal" to="/plan">
          <span>Nouveau plan</span>
        </Link>
      </header>

      {compares.length > 0 && (
        <section>
          <h2>Pays encore en priorité 1</h2>
          <Courbe
            hauteur={260}
            libelle="Comparaison des plans choisis"
            abscisses={Array.from({ length: duree }, (_, i) => i)}
            formatX={(a) => `An ${a}`}
            format={(v) => nombre(v)}
            depuisZero
            etiquettes={false}
            series={compares.map((p) => ({
              cle: p.id,
              libelle: p.nom,
              valeurs: Array.from({ length: duree }, (_, i) => p.synthese.courbe[i] ?? null),
              forte: true,
              couleur: teinte(p.id),
            }))}
          />
        </section>
      )}

      <ul className="plans">
        {plans.map((p) => (
          <li key={p.id} className="plan-ligne">
            <label className="plan-ligne__choix" data-bulle={selection.includes(p.id) ? "Retirer de la comparaison" : "Ajouter à la comparaison"}>
              <input type="checkbox" className="hors-ecran" checked={selection.includes(p.id)} onChange={() => basculer(p.id)} />
              <i style={{ background: teinte(p.id) }} aria-hidden />
              <span className="hors-ecran">Comparer {p.nom}</span>
            </label>
            <div className="plan-ligne__texte">
              <Link to={adresse(p)}>{p.nom}</Link>
              <small>
                {argent(p.parametres.budget)} par an pendant {pluriel(p.parametres.duree, "an")} · {dateCourte(p.cree_le)}
              </small>
            </div>
            <dl className="mesures mesures--ligne">
              <div>
                <dt>Sorties</dt>
                <dd>
                  {nombre(p.synthese.sorties)} / {nombre(p.synthese.prioritaires_depart)}
                </dd>
              </div>
              <div>
                <dt>Budget utilisé</dt>
                <dd>{argent(p.synthese.depense)}</dd>
              </div>
              {large && (
                <div>
                  <dt>Coût par sortie</dt>
                  <dd>{p.synthese.cout_par_sortie === null ? "–" : argent(p.synthese.cout_par_sortie)}</dd>
                </div>
              )}
            </dl>
            <BoutonIcone icone={Trash2} libelle="Supprimer le plan" onClick={() => demander(p)} />
          </li>
        ))}
      </ul>

      <Confirmation titre="Supprimer ce plan ?" texte={`« ${aSupprimer?.nom ?? ""} » sera supprimé définitivement.`} action="Supprimer le plan" ouverte={aSupprimer !== null} onFermer={() => demander(null)} onConfirmer={supprimer} />
    </div>
  );
}
