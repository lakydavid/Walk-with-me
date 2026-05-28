import { supabase } from "./supabase";

export type StreetFeature = {
  id: number;
  name: string;
  geom: GeoJSON.LineString;
  coverage: number; // 0..1
  completed: boolean;
};

export type AreaProgress = {
  area_id: number;
  area_name: string;
  streets_total: number;
  streets_completed: number;
  area_coverage_ratio: number;
};

/**
 * Fetches streets within the given map bounding box, joined with the current
 * user's progress. We return GeoJSON so MapView can render them as Polylines
 * coloured by status.
 *
 * Backed by an RPC that does the bbox filter + left join in one round-trip.
 * The RPC is defined in supabase/migrations (TODO: add streets_in_bbox).
 */
export async function fetchStreetsInBbox(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): Promise<StreetFeature[]> {
  const { data, error } = await supabase.rpc("streets_in_bbox", {
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
  });
  if (error) throw error;
  return (data ?? []) as StreetFeature[];
}

export async function fetchAreaProgress(): Promise<AreaProgress[]> {
  const { data, error } = await supabase
    .from("user_area_progress")
    .select("area_id, streets_total, streets_completed, area_coverage_ratio, areas!inner(name)")
    .order("area_coverage_ratio", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    area_id: r.area_id as number,
    area_name: (r.areas as { name: string }).name,
    streets_total: r.streets_total as number,
    streets_completed: r.streets_completed as number,
    area_coverage_ratio: r.area_coverage_ratio as number,
  }));
}
