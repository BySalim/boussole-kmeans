import { FlaskConical, FolderOpen, HandCoins, Map as IconeCarte, Moon, Search, Sun } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../lib/crochets";
import { contient, parNom } from "../lib/format";
import { useSituation } from "../lib/requetes";
import { BoutonIcone, Feuille, Pastille } from "./base";

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
      <circle cx="16" cy="16" r="15" fill="var(--encre)" />
      <path d="M24.4 7.6 18.7 18.7 13.3 13.3Z" fill="var(--groupe-1)" />
      <path d="M7.6 24.4 13.3 13.3 18.7 18.7Z" fill="var(--fond)" />
    </svg>
  );
}

const LIENS = [
  { vers: "/", libelle: "Carte", icone: IconeCarte },
  { vers: "/plan", libelle: "Plan d’aide", icone: HandCoins },
  { vers: "/plans", libelle: "Mes plans", icone: FolderOpen },
  { vers: "/simulation", libelle: "Simulation", icone: FlaskConical },
];

export function Cadre() {
  const { sombre, basculer } = useTheme();
  const [recherche, ouvrirRecherche] = useState(false);
  const { pathname } = useLocation();
  const contenu = useRef<HTMLElement>(null);

  useEffect(() => {
    const raccourci = (e: KeyboardEvent) => {
      const saisie = (e.target as HTMLElement).closest("input, textarea, [role=combobox]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !saisie)) {
        e.preventDefault();
        ouvrirRecherche(true);
      }
    };
    addEventListener("keydown", raccourci);
    return () => removeEventListener("keydown", raccourci);
  }, []);

  const lieu = pathname.startsWith("/simulation") ? "simulation" : pathname.split("/")[1] || "carte";
  useEffect(() => {
    contenu.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="cadre" data-lieu={lieu}>
      <a className="evitement" href="#contenu">
        Aller au contenu
      </a>
      <header className="barre">
        <Link to="/" className="barre__marque" aria-label="Boussole, accueil">
          <Logo />
          <span>Boussole</span>
        </Link>
        <nav className="barre__liens" aria-label="Navigation principale">
          {LIENS.map(({ vers, libelle, icone: Icone }) => (
            <NavLink key={vers} to={vers} end={vers !== "/simulation"}>
              <Icone size={18} aria-hidden />
              <span>{libelle}</span>
            </NavLink>
          ))}
        </nav>
        <div className="barre__gestes">
          <button type="button" className="barre__recherche" onClick={() => ouvrirRecherche(true)}>
            <Search size={17} aria-hidden />
            <span>Chercher un pays</span>
          </button>
          <BoutonIcone icone={sombre ? Sun : Moon} libelle={sombre ? "Passer en clair" : "Passer en sombre"} onClick={basculer} />
        </div>
      </header>
      <main id="contenu" className="contenu" ref={contenu} tabIndex={-1}>
        <Outlet />
      </main>
      <Recherche ouverte={recherche} onFermer={() => ouvrirRecherche(false)} />
    </div>
  );
}

function Recherche({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const { data } = useSituation();
  const [texte, ecrire] = useState("");
  const [actif, activer] = useState(0);
  const naviguer = useNavigate();
  const liste = useRef<HTMLUListElement>(null);

  const resultats = useMemo(() => {
    const tous = [...(data?.pays ?? [])];
    if (!texte.trim()) return tous.sort((a, b) => a.priorite - b.priorite || b.valeurs.mortalite - a.valeurs.mortalite).slice(0, 6);
    const debut = (nom: string) => (contient(nom.slice(0, texte.trim().length), texte) ? 0 : 1);
    return tous
      .filter((p) => contient(p.nom, texte) || contient(p.region, texte))
      .sort((a, b) => debut(a.nom) - debut(b.nom) || parNom(a, b))
      .slice(0, 8);
  }, [data, texte]);

  useEffect(() => activer(0), [texte]);
  useEffect(() => {
    if (ouverte) ecrire("");
  }, [ouverte]);
  useEffect(() => {
    liste.current?.children[actif]?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  const aller = (id: string) => {
    onFermer();
    naviguer(`/pays/${id}`);
  };

  return (
    <Feuille titre="Chercher un pays" ouverte={ouverte} onFermer={onFermer}>
      <div className="recherche">
        <input
          data-depart
          className="champ__saisie"
          placeholder="Sénégal, Haïti, Océanie…"
          value={texte}
          role="combobox"
          aria-expanded
          aria-controls="recherche-liste"
          aria-activedescendant={resultats[actif] ? `recherche-${resultats[actif].id}` : undefined}
          aria-label="Nom du pays"
          onChange={(e) => ecrire(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              activer((a) => Math.max(0, Math.min(resultats.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
            }
            if (e.key === "Enter" && resultats[actif]) aller(resultats[actif].id);
          }}
        />
        {resultats.length ? (
          <ul id="recherche-liste" role="listbox" ref={liste} aria-label="Pays trouvés">
            {resultats.map((p, i) => (
              <li key={p.id} id={`recherche-${p.id}`} role="option" aria-selected={i === actif} className={i === actif ? "est-actif" : ""} onPointerEnter={() => activer(i)} onClick={() => aller(p.id)}>
                <span>
                  <b>{p.nom}</b>
                  <small>{p.region}</small>
                </span>
                <Pastille priorite={p.priorite} k={data!.groupes.length} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="recherche__vide">Aucun pays ne porte ce nom dans les données.</p>
        )}
      </div>
    </Feuille>
  );
}
