import { geoNaturalEarth1, geoPath } from "d3-geo";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { Maximize, Minus, Plus } from "lucide-react";
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMedia, useTaille } from "../lib/crochets";
import { type FormePays, useMonde } from "../lib/monde";
import { Attente, BoutonIcone, Echec } from "./base";

export interface PaysCarte {
  id: string;
  numero: string;
  nom: string;
  couleur: string;
  estompe?: boolean;
}

interface Proprietes {
  pays: PaysCarte[];
  libelle: string;
  selection?: string | null;
  marques?: ReadonlySet<string>;
  onChoisir?: (id: string) => void;
  infobulle?: (id: string) => ReactNode;
  viser?: string | null;
  commandes?: boolean;
  marge?: { haut?: number; droite?: number; bas?: number; gauche?: number };
}


export function Carte(props: Proprietes) {
  const { data: monde, error, refetch } = useMonde();
  const [cadre, { largeur, hauteur }] = useTaille<HTMLDivElement>();
  return (
    <div className="carte" ref={cadre}>
      {error ? (
        <Echec erreur={error} reessayer={refetch} />
      ) : monde && largeur > 0 && hauteur > 0 ? (
        <Dessin {...props} monde={monde} largeur={largeur} hauteur={hauteur} />
      ) : (
        <Attente libelle="Chargement de la carte…" />
      )}
    </div>
  );
}

