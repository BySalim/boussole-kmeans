import { ChartNoAxesCombined, Database, FlaskConical, Layers, Sparkles, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Attente, Echec } from "../../composants/base";
import { useReferentiel } from "../../lib/requetes";
import { Fournisseur } from "./contexte";

const LIENS = [
  { vers: "/simulation", libelle: "Laboratoire", icone: FlaskConical },
  { vers: "/simulation/groupes", libelle: "Nombre de groupes", icone: ChartNoAxesCombined },
  { vers: "/simulation/recherche", libelle: "Meilleurs réglages", icone: Sparkles },
  { vers: "/simulation/modeles", libelle: "Modèles", icone: Layers },
  { vers: "/simulation/donnees", libelle: "Données", icone: Database },
  { vers: "/simulation/hypotheses", libelle: "Hypothèses", icone: SlidersHorizontal },
];

export function CadreSimulation() {
  const { data, error, refetch } = useReferentiel();
  const liens = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    liens.current?.querySelector(".active")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, data]);
  if (error) return <Echec erreur={error} reessayer={refetch} />;
  if (!data) return <Attente />;

  return (
    <Fournisseur>
      <div className="simulation">
        <nav className="simulation__liens" aria-label="Simulation" ref={liens}>
          {LIENS.map(({ vers, libelle, icone: Icone }) => (
            <NavLink key={vers} to={vers} end>
              <Icone size={17} aria-hidden />
              <span>{libelle}</span>
            </NavLink>
          ))}
        </nav>
        <div className="simulation__contenu">
          <Outlet />
        </div>
      </div>
    </Fournisseur>
  );
}
