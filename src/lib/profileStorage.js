import { supabase } from './supabase'

export async function saveProfile(userId, profileData) {
  // Remove ayanamsa if present - not user-configurable for now
  const { ayanamsa, ...cleanData } = profileData

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      user_id: userId,
      ...cleanData,
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data
}

export async function deleteProfile(userId) {
  const { error } = await supabase
    .from('user_profiles')
    .delete()
    .eq('user_id', userId)

  if (error) throw error
}
