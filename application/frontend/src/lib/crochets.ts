import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function useTaille<T extends Element>() {
  const ref = useRef<T>(null);
  const [taille, definir] = useState({ largeur: 0, hauteur: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const mesurer = () => {
      const { width, height } = element.getBoundingClientRect();
      definir((t) => (Math.abs(t.largeur - width) < 1 && Math.abs(t.hauteur - height) < 1 ? t : { largeur: width, hauteur: height }));
    };
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => observateur.disconnect();
  }, []);
  return [ref, taille] as const;
}

export function useDiffere<T>(valeur: T, delai = 140): T {
  const [differee, definir] = useState(valeur);
  useEffect(() => {
    const minuterie = setTimeout(() => definir(valeur), delai);
    return () => clearTimeout(minuterie);
  }, [valeur, delai]);
  return differee;
}

export function useMedia(requete: string): boolean {
  const [correspond, definir] = useState(() => matchMedia(requete).matches);
  useEffect(() => {
    const media = matchMedia(requete);
    const suivre = () => definir(media.matches);
    suivre();
    media.addEventListener("change", suivre);
    return () => media.removeEventListener("change", suivre);
  }, [requete]);
  return correspond;
}

export function useTitre(titre: string) {
  useEffect(() => {
    document.title = titre ? `${titre} · Boussole` : "Boussole";
  }, [titre]);
}

export type Theme = "auto" | "clair" | "sombre";

export function useTheme() {
  const [theme, definir] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? "auto");
  const systemeSombre = useMedia("(prefers-color-scheme: dark)");
  const sombre = theme === "sombre" || (theme === "auto" && systemeSombre);
  const basculer = useCallback(() => {
    const suivant: Theme = sombre ? "clair" : "sombre";
    definir(suivant);
    document.documentElement.dataset.theme = suivant;
    try {
      localStorage.setItem("boussole-theme", suivant);
    } catch {
      /* le choix vaut pour cette visite */
    }
  }, [sombre]);
  return { sombre, basculer };
}

/** Fait avancer une valeur de 0 à 1 à chaque changement de clé, en respectant le mouvement réduit. */
export function useAnimation(cle: unknown, duree = 420): number {
  const [avancement, definir] = useState(1);
  const reduit = useMedia("(prefers-reduced-motion: reduce)");
  useLayoutEffect(() => {
    if (reduit) {
      definir(1);
      return;
    }
    let image = 0;
    const debut = performance.now();
    definir(0);
    const avancer = (instant: number) => {
      const t = Math.min(1, (instant - debut) / duree);
      definir(1 - (1 - t) ** 3);
      if (t < 1) image = requestAnimationFrame(avancer);
    };
    image = requestAnimationFrame(avancer);
    return () => cancelAnimationFrame(image);
  }, [cle, duree, reduit]);
  return avancement;
}
