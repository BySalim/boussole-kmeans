import { ArrowDown, ArrowUp, Download, Pencil, RotateCcw, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Attente, Bouton, BoutonIcone, Confirmation, Echec, Feuille, SaisieNombre } from "../../composants/base";
import { annoncer, signaler } from "../../composants/Global";
import { envoyerFichier, telecharger } from "../../lib/api";
import { corriger, importer, retablir } from "../../lib/espace";
import { useTitre } from "../../lib/crochets";
import { contient, nombre, parNom, pluriel } from "../../lib/format";
import { useDonnees, useReferentiel } from "../../lib/requetes";
import type { Cle, Contexte, DonneesAdmin, Indicateur } from "../../lib/types";

type Ligne = DonneesAdmin["pays"][number];
const PAR_PAGE = 20;

export function Donnees() {
  useTitre("Données");
  const { data, error, refetch } = useDonnees();
  const { data: referentiel } = useReferentiel();
  const [texte, chercher] = useState("");
  const [tri, trier] = useState<{ cle: Cle | "nom"; sens: 1 | -1 }>({ cle: "nom", sens: 1 });
  const [page, tourner] = useState(0);
  const [edition, editer] = useState<Ligne | null>(null);
  const [retablissement, demander] = useState(false);
  const [occupe, occuper] = useState("");
  const fichier = useRef<HTMLInputElement>(null);

  const lignes = useMemo(() => {
    const retenues = (data?.pays ?? []).filter((p) => !texte.trim() || contient(p.nom, texte) || contient(p.region, texte));
    return retenues.sort((a, b) => (tri.cle === "nom" ? parNom(a, b) : a.valeurs[tri.cle] - b.valeurs[tri.cle]) * tri.sens);
  }, [data, texte, tri]);
  useEffect(() => tourner(0), [texte, tri]);

  if (error) return <Echec erreur={error} reessayer={refetch} />;
  if (!data || !referentiel) return <Attente />;
  const pages = Math.max(1, Math.ceil(lignes.length / PAR_PAGE));
  const visibles = lignes.slice(page * PAR_PAGE, (page + 1) * PAR_PAGE);

  const agir = async (nom: string, action: () => Promise<string>) => {
    occuper(nom);
    try {
      const message = await action();
      annoncer(message);
      demander(false);
    } catch (e) {
      signaler(e);
    }
    occuper("");
  };
  const Entete = ({ cle, children, aide }: { cle: Cle | "nom"; children: string; aide?: string }) => (
    <th scope="col" className={cle === "nom" ? "" : "nombre"} aria-sort={tri.cle === cle ? (tri.sens > 0 ? "ascending" : "descending") : "none"}>
      <button type="button" data-bulle={aide} onClick={() => trier((t) => ({ cle, sens: t.cle === cle ? (t.sens === 1 ? -1 : 1) : cle === "nom" ? 1 : -1 }))}>
        {children}
        {tri.cle === cle && (tri.sens > 0 ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />)}
      </button>
    </th>
  );

  return (
    <div className="page">
      <header className="plan__tete">
        <div>
          <h1>Données</h1>
          <p className="page__contexte">
            {pluriel(data.pays.length, "pays", "pays")}
            {data.modifies > 0 && `, dont ${pluriel(data.modifies, "modifié")}`}
            {data.remplacees && ", fichier importé"}
          </p>
        </div>
        <div className="plan__gestes">
          {(data.modifies > 0 || data.remplacees) && (
            <Bouton icone={RotateCcw} onClick={() => demander(true)}>
              Rétablir
            </Bouton>
          )}
          <Bouton icone={Download} onClick={() => telecharger("/simulation/donnees/export", "Country-data.csv").then(() => annoncer("Données exportées."), signaler)}>
            Exporter
          </Bouton>
          <Bouton icone={Upload} occupe={occupe === "import"} onClick={() => fichier.current?.click()}>
            Importer un CSV
          </Bouton>
          <input
            ref={fichier}
            type="file"
            accept=".csv,text/csv"
            className="hors-ecran"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const choisi = e.target.files?.[0];
              e.target.value = "";
              if (choisi)
                agir("import", async () => {
                  const lues = await envoyerFichier<Contexte["donnees"]>("/simulation/donnees/lire", choisi);
                  importer(lues);
                  return `${pluriel(Object.keys(lues).length, "pays importé", "pays importés")}.`;
                });
            }}
          />
        </div>
      </header>

      <div className="filtre">
        <Search size={17} aria-hidden />
        <input className="champ__saisie" placeholder="Pays ou région" aria-label="Filtrer les pays" value={texte} onChange={(e) => chercher(e.target.value)} />
      </div>

      {visibles.length ? (
        <div className="tableau-cadre" tabIndex={0} role="region" aria-label="Données des pays">
          <table className="tableau tableau--donnees">
            <thead>
              <tr>
                <Entete cle="nom">Pays</Entete>
                {referentiel.indicateurs.map((i) => (
                  <Entete key={i.cle} cle={i.cle} aide={i.definition}>
                    {i.court}
                  </Entete>
                ))}
                <th scope="col">
                  <span className="hors-ecran">Gestes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id} className={p.modifie ? "est-modifie" : ""}>
                  <th scope="row">
                    {p.nom}
                    <small>
                      {p.region}
                      {p.modifie && " · modifié"}
                    </small>
                  </th>
                  {referentiel.indicateurs.map((i) => (
                    <td key={i.cle} className="nombre">
                      {nombre(p.valeurs[i.cle], i.decimales)}
                    </td>
                  ))}
                  <td>
                    <BoutonIcone icone={Pencil} taille={16} libelle={`Modifier ${p.nom}`} onClick={() => editer(p)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="note">Aucun pays ne correspond à « {texte} ».</p>
      )}
      {pages > 1 && (
        <nav className="pagination" aria-label="Pages">
          <Bouton disabled={page === 0} onClick={() => tourner(page - 1)}>
            Précédente
          </Bouton>
          <span>
            Page {page + 1} sur {pages}
          </span>
          <Bouton disabled={page >= pages - 1} onClick={() => tourner(page + 1)}>
            Suivante
          </Bouton>
        </nav>
      )}

      {edition && <Edition ligne={edition} indicateurs={referentiel.indicateurs} onFermer={() => editer(null)} onEnregistrer={(valeurs) => agir("edition", async () => (corriger(edition.id, valeurs, referentiel.pays.find((p) => p.id === edition.id)!.valeurs), editer(null), `${edition.nom} mis à jour.`))} occupe={occupe === "edition"} />}
      <Confirmation titre="Rétablir les données d’origine ?" texte="Toutes vos modifications et le fichier importé seront effacés." action="Rétablir les données" ouverte={retablissement} onFermer={() => demander(false)} occupe={occupe === "retablir"} onConfirmer={() => agir("retablir", async () => (retablir(), `${pluriel(referentiel.pays.length, "pays rétabli", "pays rétablis")}.`))} />
    </div>
  );
}