function Dessin({ monde, largeur, hauteur, pays, libelle, selection, marques, onChoisir, infobulle, viser, commandes = true, marge }: Proprietes & { monde: FormePays[]; largeur: number; hauteur: number }) {
  const svg = useRef<SVGSVGElement>(null);
  const comportement = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [vue, deplacer] = useState(zoomIdentity);
  const [survol, survoler] = useState<{ id: string | null; nom: string; x: number; y: number } | null>(null);
  const reduit = useMedia("(prefers-reduced-motion: reduce)");

  const { haut = 12, droite = 12, bas = 12, gauche = 12 } = marge ?? {};
  const { contours, sphere, centres, boites, rayon } = useMemo(() => {
    const projection = geoNaturalEarth1().rotate([-11, 0]);
    const zone: [[number, number], [number, number]] = [
      [gauche, haut],
      [Math.max(gauche + 40, largeur - droite), Math.max(haut + 40, hauteur - bas)],
    ];
    projection.fitExtent(zone, { type: "FeatureCollection", features: monde.map((m) => m.forme) });
    const chemin = geoPath(projection);
    const petite = Math.min(1, (largeur - gauche - droite) / 900);
    const seuil = 16 * petite ** 2;
    const contours = monde.map((m) => ({ numero: m.numero, nom: m.nom, d: chemin(m.forme) ?? "", petit: chemin.area(m.forme) < seuil, centre: projection(m.centre) ?? [0, 0] }));
    return {
      rayon: Math.max(1.5, 3.4 * Math.sqrt(petite)),
      contours,
      sphere: chemin({ type: "Sphere" }) ?? "",
      centres: new Map(contours.map((c) => [c.numero, c.centre as [number, number]])),
      boites: new Map(monde.map((m) => [m.numero, chemin.bounds(m.forme)])),
    };
  }, [monde, largeur, hauteur, haut, droite, bas, gauche]);

  const parNumero = useMemo(() => new Map(pays.map((p) => [p.numero, p])), [pays]);
  const parId = useMemo(() => new Map(pays.map((p) => [p.id, p])), [pays]);

  useEffect(() => {
    if (!svg.current) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 9])
      .extent([[0, 0], [largeur, hauteur]])
      .translateExtent([[-largeur * 0.15, -hauteur * 0.15], [largeur * 1.15, hauteur * 1.15]])
      .filter((e: Event) => !(e as MouseEvent).button && !(e.type === "wheel" && (e as WheelEvent).shiftKey))
      .on("start", () => survoler(null))
      .on("zoom", (e) => deplacer(e.transform));
    comportement.current = z;
    const s = select(svg.current);
    s.call(z).on("dblclick.zoom", null);
    return () => {
      s.on(".zoom", null);
    };
  }, [largeur, hauteur]);

  const animer = useCallback(() => {
    const s = select(svg.current!);
    return reduit ? s : s.transition().duration(380);
  }, [reduit]);

  const grossir = (facteur: number) => {
    if (comportement.current) comportement.current.scaleBy(animer() as never, facteur);
  };
  const recadrer = useCallback(() => {
    if (comportement.current) comportement.current.transform(animer() as never, zoomIdentity);
  }, [animer]);

  const numeroVise = viser ? parId.get(viser)?.numero : undefined;
  useEffect(() => {
    if (!comportement.current || !numeroVise) return;
    const boite = boites.get(numeroVise);
    const centre = centres.get(numeroVise);
    if (!boite || !centre) return;
    const [[x0, y0], [x1, y1]] = boite;
    const taille = Math.max(x1 - x0, y1 - y0, 14);
    const echelle = Math.max(1.6, Math.min(5, (Math.min(largeur, hauteur) * 0.32) / taille));
    const cible = zoomIdentity
      .translate((gauche + largeur - droite) / 2, (haut + hauteur - bas) / 2)
      .scale(echelle)
      .translate(-centre[0], -centre[1]);
    comportement.current.transform(animer() as never, cible);
  }, [numeroVise, boites, centres, largeur, hauteur, gauche, droite, haut, bas, animer]);

  const pointer = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const numero = (e.target as Element).getAttribute("data-numero");
    if (!numero) return survoler(null);
    const r = svg.current!.getBoundingClientRect();
    const connu = parNumero.get(numero);
    const nom = connu?.nom ?? contours.find((c) => c.numero === numero)?.nom ?? "";
    survoler({ id: connu?.id ?? null, nom, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const cliquer = (e: React.MouseEvent) => {
    const numero = (e.target as Element).getAttribute("data-numero");
    const connu = numero && parNumero.get(numero);
    if (connu) onChoisir?.(connu.id);
  };

  const numeroChoisi = selection ? parId.get(selection)?.numero : undefined;
  const reperes = useMemo(
    () => [...(marques ?? [])].flatMap((id) => {
      const p = parId.get(id);
      const c = p && centres.get(p.numero);
      return c ? [{ id, c }] : [];
    }),
    [marques, parId, centres],
  );

  return (
    <>
      <svg
        ref={svg}
        className={`carte__svg ${onChoisir ? "est-cliquable" : ""}`}
        width={largeur}
        height={hauteur}
        role="img"
        aria-label={libelle}
        onPointerMove={pointer}
        onPointerLeave={() => survoler(null)}
        onClick={cliquer}
      >
        <g transform={vue.toString()}>
          <path d={sphere} className="carte__mer" />
          <Contours contours={contours} parNumero={parNumero} zoom={vue.k} rayon={rayon} />
          {numeroChoisi && <path d={contours.find((c) => c.numero === numeroChoisi)?.d} className="carte__choisi" />}
          {numeroChoisi && contours.find((c) => c.numero === numeroChoisi)?.petit && (
            <circle className="carte__choisi" cx={centres.get(numeroChoisi)![0]} cy={centres.get(numeroChoisi)![1]} r={7 / vue.k} />
          )}
          {reperes.map(({ id, c }) => (
            <circle key={id} className="carte__jeton" cx={c[0]} cy={c[1]} r={4.6 / Math.sqrt(vue.k)} style={{ strokeWidth: 2 / Math.sqrt(vue.k) }} />
          ))}
        </g>
      </svg>
      {commandes && (
        <div className="carte__commandes">
          <BoutonIcone icone={Plus} libelle="Agrandir" onClick={() => grossir(1.7)} />
          <BoutonIcone icone={Minus} libelle="Réduire" onClick={() => grossir(1 / 1.7)} />
          <BoutonIcone icone={Maximize} libelle="Voir le monde entier" onClick={recadrer} disabled={vue.k === 1 && vue.x === 0 && vue.y === 0} />
        </div>
      )}
      {survol && (
        <div
          className="carte__infobulle"
          style={{ left: Math.min(Math.max(survol.x, 110), largeur - 110), top: survol.y, transform: `translate(-50%, ${survol.y < 120 ? "18px" : "calc(-100% - 14px)"})` }}
        >
          <strong>{survol.nom}</strong>
          {survol.id ? infobulle?.(survol.id) : <span>Absent des données</span>}
        </div>
      )}
    </>
  );
}

const Contours = memo(function Contours({ contours, parNumero, zoom: k, rayon }: { contours: { numero: string; d: string; petit: boolean; centre: number[] }[]; parNumero: Map<string, PaysCarte>; zoom: number; rayon: number }) {
  const pas = Math.sqrt(k);
  return (
    <g>
      {contours.map((c) => {
        const p = parNumero.get(c.numero);
        return (
          <path
            key={c.numero}
            d={c.d}
            data-numero={c.numero}
            className={`carte__pays ${p ? "" : "carte__pays--absent"} ${p?.estompe ? "est-estompe" : ""}`}
            style={p ? { fill: p.couleur } : undefined}
          />
        );
      })}
      {contours.map((c) => {
        const p = c.petit && parNumero.get(c.numero);
        return p ? (
          <circle
            key={c.numero}
            data-numero={c.numero}
            cx={c.centre[0]}
            cy={c.centre[1]}
            r={rayon / pas}
            className={`carte__pays carte__pays--point ${p.estompe ? "est-estompe" : ""}`}
            style={{ fill: p.couleur }}
          />
        ) : null;
      })}
    </g>
  );
});
