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

export async function saveReflection(userId, { transitName, vibe, reflectingOnYear, body, transitPositions }) {
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
