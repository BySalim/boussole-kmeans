import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { HandCoins, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Attente, Bouton, Curseur, Echec, Pastille } from "../composants/base";
import { Bande, JaugeFrontiere, LegendeBandes } from "../composants/Graphiques";
import { calculer } from "../lib/api";
import { useContexte } from "../lib/espace";
import { couleur } from "../lib/couleurs";
import { useDiffere, useTitre } from "../lib/crochets";
import { minuscule, pluriel, pourcent, valeurIndicateur } from "../lib/format";
import { useFiche, useReferentiel, useSituation } from "../lib/requetes";
import type { Cle, Fiche, Indicateur, Lecture, Pays, Referentiel, Situation } from "../lib/types";

export function PageFiche() {
  const { id = "" } = useParams();
  const identifiant = id.toUpperCase();
  const fiche = useFiche(identifiant);
  const situation = useSituation();
  const referentiel = useReferentiel();
  const pays = situation.data?.pays.find((p) => p.id === identifiant);
  useTitre(pays?.nom ?? "Pays");

  const erreur = fiche.error ?? situation.error ?? referentiel.error;
  if (erreur) return <Echec erreur={erreur} reessayer={() => (fiche.refetch(), situation.refetch(), referentiel.refetch())} />;
  if (!fiche.data || !situation.data || !referentiel.data || !pays) return <Attente />;
  return <Vue key={identifiant} fiche={fiche.data} pays={pays} situation={situation.data} referentiel={referentiel.data} />;
}

