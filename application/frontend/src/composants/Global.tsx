import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

/* --- Bulles d'information --------------------------------------------------- */

export function Bulles() {
  const [bulle, montrer] = useState<{ texte: string; x: number; y: number; dessous: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let minuterie = 0;
    let cible: Element | null = null;
    const cacher = () => {
      clearTimeout(minuterie);
      cible = null;
      montrer(null);
    };
    const preparer = (element: Element | null, delai: number) => {
      const source = element?.closest("[data-bulle]") ?? null;
      if (source === cible) return;
      cacher();
      const texte = source?.getAttribute("data-bulle");
      if (!source || !texte) return;
      cible = source;
      minuterie = window.setTimeout(() => {
        if (!source.isConnected) return;
        const r = source.getBoundingClientRect();
        const dessous = r.top < 64;
        montrer({ texte, x: r.left + r.width / 2, y: dessous ? r.bottom + 8 : r.top - 8, dessous });
      }, delai);
    };
    const survol = (e: PointerEvent) => e.pointerType === "mouse" && preparer(e.target as Element, 350);
    const focus = (e: FocusEvent) => (e.target as Element).matches(":focus-visible") && preparer(e.target as Element, 120);
    document.addEventListener("pointerover", survol);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", cacher);
    document.addEventListener("pointerdown", cacher);
    document.addEventListener("keydown", cacher);
    addEventListener("scroll", cacher, true);
    return () => {
      cacher();
      document.removeEventListener("pointerover", survol);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", cacher);
      document.removeEventListener("pointerdown", cacher);
      document.removeEventListener("keydown", cacher);
      removeEventListener("scroll", cacher, true);
    };
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !bulle) return;
    const demi = element.offsetWidth / 2;
    element.style.left = `${Math.max(demi + 8, Math.min(innerWidth - demi - 8, bulle.x))}px`;
  }, [bulle]);

  if (!bulle) return null;
  return (
    <div ref={ref} className={`bulle ${bulle.dessous ? "bulle--dessous" : ""}`} role="tooltip" style={{ left: bulle.x, top: bulle.y }}>
      {bulle.texte}
    </div>
  );
}

/* --- Notifications ---------------------------------------------------------- */

interface Avis {
  id: number;
  texte: string;
  type: "succes" | "erreur";
}

let avis: Avis[] = [];
let suite = 0;
const abonnes = new Set<() => void>();
const diffuser = () => abonnes.forEach((f) => f());

function ajouter(texte: string, type: Avis["type"]) {
  const nouveau = { id: ++suite, texte, type };
  avis = [...avis.slice(-2), nouveau];
  diffuser();
  setTimeout(() => {
    avis = avis.filter((a) => a.id !== nouveau.id);
    diffuser();
  }, type === "erreur" ? 7000 : 4000);
}

export const annoncer = (texte: string) => ajouter(texte, "succes");
export const signaler = (erreur: unknown) =>
  ajouter(erreur instanceof Error ? erreur.message : "Une erreur est survenue.", "erreur");

export function Notifications() {
  const liste = useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => avis,
  );
  return (
    <div className="notifications" aria-live="polite">
      {liste.map((a) => (
        <div key={a.id} className={`notification notification--${a.type}`} role={a.type === "erreur" ? "alert" : undefined}>
          {a.type === "erreur" ? <CircleAlert size={18} aria-hidden /> : <CircleCheck size={18} aria-hidden />}
          <span>{a.texte}</span>
        </div>
      ))}
    </div>
  );
}
