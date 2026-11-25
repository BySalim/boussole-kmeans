import { Check, ChevronDown, LoaderCircle, X, type LucideIcon } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { couleur, couleurTexte } from "../lib/couleurs";

const classes = (...noms: (string | false | undefined)[]) => noms.filter(Boolean).join(" ");

/* --- Boutons ------------------------------------------------------------- */

interface ProprietesBouton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: "principal" | "second" | "discret" | "danger";
  icone?: LucideIcon;
  occupe?: boolean;
}

export function Bouton({ variante = "second", icone: Icone, occupe, children, className, disabled, ...reste }: ProprietesBouton) {
  return (
    <button type="button" className={classes("bouton", `bouton--${variante}`, className)} disabled={disabled || occupe} aria-busy={occupe} {...reste}>
      {occupe ? <LoaderCircle className="tourne" size={17} aria-hidden /> : Icone && <Icone size={17} aria-hidden />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function BoutonIcone({ icone: Icone, libelle, className, taille = 18, ...reste }: ButtonHTMLAttributes<HTMLButtonElement> & { icone: LucideIcon; libelle: string; taille?: number }) {
  return (
    <button type="button" className={classes("bouton-icone", className)} aria-label={libelle} data-bulle={libelle} {...reste}>
      <Icone size={taille} aria-hidden />
    </button>
  );
}

/* --- Choix segmenté ------------------------------------------------------ */

export interface Option<T extends string> {
  valeur: T;
  libelle: string;
  icone?: LucideIcon;
}

export function Segment<T extends string>({ valeur, options, onChange, libelle, plein }: { valeur: T; options: Option<T>[]; onChange: (v: T) => void; libelle: string; plein?: boolean }) {
  const nom = useId();
  return (
    <div className={classes("segment", plein && "segment--plein")} role="radiogroup" aria-label={libelle}>
      {options.map(({ valeur: v, libelle: texte, icone: Icone }) => (
        <label key={v} className={classes("segment__choix", v === valeur && "est-choisi")}>
          <input type="radio" className="hors-ecran" name={nom} checked={v === valeur} onChange={() => onChange(v)} />
          {Icone && <Icone size={16} aria-hidden />}
          <span>{texte}</span>
        </label>
      ))}
    </div>
  );
}

/* --- Liste de choix ------------------------------------------------------ */

export function Choix<T extends string>({ valeur, options, onChange, libelle, visible = true, className }: { valeur: T; options: Option<T>[]; onChange: (v: T) => void; libelle: string; visible?: boolean; className?: string }) {
  const [ouvert, ouvrir] = useState(false);
  const [actif, activer] = useState(0);
  const [enHaut, placerEnHaut] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  const frappe = useRef({ texte: "", instant: 0 });
  const id = useId();
  const courant = options.findIndex((o) => o.valeur === valeur);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => !racine.current?.contains(e.target as Node) && ouvrir(false);
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  useLayoutEffect(() => {
    if (!ouvert || !racine.current || !liste.current) return;
    const { top, bottom } = racine.current.getBoundingClientRect();
    const besoin = Math.min(liste.current.scrollHeight, 280) + 16;
    placerEnHaut(innerHeight - bottom < besoin && top > innerHeight - bottom);
    liste.current.children[actif]?.scrollIntoView({ block: "nearest" });
  }, [ouvert, actif]);

  const montrer = () => {
    activer(Math.max(0, courant));
    ouvrir(true);
  };
  const choisir = (i: number) => {
    const option = options[i];
    if (option) onChange(option.valeur);
    ouvrir(false);
  };
  const clavier = (e: KeyboardEvent) => {
    const mouvements: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    if (e.key in mouvements) {
      e.preventDefault();
      if (!ouvert) montrer();
      else activer((a) => Math.max(0, Math.min(options.length - 1, a + (mouvements[e.key] ?? 0))));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      activer(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (ouvert) choisir(actif);
      else montrer();
    } else if (e.key === "Escape" && ouvert) {
      e.preventDefault();
      e.stopPropagation();
      ouvrir(false);
    } else if (e.key === "Tab") {
      ouvrir(false);
    } else if (e.key.length === 1) {
      const maintenant = Date.now();
      frappe.current.texte = maintenant - frappe.current.instant > 700 ? e.key : frappe.current.texte + e.key;
      frappe.current.instant = maintenant;
      const trouve = options.findIndex((o) => o.libelle.toLowerCase().startsWith(frappe.current.texte.toLowerCase()));
      if (trouve >= 0) {
        if (!ouvert) ouvrir(true);
        activer(trouve);
      }
    }
  };

  return (
    <div className={classes("choix", ouvert && "est-ouvert", enHaut && "choix--haut", className)} ref={racine}>
      {visible && (
        <span className="champ__libelle" id={`${id}-l`}>
          {libelle}
        </span>
      )}
      <div className="choix__cadre">
        <button
          type="button"
          className="choix__bouton"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={ouvert}
          aria-controls={`${id}-liste`}
          aria-label={visible ? undefined : libelle}
          aria-labelledby={visible ? `${id}-l ${id}-v` : undefined}
          aria-activedescendant={ouvert ? `${id}-${actif}` : undefined}
          onClick={() => (ouvert ? ouvrir(false) : montrer())}
          onKeyDown={clavier}
        >
          <span id={`${id}-v`}>{options[courant]?.libelle}</span>
          <ChevronDown size={16} aria-hidden />
        </button>
        {ouvert && (
          <ul className="choix__liste" role="listbox" id={`${id}-liste`} ref={liste} aria-label={libelle}>
            {options.map((o, i) => (
              <li
                key={o.valeur}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.valeur === valeur}
                className={classes(i === actif && "est-actif")}
                onPointerEnter={() => activer(i)}
                onClick={() => choisir(i)}
              >
                <span>{o.libelle}</span>
                {o.valeur === valeur && <Check size={15} aria-hidden />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* --- Curseur ------------------------------------------------------------- */

interface ProprietesCurseur {
  libelle: string;
  valeur: number;
  min: number;
  max: number;
  pas?: number;
  onChange: (v: number) => void;
  affichage?: string;
  repere?: number;
  aide?: string;
  saisie?: boolean;
  decimales?: number;
  unite?: string;
}

export function Curseur({ libelle, valeur, min, max, pas = 1, onChange, affichage, repere, aide, saisie, decimales = 0, unite }: ProprietesCurseur) {
  const id = useId();
  const part = ((Math.min(max, Math.max(min, valeur)) - min) / (max - min || 1)) * 100;
  const aimanter = (v: number) => (repere !== undefined && Math.abs(v - repere) < (max - min) / 250 ? repere : v);
  return (
    <div className="curseur">
      <div className="curseur__tete">
        <label htmlFor={id} className="champ__libelle" data-bulle={aide}>
          {libelle}
        </label>
        {saisie ? (
          <SaisieNombre valeur={valeur} min={min} max={max} decimales={decimales} unite={unite} libelle={libelle} onChange={onChange} />
        ) : (
          <output htmlFor={id}>{affichage ?? valeur}</output>
        )}
      </div>
      <div className="curseur__piste" style={{ "--part": `${part}%` } as CSSProperties}>
        {repere !== undefined && (
          <i className="curseur__repere" style={{ left: `calc(9px + (100% - 18px) * ${(repere - min) / (max - min || 1)})` }} aria-hidden />
        )}
        <input id={id} type="range" min={min} max={max} step={pas} value={valeur} aria-valuetext={affichage} onChange={(e) => onChange(aimanter(Number(e.target.value)))} />
      </div>
    </div>
  );
}

export function SaisieNombre({ valeur, min, max, decimales = 0, unite, libelle, onChange }: { valeur: number; min: number; max: number; decimales?: number; unite?: string; libelle: string; onChange: (v: number) => void }) {
  const ecrire = (v: number) => v.toFixed(decimales).replace(".", ",");
  const [texte, definir] = useState(ecrire(valeur));
  const focus = useRef(false);
  useEffect(() => {
    if (!focus.current) definir(ecrire(valeur));
  }, [valeur]);
  const interpreter = (saisi: string) => {
    const lu = Number(saisi.replace(/[\s  ]/g, "").replace(",", "."));
    return saisi.trim() && Number.isFinite(lu) ? lu : null;
  };
  const valider = () => {
    const lu = interpreter(texte);
    const retenu = lu === null ? valeur : Math.min(max, Math.max(min, lu));
    if (retenu !== valeur) onChange(retenu);
    definir(ecrire(retenu));
  };
  return (
    <span className="saisie-nombre">
      <input
        inputMode="decimal"
        aria-label={libelle}
        value={texte}
        onFocus={(e) => {
          focus.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focus.current = false;
          valider();
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        onChange={(e) => {
          definir(e.target.value);
          const lu = interpreter(e.target.value);
          if (lu !== null && lu >= min && lu <= max) onChange(lu);
        }}
      />
      {unite && <span aria-hidden>{unite}</span>}
    </span>
  );
}

/* --- Cases ---------------------------------------------------------------- */

export function Puce({ choisie, onChange, children, desactivee, bulle }: { choisie: boolean; onChange: (v: boolean) => void; children: ReactNode; desactivee?: boolean; bulle?: string }) {
  return (
    <label className={classes("puce", choisie && "est-choisie", desactivee && "est-desactivee")} data-bulle={bulle}>
      <input type="checkbox" className="hors-ecran" checked={choisie} disabled={desactivee} onChange={(e) => onChange(e.target.checked)} />
      {choisie && <Check size={14} aria-hidden />}
      <span>{children}</span>
    </label>
  );
}

/* --- Priorité ------------------------------------------------------------- */

export function Pastille({ priorite, k, courte }: { priorite: number; k: number; courte?: boolean }) {
  return (
    <span className="pastille" style={{ "--teinte": couleur(priorite, k), "--teinte-texte": couleurTexte(priorite, k) } as CSSProperties}>
      <i aria-hidden />
      {courte ? <span aria-label={`Priorité ${priorite}`}>{priorite}</span> : <span>Priorité {priorite}</span>}
    </span>
  );
}

/* --- États ---------------------------------------------------------------- */

export function Vide({ icone: Icone, titre, children }: { icone?: LucideIcon; titre: string; children?: ReactNode }) {
  return (
    <div className="vide">
      {Icone && <Icone size={28} strokeWidth={1.5} aria-hidden />}
      <p className="vide__titre">{titre}</p>
      {children}
    </div>
  );
}

export function Attente({ libelle = "Chargement…" }: { libelle?: string }) {
  return (
    <div className="attente" role="status">
      <LoaderCircle className="tourne" size={22} aria-hidden />
      <span>{libelle}</span>
    </div>
  );
}

export function Echec({ erreur, reessayer }: { erreur: unknown; reessayer?: () => void }) {
  return (
    <div className="vide" role="alert">
      <p className="vide__titre">{erreur instanceof Error ? erreur.message : "Une erreur est survenue."}</p>
      {reessayer && <Bouton onClick={reessayer}>Réessayer</Bouton>}
    </div>
  );
}

/* --- Feuille (fenêtre de dialogue) ----------------------------------------- */

export function Feuille({ titre, ouverte, onFermer, children, large, actions }: { titre: string; ouverte: boolean; onFermer: () => void; children: ReactNode; large?: boolean; actions?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialogue = ref.current;
    if (!dialogue) return;
    if (ouverte && !dialogue.open) {
      dialogue.showModal();
      dialogue.querySelector<HTMLElement>("[data-depart]")?.focus();
    }
    if (!ouverte && dialogue.open) dialogue.close();
  }, [ouverte]);
  if (!ouverte) return null;
  return (
    <dialog
      ref={ref}
      className={classes("feuille", large && "feuille--large")}
      aria-labelledby={id}
      onClose={onFermer}
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      onPointerDown={(e) => e.target === ref.current && onFermer()}
    >
      <div className="feuille__corps">
        <header className="feuille__tete">
          <h2 id={id}>{titre}</h2>
          <BoutonIcone icone={X} libelle="Fermer" onClick={onFermer} />
        </header>
        <div className="feuille__contenu">{children}</div>
        {actions && <footer className="feuille__pied">{actions}</footer>}
      </div>
    </dialog>
  );
}

export function Confirmation({ titre, texte, action, ouverte, onFermer, onConfirmer, occupe }: { titre: string; texte: string; action: string; ouverte: boolean; onFermer: () => void; onConfirmer: () => void; occupe?: boolean }) {
  return (
    <Feuille
      titre={titre}
      ouverte={ouverte}
      onFermer={onFermer}
      actions={
        <>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="danger" onClick={onConfirmer} occupe={occupe}>
            {action}
          </Bouton>
        </>
      }
    >
      <p>{texte}</p>
    </Feuille>
  );
}
