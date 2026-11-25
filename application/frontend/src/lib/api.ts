import { contexteActuel } from "./espace";

const BASE = import.meta.env.VITE_API ?? "";

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
  ) {
    super(message);
  }
}

async function demander(chemin: string, options: RequestInit = {}): Promise<Response> {
  let reponse: Response;
  try {
    reponse = await fetch(`${BASE}/api${chemin}`, { credentials: "same-origin", ...options });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ErreurApi("Connexion impossible. Vérifiez votre réseau, puis réessayez.", 0);
  }
  if (!reponse.ok) {
    let message = "Le service ne répond pas. Réessayez dans un instant.";
    try {
      const corps = await reponse.json();
      if (typeof corps.detail === "string") message = corps.detail;
    } catch {
      /* réponse sans contenu lisible */
    }
    throw new ErreurApi(message, reponse.status);
  }
  return reponse;
}

export async function lire<T>(chemin: string, signal?: AbortSignal): Promise<T> {
  return (await demander(chemin, { signal })).json();
}

const enJson = (corps: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(corps),
});

export async function envoyer<T>(chemin: string, corps: unknown, signal?: AbortSignal): Promise<T> {
  return (await demander(chemin, { ...enJson(corps), signal })).json();
}

/** Demande un calcul sur l'espace du visiteur. */
export const calculer = <T>(chemin: string, corps: object = {}, signal?: AbortSignal) =>
  envoyer<T>(chemin, { contexte: contexteActuel(), ...corps }, signal);

export async function envoyerFichier<T>(chemin: string, fichier: File): Promise<T> {
  const formulaire = new FormData();
  formulaire.append("fichier", fichier);
  return (await demander(chemin, { method: "POST", body: formulaire })).json();
}

export async function telecharger(chemin: string, nom: string, corps: object = {}): Promise<void> {
  const reponse = await demander(chemin, enJson({ contexte: contexteActuel(), ...corps }));
  const adresse = URL.createObjectURL(await reponse.blob());
  const lien = document.createElement("a");
  lien.href = adresse;
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}
