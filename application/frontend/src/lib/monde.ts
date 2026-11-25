import { useQuery } from "@tanstack/react-query";
import { geoArea, geoCentroid } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import adresse from "world-atlas/countries-50m.json?url";
import horsEchantillon from "../donnees/horsEchantillon.json";

export interface FormePays {
  numero: string;
  nom: string;
  forme: Feature<Geometry>;
  centre: [number, number];
}

const ANTARCTIQUE = "010";
const noms = horsEchantillon as Record<string, string>;

async function charger(): Promise<FormePays[]> {
  const topologie = (await (await fetch(adresse)).json()) as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const collection = feature(topologie, topologie.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  return collection.features
    .filter((f) => f.id !== ANTARCTIQUE)
    .map((f, i) => ({
      numero: f.id === undefined ? `sans-${i}` : String(f.id),
      nom: noms[String(f.id)] ?? f.properties.name,
      forme: f,
      centre: centrePrincipal(f),
    }));
}

/** Centre de la plus grande terre du pays, pour ne pas placer la France en plein océan. */
function centrePrincipal(forme: Feature<Geometry>): [number, number] {
  const g = forme.geometry;
  if (g.type !== "MultiPolygon") return geoCentroid(forme) as [number, number];
  let meilleur = g.coordinates[0]!;
  let aire = 0;
  for (const polygone of g.coordinates) {
    const a = geoArea({ type: "Polygon", coordinates: polygone });
    if (a > aire) [aire, meilleur] = [a, polygone];
  }
  return geoCentroid({ type: "Polygon", coordinates: meilleur }) as [number, number];
}

export const useMonde = () =>
  useQuery({ queryKey: ["monde"], queryFn: charger, staleTime: Infinity, gcTime: Infinity });