const LIMITES: Partial<Record<Cle, [number, number]>> = { mortalite: [0, 1000], esperance: [0, 120], fecondite: [0, 15], sante: [0, 100], inflation: [-100, 10_000], exportations: [0, 1000], importations: [0, 1000] };

function Edition({ ligne, indicateurs, onFermer, onEnregistrer, occupe }: { ligne: Ligne; indicateurs: Indicateur[]; onFermer: () => void; onEnregistrer: (v: Partial<Record<Cle, number>>) => void; occupe: boolean }) {
  const [valeurs, changer] = useState(ligne.valeurs);
  const modifiees = Object.fromEntries(indicateurs.filter((i) => valeurs[i.cle] !== ligne.valeurs[i.cle]).map((i) => [i.cle, valeurs[i.cle]]));
  return (
    <Feuille
      titre={ligne.nom}
      ouverte
      onFermer={onFermer}
      actions={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" occupe={occupe} disabled={!Object.keys(modifiees).length} onClick={() => onEnregistrer(modifiees)}>
            Enregistrer
          </Bouton>
        </>
      }
    >
      <div className="edition">
        {indicateurs.map((i) => {
          const [min, max] = LIMITES[i.cle] ?? [0, 1_000_000];
          return (
            <label key={i.cle}>
              <span>
                {i.libelle}
                <small>{i.unite}</small>
              </span>
              <SaisieNombre libelle={i.libelle} valeur={valeurs[i.cle]} min={min} max={max} decimales={Math.max(i.decimales, (String(ligne.valeurs[i.cle]).split(".")[1] ?? "").length)} onChange={(v) => changer((a) => ({ ...a, [i.cle]: v }))} />
            </label>
          );
        })}
      </div>
    </Feuille>
  );
}
