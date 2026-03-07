import { supabase } from "./supabase";

// Parse "Neptune trine natal Ascendant" into components
function parseTransitName(transitName) {
  const match = transitName.match(/^(\w+)\s+(trine|conjunct|square|sextile|opposite|quincunx|semi-sextile|semi-square)\s+natal\s+(.+)$/i);
  if (!match) return { transit_planet: null, aspect_type: null, natal_planet: null };
  return {
    transit_planet: match[1],
    aspect_type: match[2].toLowerCase(),
    natal_planet: match[3],
  };
}

export async function saveReflection(userId, {
  transitName, vibe, reflectingOnYear, body, transitPositions,
  entryType = 'journal', planetCategory = null, arcHit = null, arcDates = null,
}) {
  const parsed = parseTransitName(transitName);
  const { error } = await supabase.from("reflections").insert({
    user_id: userId,
    transit_name: transitName,
    transit_planet: parsed.transit_planet,
    natal_planet: parsed.natal_planet,
    aspect_type: parsed.aspect_type,
    vibe,
    reflecting_on_year: reflectingOnYear,
    body,
    transit_positions: transitPositions || null,
    entry_type: entryType,
    planet_category: planetCategory,
    arc_hit: arcHit,
    arc_dates: arcDates,
  });
  if (error) throw error;
}

export async function loadReflections(userId, transitName) {
  const { data, error } = await supabase
    .from("reflections")
    .select("*")
    .eq("user_id", userId)
    .eq("transit_name", transitName)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Load all entries for a specific arc instance (matched by transit_name + arc_dates)
export async function loadArcReflections(userId, transitName, arcDates) {
  const { data, error } = await supabase
    .from("reflections")
    .select("*")
    .eq("user_id", userId)
    .eq("transit_name", transitName)
    .eq("entry_type", "arc")
    .containedBy("arc_dates", arcDates)
    .order("created_at", { ascending: true });
  // containedBy might not work perfectly for jsonb array matching, fallback to filter
  if (error) {
    // Fallback: load all arc entries for this transit and filter client-side
    const fallback = await supabase
      .from("reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("transit_name", transitName)
      .eq("entry_type", "arc")
      .order("created_at", { ascending: true });
    if (fallback.error) throw fallback.error;
    const arcKey = JSON.stringify(arcDates);
    return (fallback.data || []).filter(r => JSON.stringify(r.arc_dates) === arcKey);
  }
  return data || [];
}

export async function loadReflectionsByPlanet(userId, transitPlanet) {
  const { data, error } = await supabase
    .from("reflections")
    .select("*")
    .eq("user_id", userId)
    .eq("transit_planet", transitPlanet)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
