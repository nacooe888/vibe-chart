import { supabase } from './supabase'

// Save chart data (natal or transits) to Supabase
// Uses upsert to handle both insert and update
export async function saveChart(userId, chartType, chartData) {
  const { data, error } = await supabase
    .from('user_charts')
    .upsert({
      user_id: userId,
      chart_type: chartType,
      chart_data: chartData,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,chart_type',
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving chart:', error)
    return null
  }
  return data
}

// Load chart data (natal or transits) from Supabase
export async function loadChart(userId, chartType) {
  const { data, error } = await supabase
    .from('user_charts')
    .select('chart_data')
    .eq('user_id', userId)
    .eq('chart_type', chartType)
    .single()

  if (error) {
    // No chart found is not an error
    if (error.code === 'PGRST116') return null
    console.error('Error loading chart:', error)
    return null
  }
  return data?.chart_data || null
}

// Delete chart data from Supabase
export async function deleteChart(userId, chartType) {
  const { error } = await supabase
    .from('user_charts')
    .delete()
    .eq('user_id', userId)
    .eq('chart_type', chartType)

  if (error) {
    console.error('Error deleting chart:', error)
    return false
  }
  return true
}