function Vue({ fiche, pays, situation, referentiel }: { fiche: Fiche; pays: Pays; situation: Situation; referentiel: Referentiel }) {
  const { groupes, bornes } = situation;
  const k = groupes.length;
  const parCle = useMemo(() => new Map(referentiel.indicateurs.map((i) => [i.cle, i])), [referentiel]);
  const duModele = fiche.indicateurs_modele.map((c) => parCle.get(c)!);
  const autres = referentiel.indicateurs.filter((i) => !fiche.indicateurs_modele.includes(i.cle));
  const [modifiees, modifier] = useState<Partial<Record<Cle, number>>>({});
  const essai = useDiffere(modifiees);
  const enEssai = Object.keys(essai).length > 0;

  const contexte = useContexte();
  const simulation = useQuery({
    queryKey: ["simulation", pays.id, essai, contexte],
    enabled: enEssai,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => calculer<Lecture>(`/pays/${pays.id}/simuler`, { valeurs: essai }, signal),
  });
  const lecture: Lecture = enEssai && simulation.data ? simulation.data : fiche;
  useEffect(() => modifier({}), [pays.id]);

  const valeur = (c: Cle) => modifiees[c] ?? pays.valeurs[c];
  const raisons = [...fiche.contributions].filter((c) => c.valeur > 0).sort((a, b) => b.valeur - a.valeur).slice(0, 3);
  const semblables = fiche.semblables.flatMap((s) => situation.pays.find((p) => p.id === s.id) ?? []);

  return (
    <div className="page fiche">
      <header className="fiche__tete">
        <div>
          <p className="fiche__region">{pays.region}</p>
          <h1>{pays.nom}</h1>
        </div>
        <div className="fiche__gestes">
          <Link className="bouton bouton--second" to={`/?pays=${pays.id}`}>
            <MapPin size={17} aria-hidden />
            <span>Voir sur la carte</span>
          </Link>
          {pays.priorite === 1 && (
            <Link className="bouton bouton--principal" to={`/plan?imposer=${pays.id}`}>
              <HandCoins size={17} aria-hidden />
              <span>Ajouter au plan</span>
            </Link>
          )}
        </div>
      </header>

      <section className="fiche__position" aria-label="Position du pays">
        <div className="fiche__groupe">
          <span className="grand-groupe" style={{ background: couleur(lecture.priorite, k) }}>
            {lecture.priorite}
          </span>
          <p>
            <b>
              {enEssai && lecture.priorite !== fiche.priorite ? `Passe de la priorité ${fiche.priorite} à ${lecture.priorite}` : `Priorité ${lecture.priorite}`}
            </b>
            <span>{situer(lecture.profondeur, lecture.priorite, lecture.groupe_voisin)}</span>
          </p>
        </div>
        <JaugeFrontiere priorite={lecture.priorite} voisin={lecture.groupe_voisin} profondeur={lecture.profondeur} k={k} depart={enEssai ? fiche : undefined} />
      </section>

      <div className="fiche__colonnes">
        <section>
          <h2>Ses chiffres face aux moyennes des groupes</h2>
          <div className="bandes bandes--larges">
            {duModele.map((i) => (
              <Bande key={i.cle} indicateur={i} valeur={valeur(i.cle)} origine={pays.valeurs[i.cle]} bornes={bornes[i.cle]} groupes={groupes} />
            ))}
          </div>
          <LegendeBandes k={k} nom={pays.nom} />
          {raisons.length > 0 && (
            <p className="fiche__raison">
              Ce qui le rattache le plus à la priorité {fiche.priorite} : {raisons.map((r) => minuscule(parCle.get(r.indicateur)!.libelle)).join(", ")}.
            </p>
          )}
          {autres.length > 0 && (
            <details className="repli">
              <summary>Autres indicateurs</summary>
              <div className="bandes bandes--larges">
                {autres.map((i) => (
                  <Bande key={i.cle} indicateur={i} valeur={pays.valeurs[i.cle]} bornes={bornes[i.cle]} groupes={groupes} />
                ))}
              </div>
            </details>
          )}
        </section>

        <section>
          <div className="titre-avec-geste">
            <h2>Et si ses chiffres changeaient ?</h2>
            {Object.keys(modifiees).length > 0 && (
              <Bouton variante="discret" icone={RotateCcw} onClick={() => modifier({})}>
                Rétablir
              </Bouton>
            )}
          </div>
          <div className="curseurs">
            {duModele.map((i) => (
              <CurseurIndicateur key={i.cle} indicateur={i} valeur={valeur(i.cle)} origine={pays.valeurs[i.cle]} bornes={bornes[i.cle]} onChange={(v) => modifier((m) => {
                const suite = { ...m, [i.cle]: v };
                if (v === pays.valeurs[i.cle]) delete suite[i.cle];
                return suite;
              })} />
            ))}
          </div>
        </section>
      </div>

      {fiche.leviers && <Leviers fiche={fiche} pays={pays} parCle={parCle} onEssayer={(valeurs) => modifier(valeurs)} />}

      <section>
        <h2>Les pays qui lui ressemblent</h2>
        <ul className="semblables">
          {semblables.map((p) => (
            <li key={p.id}>
              <Link to={`/pays/${p.id}`}>
                <b>{p.nom}</b>
                <small>{p.region}</small>
                <Pastille priorite={p.priorite} k={k} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function situer(profondeur: number, priorite: number, voisin: number): string {
  if (profondeur < 0.3) return `Tout près de la frontière avec la priorité ${voisin}`;
  if (profondeur < 0.8) return `Entre la frontière de la priorité ${voisin} et le centre de son groupe`;
  return `Au cœur de la priorité ${priorite}`;
}

function CurseurIndicateur({ indicateur, valeur, origine, bornes, onChange }: { indicateur: Indicateur; valeur: number; origine: number; bornes: [number, number]; onChange: (v: number) => void }) {
  const pas = indicateur.decimales === 0 ? 10 : 10 ** -indicateur.decimales;
  const min = Math.min(Math.floor(bornes[0] / pas) * pas, origine);
  const max = Math.max(Math.ceil(bornes[1] / pas) * pas, origine);
  return (
    <Curseur
      libelle={indicateur.libelle}
      aide={indicateur.definition}
      valeur={valeur}
      min={min}
      max={max}
      pas={pas}
      repere={origine}
      saisie
      decimales={indicateur.decimales}
      unite={indicateur.unite === "enfants" ? undefined : indicateur.unite.replace(" du PIB", "")}
      onChange={(v) => onChange(v === origine ? v : Number(v.toFixed(indicateur.decimales)))}
    />
  );
}

function Leviers({ fiche, pays, parCle, onEssayer }: { fiche: Fiche; pays: Pays; parCle: Map<Cle, Indicateur>; onEssayer: (v: Partial<Record<Cle, number>>) => void }) {
  const { vers, seuls, ensemble } = fiche.leviers!;
  const essayer = (valeurs: Partial<Record<Cle, number>>) => {
    onEssayer(arrondir(valeurs, parCle, pays));
    document.getElementById("contenu")?.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <section>
      <h2>Ce qui le ferait passer en priorité {vers}</h2>
      <div className="leviers">
        {ensemble && (
          <div className="levier-ensemble">
            <p className="levier-ensemble__part">{pourcent(ensemble.part)}</p>
            <p>
              de son retard sur la moyenne de la priorité {vers}, rattrapé sur tous ses indicateurs à la fois. Soit {pluriel(ensemble.annees, "année")} au rythme retenu.
            </p>
            <Bouton onClick={() => essayer(ensemble.valeurs)}>Essayer</Bouton>
          </div>
        )}
        <table className="tableau leviers__seuls">
          <thead>
            <tr>
              <th scope="col">Un seul indicateur</th>
              <th scope="col" className="nombre">
                Valeur
              </th>
              <th scope="col" className="nombre">
                Il faudrait
              </th>
              <th scope="col">
                <span className="hors-ecran">Geste</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {seuls.map((s) => {
              const i = parCle.get(s.indicateur)!;
              return (
                <tr key={s.indicateur} className={s.atteignable ? "" : "est-hors-portee"}>
                  <th scope="row">{i.libelle}</th>
                  <td className="nombre">{valeurIndicateur(i, pays.valeurs[s.indicateur])}</td>
                  <td className="nombre" data-bulle={s.atteignable ? undefined : "Même la meilleure valeur observée dans le monde ne suffirait pas"}>
                    {s.atteignable ? <b>{valeurIndicateur(i, s.requis!)}</b> : "Ne suffit pas"}
                  </td>
                  <td>
                    {s.atteignable && (
                      <Bouton variante="discret" onClick={() => essayer({ [s.indicateur]: s.requis! })}>
                        Essayer
                      </Bouton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Arrondit du côté qui franchit la frontière. */
function arrondir(valeurs: Partial<Record<Cle, number>>, parCle: Map<Cle, Indicateur>, pays: Pays): Partial<Record<Cle, number>> {
  return Object.fromEntries(
    Object.entries(valeurs).map(([c, v]) => {
      const { decimales } = parCle.get(c as Cle)!;
      const pas = 10 ** decimales;
      const cran = v! > pays.valeurs[c as Cle] ? Math.ceil(v! * pas + 1e-9) : Math.floor(v! * pas - 1e-9);
      return [c, cran / pas];
    }),
  );
}
