import { QueryClientProvider } from "@tanstack/react-query";
import { Compass } from "lucide-react";
import { Component, lazy, type ReactNode, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { Cadre } from "./composants/Cadre";
import { Attente, Bouton, Vide } from "./composants/base";
import { Bulles, Notifications } from "./composants/Global";
import { useTitre } from "./lib/crochets";
import { client } from "./lib/requetes";
import { PageCarte } from "./pages/PageCarte";
import "./styles/app.css";

const charger = <T extends Record<string, unknown>>(module: () => Promise<T>, nom: keyof T) =>
  lazy(async () => ({ default: (await module())[nom] as React.ComponentType }));

const PageFiche = charger(() => import("./pages/PageFiche"), "PageFiche");
const PagePlan = charger(() => import("./pages/PagePlan"), "PagePlan");
const PagePlans = charger(() => import("./pages/PagePlans"), "PagePlans");
const CadreSimulation = charger(() => import("./pages/simulation/Cadre"), "CadreSimulation");
const Laboratoire = charger(() => import("./pages/simulation/Laboratoire"), "Laboratoire");
const Groupes = charger(() => import("./pages/simulation/Groupes"), "Groupes");
const PageRecherche = charger(() => import("./pages/simulation/Recherche"), "PageRecherche");
const Modeles = charger(() => import("./pages/simulation/Modeles"), "Modeles");
const Donnees = charger(() => import("./pages/simulation/Donnees"), "Donnees");
const Hypotheses = charger(() => import("./pages/simulation/Hypotheses"), "Hypotheses");

function Introuvable() {
  useTitre("Page introuvable");
  return (
    <div className="page">
      <Vide icone={Compass} titre="Cette page n’existe pas.">
        <Link className="bouton bouton--principal" to="/">
          <span>Revenir à la carte</span>
        </Link>
      </Vide>
    </div>
  );
}

class Garde extends Component<{ children: ReactNode }, { tombee: boolean }> {
  state = { tombee: false };
  static getDerivedStateFromError() {
    return { tombee: true };
  }
  render() {
    if (!this.state.tombee) return this.props.children;
    return (
      <div className="page">
        <Vide icone={Compass} titre="Cet écran n’a pas pu s’afficher.">
          <Bouton variante="principal" onClick={() => location.assign("/")}>
            Revenir à la carte
          </Bouton>
        </Vide>
      </div>
    );
  }
}

const page = (element: ReactNode) => (
  <Garde>
    <Suspense fallback={<Attente />}>{element}</Suspense>
  </Garde>
);

const routeur = createBrowserRouter([
  {
    element: <Cadre />,
    children: [
      { index: true, element: page(<PageCarte />) },
      { path: "pays/:id", element: page(<PageFiche />) },
      { path: "plan", element: page(<PagePlan />) },
      { path: "plans", element: page(<PagePlans />) },
      {
        path: "simulation",
        element: page(<CadreSimulation />),
        children: [
          { index: true, element: page(<Laboratoire />) },
          { path: "groupes", element: page(<Groupes />) },
          { path: "recherche", element: page(<PageRecherche />) },
          { path: "modeles", element: page(<Modeles />) },
          { path: "donnees", element: page(<Donnees />) },
          { path: "hypotheses", element: page(<Hypotheses />) },
        ],
      },
      { path: "*", element: <Introuvable /> },
    ],
  },
]);

createRoot(document.getElementById("racine")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <RouterProvider router={routeur} />
      <Bulles />
      <Notifications />
    </QueryClientProvider>
  </StrictMode>,
);
