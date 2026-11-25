import { extent } from "d3-array";
import { scaleLinear } from "d3-scale";
import { type CSSProperties, useMemo, useState } from "react";
import { couleur } from "../lib/couleurs";
import { useAnimation, useTaille } from "../lib/crochets";
import { abrege, minuscule, pourcent } from "../lib/format";
import type { AxeRepere, Indicateur, Repere } from "../lib/types";

type Point = [number, number];

/** Région d'un centre : le rectangle visible, coupé par la frontière avec chaque autre centre. */
function region(centres: [number, number, number][], j: number, boite: [number, number, number, number]): Point[] {
  const [x0, y0, x1, y1] = boite;
  let polygone: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const [cx, cy, co] = centres[j]!;
  for (let i = 0; i < centres.length && polygone.length; i++) {
    if (i === j) continue;
    const [dx, dy, dz] = centres[i]!;
    const a = 2 * (dx - cx);
    const b = 2 * (dy - cy);
    const limite = dx * dx + dy * dy + dz - (cx * cx + cy * cy + co);
    const cote = (p: Point) => a * p[0] + b * p[1] - limite;
    const coupe: Point[] = [];
    for (let n = 0; n < polygone.length; n++) {
      const p = polygone[n]!;
      const q = polygone[(n + 1) % polygone.length]!;
      const fp = cote(p);
      const fq = cote(q);
      if (fp <= 0) coupe.push(p);
      if (fp <= 0 !== fq <= 0) {
        const t = fp / (fp - fq);
        coupe.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    polygone = coupe;
  }
  return polygone;
}

/** Seules les arêtes intérieures sont des frontières : celles du cadre n'en sont pas. */
const interieures = (points: Point[], [x0, y0, x1, y1]: [number, number, number, number]) =>
  points.flatMap((p, n) => {
    const q = points[(n + 1) % points.length]!;
    const proche = (a: number, b: number, l: number) => Math.abs(a - l) < 0.6 && Math.abs(b - l) < 0.6;
    const bord = proche(p[0], q[0], x0) || proche(p[0], q[0], x1) || proche(p[1], q[1], y0) || proche(p[1], q[1], y1);
    const bouts = [p, q].map((s) => s.map((v) => v.toFixed(1)).join(",")).sort();
    return bord ? [] : [`M${bouts.join("L")}`];
  });

const tracer = (points: Point[]) => (points.length ? `M${points.map((p) => p.map((v) => v.toFixed(2)).join(",")).join("L")}Z` : "");

interface Proprietes {
  repere: Repere;
  etape: number;
  k: number;
  pays: { id: string; nom: string }[];
  indicateurs: Map<string, Indicateur>;
  selection?: string | null;
  onChoisir?: (id: string) => void;
}

export function RepereKMeans({ repere, etape, k, pays, indicateurs, selection, onChoisir }: Proprietes) {
  const [cadre, { largeur, hauteur }] = useTaille<HTMLDivElement>();
  const [survol, survoler] = useState<number | null>(null);
  const courante = repere.etapes[Math.min(etape, repere.etapes.length - 1)]!;
  const precedente = repere.etapes[Math.max(0, Math.min(etape, repere.etapes.length - 1) - 1)]!;
  const cle = useMemo(() => ({}), [repere, etape]);
  const t = useAnimation(cle);

  const centres = courante.centres.map((c, j) => {
    const depart = precedente.centres[j] ?? c;
    return c.map((v, n) => depart[n]! + (v - depart[n]!) * t) as [number, number, number];
  });

  const marge = { haut: 14, droite: 14, bas: 44, gauche: 54 };
  const { x, y } = useMemo(() => {
    const tous = [...repere.points, ...repere.etapes.flatMap((e) => e.centres.map((c) => [c[0], c[1]] as Point))];
    const etendre = ([a = 0, b = 1]: [number | undefined, number | undefined]): [number, number] => [a - (b - a) * 0.05 || a - 1, b + (b - a) * 0.05 || b + 1];
    return {
      x: scaleLinear().domain(etendre(extent(tous, (p) => p[0]) as never)).range([marge.gauche, Math.max(marge.gauche + 20, largeur - marge.droite)]),
      y: scaleLinear().domain(etendre(extent(tous, (p) => p[1]) as never)).range([Math.max(marge.haut + 20, hauteur - marge.bas), marge.haut]),
    };
  }, [repere, largeur, hauteur]);

  const boite = [x.domain()[0]!, y.domain()[0]!, x.domain()[1]!, y.domain()[1]!] as [number, number, number, number];
  const regions = repere.frontieres === "aucune" ? [] : centres.map((_, j) => region(centres, j, boite).map(([a, b]): Point => [x(a), y(b)]));
  const frontieres = [...new Set(regions.flatMap((r) => interieures(r, [x.range()[0]!, y.range()[1]!, x.range()[1]!, y.range()[0]!])))];
  const origine = (axe: AxeRepere) => {
    const echelle = axe === repere.axes[0] ? x : y;
    const inverse = scaleLinear().domain(echelle.domain().map((v) => axe.centre + axe.pas * v)).nice();
    return inverse.ticks(5).map((v) => ({ v, place: echelle((v - axe.centre) / axe.pas) })).filter((g) => g.place >= Math.min(...echelle.range()) - 1 && g.place <= Math.max(...echelle.range()) + 1);
  };
  const bouts = (axe: AxeRepere) => {
    if (!axe.poids) return null;
    const tries = Object.entries(axe.poids).sort((a, b) => a[1]! - b[1]!);
    const nommer = (n: typeof tries) => n.filter(([, p]) => Math.abs(p!) > 0.3).slice(0, 2).map(([c]) => minuscule(indicateurs.get(c)?.court ?? "")).filter(Boolean).join(", ");
    return { moins: nommer(tries.filter(([, p]) => p! < 0)), plus: nommer([...tries].reverse().filter(([, p]) => p! > 0)) };
  };
  const [axeX, axeY] = repere.axes;
  const boutsX = bouts(axeX);
  const titre = (axe: AxeRepere) => (axe.variance === undefined ? axe.libelle : `${axe.libelle} · ${pourcent(axe.variance)} de la variance`);
  const numeroSelection = selection ? pays.findIndex((p) => p.id === selection) : -1;

  return (
    <div className="repere" ref={cadre}>
      {largeur > 0 && hauteur > 0 && (
        <svg width={largeur} height={hauteur} role="img" aria-label={`Repère des ${repere.points.length} pays répartis en ${k} groupes`} onPointerLeave={() => survoler(null)}>
          {regions.map((r, j) => (
            <path key={j} d={tracer(r)} className="repere__region" style={{ "--teinte": couleur(j + 1, k) } as CSSProperties} />
          ))}
          {origine(axeX).map(({ v, place }) => (
            <g key={v}>
              <line className="grille" x1={place} x2={place} y1={marge.haut} y2={hauteur - marge.bas} />
              {axeX.variance === undefined && (
                <text className="axe" x={place} y={hauteur - marge.bas + 17} textAnchor="middle">
                  {abrege(v)}
                </text>
              )}
            </g>
          ))}
          {origine(axeY).map(({ v, place }) => (
            <g key={v}>
              <line className="grille" x1={marge.gauche} x2={largeur - marge.droite} y1={place} y2={place} />
              {axeY.variance === undefined && (
                <text className="axe" x={marge.gauche - 8} y={place} dy="0.32em" textAnchor="end">
                  {abrege(v)}
                </text>
              )}
            </g>
          ))}
          <path d={frontieres.join("")} className="repere__frontiere" />
          {repere.points.map(([a, b], n) => (
            <circle
              key={pays[n]?.id ?? n}
              className={`repere__pays ${onChoisir ? "est-cliquable" : ""} ${n === survol || n === numeroSelection ? "est-vise" : ""}`}
              cx={x(a)}
              cy={y(b)}
              r={n === survol || n === numeroSelection ? 6.5 : 4.2}
              style={{ fill: couleur(courante.priorites[n] ?? 1, k) }}
              onPointerEnter={() => survoler(n)}
              onClick={() => pays[n] && onChoisir?.(pays[n].id)}
            />
          ))}
          {centres.map((c, j) => (
            <g key={j} transform={`translate(${x(c[0])} ${y(c[1])})`} className="repere__centre">
              <circle r={11} style={{ fill: couleur(j + 1, k) }} />
              <path d="M-4.2 -4.2 4.2 4.2M4.2 -4.2 -4.2 4.2" />
            </g>
          ))}
          <text className="axe axe--titre" x={(marge.gauche + largeur - marge.droite) / 2} y={hauteur - 8} textAnchor="middle">
            {titre(axeX)}
          </text>
          <text className="axe axe--titre" transform={`translate(15 ${(marge.haut + hauteur - marge.bas) / 2}) rotate(-90)`} textAnchor="middle">
            {titre(axeY)}
          </text>
          {boutsX && largeur > 420 && (
            <>
              <text className="axe" x={marge.gauche} y={hauteur - marge.bas + 17}>
                {boutsX.moins && `← ${boutsX.moins}`}
              </text>
              <text className="axe" x={largeur - marge.droite} y={hauteur - marge.bas + 17} textAnchor="end">
                {boutsX.plus && `${boutsX.plus} →`}
              </text>
            </>
          )}
        </svg>
      )}
      {survol !== null && repere.points[survol] && (
        <div className="carte__infobulle" style={{ left: Math.min(Math.max(x(repere.points[survol][0]), 90), largeur - 90), top: y(repere.points[survol][1]), transform: `translate(-50%, ${y(repere.points[survol][1]) < 70 ? "14px" : "calc(-100% - 12px)"})` }}>
          <strong>{pays[survol]?.nom}</strong>
          <span>Priorité {courante.priorites[survol]}</span>
        </div>
      )}
    </div>
  );
}
