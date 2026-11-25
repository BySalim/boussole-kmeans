import { extent } from "d3-array";
import { scaleLinear, scaleLog } from "d3-scale";
import { line } from "d3-shape";
import { type CSSProperties, useId, useMemo, useState } from "react";
import { couleur, couleurTexte } from "../lib/couleurs";
import { useTaille } from "../lib/crochets";
import { valeurIndicateur } from "../lib/format";
import type { Groupe, Indicateur } from "../lib/types";

/* --- Courbe ----------------------------------------------------------------- */

export interface Serie {
  cle: string;
  libelle: string;
  valeurs: (number | null)[];
  couleur?: string;
  forte?: boolean;
}

interface ProprietesCourbe {
  series: Serie[];
  abscisses: number[];
  libelle: string;
  format?: (v: number) => string;
  formatX?: (v: number) => string;
  depuisZero?: boolean;
  hauteur?: number;
  repereX?: number;
  onChoisirX?: (x: number) => void;
  etiquettes?: boolean;
}

export function Courbe({ series, abscisses, libelle, format = String, formatX = String, depuisZero, hauteur = 220, repereX, onChoisirX, etiquettes }: ProprietesCourbe) {
  const [cadre, { largeur }] = useTaille<HTMLDivElement>();
  const [survol, survoler] = useState<number | null>(null);
  const droite = etiquettes ? 118 : 14;
  const marge = { haut: 14, droite, bas: 28, gauche: 46 };
  const toutes = series.flatMap((s) => s.valeurs.filter((v): v is number => v !== null));
  const [bas = 0, haut = 1] = extent(toutes);
  const etendue = haut - bas || Math.abs(haut) || 1;
  const x = scaleLinear()
    .domain([abscisses[0] ?? 0, abscisses.at(-1) ?? 1])
    .range([marge.gauche, Math.max(marge.gauche + 10, largeur - marge.droite)]);
  const y = scaleLinear()
    .domain(depuisZero ? [0, haut || 1] : [bas - etendue * 0.12, haut + etendue * 0.12])
    .range([hauteur - marge.bas, marge.haut])
    .nice(4);
  const tracer = line<number | null>()
    .defined((v) => v !== null)
    .x((_, i) => x(abscisses[i]!))
    .y((v) => y(v ?? 0));
  const pasX = Math.max(1, Math.ceil(abscisses.length / Math.max(2, Math.floor((largeur - marge.gauche - droite) / 44))));

  const fins = useMemo(() => {
    const places = series
      .map((s) => ({ s, y: y(s.valeurs.at(-1) ?? 0) }))
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < places.length; i++) places[i]!.y = Math.max(places[i]!.y, places[i - 1]!.y + 15);
    return places;
  }, [series, y]);

  const reperer = (e: React.PointerEvent<SVGSVGElement>) => {
    const { left } = e.currentTarget.getBoundingClientRect();
    const valeur = x.invert(e.clientX - left);
    let proche = 0;
    abscisses.forEach((a, i) => {
      if (Math.abs(a - valeur) < Math.abs(abscisses[proche]! - valeur)) proche = i;
    });
    survoler(proche);
  };
  const i = survol;

  return (
    <div className="courbe" ref={cadre} style={{ height: hauteur }}>
      {largeur > 0 && (
        <svg width={largeur} height={hauteur} role="img" aria-label={libelle} className={onChoisirX ? "est-cliquable" : ""} onPointerMove={reperer} onPointerLeave={() => survoler(null)} onClick={() => i !== null && onChoisirX?.(abscisses[i]!)}>
          {y.ticks(4).map((t) => (
            <g key={t}>
              <line className="grille" x1={marge.gauche} x2={largeur - marge.droite} y1={y(t)} y2={y(t)} />
              <text className="axe" x={marge.gauche - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {abscisses.map((a, n) =>
            n % pasX === 0 || n === abscisses.length - 1 ? (
              <text key={a} className="axe" x={x(a)} y={hauteur - 8} textAnchor="middle">
                {formatX(a)}
              </text>
            ) : null,
          )}
          {repereX !== undefined && <line className="repere-x" x1={x(repereX)} x2={x(repereX)} y1={marge.haut} y2={hauteur - marge.bas} />}
          {i !== null && <line className="viseur" x1={x(abscisses[i]!)} x2={x(abscisses[i]!)} y1={marge.haut} y2={hauteur - marge.bas} />}
          {[...series].sort((a, b) => Number(a.forte ?? false) - Number(b.forte ?? false)).map((s) => (
            <g key={s.cle} style={{ color: s.couleur ?? (s.forte ? "var(--encre)" : "var(--encre-4)") }}>
              <path className={`serie ${s.forte ? "serie--forte" : ""}`} d={tracer(s.valeurs) ?? ""} />
              {s.valeurs.map((v, n) =>
                v !== null && (n === i || (s.forte && abscisses.length <= 12)) ? <circle key={n} className="point" cx={x(abscisses[n]!)} cy={y(v)} r={n === i ? 4.5 : 3} /> : null,
              )}
            </g>
          ))}
          {etiquettes &&
            fins.map(({ s, y: position }) => (
              <text key={s.cle} className={`fin-serie ${s.forte ? "fin-serie--forte" : ""}`} x={largeur - droite + 10} y={position} dy="0.32em">
                {s.libelle}
              </text>
            ))}
        </svg>
      )}
      {i !== null && (
        <div className="courbe__lecture" style={{ left: x(abscisses[i]!), transform: `translateX(${x(abscisses[i]!) > largeur / 2 ? "calc(-100% - 12px)" : "12px"})` }}>
          <strong>{formatX(abscisses[i]!)}</strong>
          {[...series].sort((a, b) => (b.valeurs[i] ?? -Infinity) - (a.valeurs[i] ?? -Infinity)).map((s) => (
            <span key={s.cle} className={s.forte ? "forte" : ""}>
              <i style={{ background: s.couleur ?? (s.forte ? "var(--encre)" : "var(--encre-4)") }} />
              {series.length > 1 && <em>{s.libelle}</em>}
              <b>{s.valeurs[i] === null ? "–" : format(s.valeurs[i]!)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Bande d'indicateur : un pays face aux moyennes des groupes ----------------- */

const LOGARITHMIQUES = new Set(["revenu", "pib"]);

export function Bande({ indicateur, valeur, bornes, groupes, origine }: { indicateur: Indicateur; valeur: number; bornes: [number, number]; groupes: Groupe[]; origine?: number }) {
  const k = groupes.length;
  const echelle = LOGARITHMIQUES.has(indicateur.cle)
    ? scaleLog().domain([Math.max(1, bornes[0]), bornes[1]]).range([2, 98]).clamp(true)
    : scaleLinear().domain(bornes).range([2, 98]).clamp(true);
  const place = (v: number) => `${echelle(Math.max(v, LOGARITHMIQUES.has(indicateur.cle) ? 1 : -Infinity))}%`;
  return (
    <div className="bande">
      <div className="bande__texte">
        <span data-bulle={indicateur.definition}>{indicateur.libelle}</span>
        <b>{valeurIndicateur(indicateur, valeur)}</b>
      </div>
      <div className="bande__piste" aria-hidden>
        {groupes.map((g) => {
          const moyenne = g.moyennes[indicateur.cle];
          return moyenne === null ? null : (
            <i key={g.priorite} className="bande__groupe" style={{ left: place(moyenne), background: couleur(g.priorite, k) }} data-bulle={`Moyenne de la priorité ${g.priorite} : ${valeurIndicateur(indicateur, moyenne)}`} />
          );
        })}
        {origine !== undefined && origine !== valeur && <i className="bande__origine" style={{ left: place(origine) }} />}
        <i className="bande__pays" style={{ left: place(valeur) }} />
      </div>
    </div>
  );
}

export function LegendeBandes({ k, nom }: { k: number; nom: string }) {
  return (
    <ul className="legende-bandes">
      <li>
        <i className="legende-bandes__pays" aria-hidden /> {nom}
      </li>
      {Array.from({ length: k }, (_, i) => (
        <li key={i}>
          <i style={{ background: couleur(i + 1, k) }} aria-hidden /> {i === 0 ? "Moyenne de la priorité 1" : i + 1}
        </li>
      ))}
    </ul>
  );
}

/* --- Jauge de frontière ---------------------------------------------------------- */

export function JaugeFrontiere({ priorite, voisin, profondeur, k, depart, distances = true }: { priorite: number; voisin: number; profondeur: number; k: number; depart?: { priorite: number; profondeur: number }; distances?: boolean }) {
  const id = useId();
  const gauche = Math.min(priorite, voisin);
  const droite = Math.max(priorite, voisin);
  const placer = (p: number, prof: number) => {
    const ecart = Math.min(prof, 1.84) * 25;
    return `${p === gauche ? 50 - ecart : 50 + ecart}%`;
  };
  return (
    <figure className="jauge" aria-labelledby={id}>
      <figcaption id={id} className="hors-ecran">
        {profondeur < 0.3 ? "Tout près" : "À distance"} de la frontière entre la priorité {gauche} et la priorité {droite}
      </figcaption>
      <div className="jauge__piste" aria-hidden>
        <span className="jauge__zone" style={{ "--teinte": couleur(gauche, k) } as CSSProperties} />
        <span className="jauge__zone" style={{ "--teinte": couleur(droite, k) } as CSSProperties} />
        <i className="jauge__centre" style={{ left: "25%", "--teinte": couleur(gauche, k) } as CSSProperties} data-bulle={`Centre de la priorité ${gauche}`} />
        <i className="jauge__centre" style={{ left: "75%", "--teinte": couleur(droite, k) } as CSSProperties} data-bulle={`Centre de la priorité ${droite}`} />
        <i className="jauge__frontiere" />
        {depart && (depart.priorite === gauche || depart.priorite === droite) && <i className="jauge__depart" style={{ left: placer(depart.priorite, depart.profondeur) }} />}
        <i className="jauge__pays" style={{ left: placer(priorite, profondeur) }} />
      </div>
      {distances && (
        <div className="jauge__legende" aria-hidden>
          <span style={{ color: couleurTexte(gauche, k) }}>Priorité {gauche}</span>
          <span>Frontière</span>
          <span style={{ color: couleurTexte(droite, k) }}>Priorité {droite}</span>
        </div>
      )}
    </figure>
  );
}

export function MiniJauge({ profondeur, priorite, k }: { profondeur: number; priorite: number; k: number }) {
  const part = Math.min(1, profondeur / 1.6);
  return (
    <span className="mini-jauge" data-bulle={profondeur < 0.3 ? "Tout près de la frontière de son groupe" : profondeur < 0.8 ? "À mi-chemin entre la frontière et le centre de son groupe" : "Au cœur de son groupe"} style={{ "--teinte": couleur(priorite, k) } as CSSProperties}>
      <i style={{ right: `calc(${part * 100}% - 3px)` }} />
    </span>
  );
}

/* --- Répartition ------------------------------------------------------------------ */

export function Repartition({ groupes, actif, onChoisir }: { groupes: Groupe[]; actif?: number | null; onChoisir?: (p: number | null) => void }) {
  const k = groupes.length;
  return (
    <div className={`repartition ${k > 4 ? "repartition--serree" : ""}`} role={onChoisir ? "group" : undefined} aria-label="Répartition par priorité">
      {groupes.map((g) => {
        const style = { flexGrow: Math.max(g.effectif, 1), "--teinte": couleur(g.priorite, k) } as CSSProperties;
        const contenu = (
          <>
            <i aria-hidden />
            <b>{g.effectif}</b>
            <span>{k > 4 ? `P${g.priorite}` : `Priorité ${g.priorite}`}</span>
          </>
        );
        return onChoisir ? (
          <button key={g.priorite} type="button" style={style} className={actif === g.priorite ? "est-choisi" : actif ? "est-estompe" : ""} aria-pressed={actif === g.priorite} onClick={() => onChoisir(actif === g.priorite ? null : g.priorite)}>
            {contenu}
          </button>
        ) : (
          <div key={g.priorite} style={style}>
            {contenu}
          </div>
        );
      })}
    </div>
  );
}
