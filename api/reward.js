import { createClient } from '@supabase/supabase-js';

// This ONE endpoint handles every balance write in the app:
//  1. PubScale calls it server-to-server as its S2S postback URL (increment mode).
//  2. The client calls it directly via fetch() for AdsBitvex/Telega rewards
//     (increment mode) AND for withdrawals / general syncs (set mode).
//
// Both need this because the browser's Supabase client only ever has the
// public/anon key, and Row Level Security is blocking writes to `users` from
// that key. This endpoint runs server-side with the SERVICE ROLE key, which
// bypasses RLS â€” the only reliable place to actually write a balance.
//
// Deploy at: /api/reward  (works fine as the PubScale postback target too)
//
// Modes:
//   ?user_id=X&value=10           -> adds 10 to the current balance (rewards)
//   ?user_id=X&balance=500&mode=set -> sets balance to exactly 500 (withdrawals, sync)

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // CORS: the client calls this via fetch() from the browser, so allow it.
  // Lock this down to your actual app's origin once you know it.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.method === 'GET' ? req.query : req.body;
  const { user_id, value, balance, mode } = params;

  if (!user_id) {
    return res.status(400).json({ error: 'Missing required user_id parameter' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const formattedUserId = user_id.toString().trim();

  try {
    if (mode === 'set') {
      // Absolute set â€” used for withdrawals (balance already deducted
      // client-side) and general local->server syncs.
      const newBalance = Math.round(parseFloat(balance));
      if (isNaN(newBalance) || newBalance < 0) {
        return res.status(400).json({ error: 'Invalid balance value' });
      }

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          { user_id: formattedUserId, balance: newBalance },
          { onConflict: 'user_id' }
        );

      if (upsertError) {
        console.error('CRITICAL BALANCE ERROR (set mode):', upsertError);
        return res.status(500).json({ error: 'Failed to set user balance' });
      }

      return res.status(200).json({ success: true, balance: newBalance });
    }

    // Default: increment mode â€” used for ad rewards and PubScale's postback.
    const rewardAmount = Math.round(parseFloat(value));
    if (isNaN(rewardAmount) || rewardAmount <= 0) {
      return res.status(400).json({ error: 'Invalid reward amount' });
    }

    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('balance')
      .eq('user_id', formattedUserId)
      .maybeSingle();

    if (fetchError) {
      console.error('BALANCE FETCH ERROR:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch current balance' });
    }

    const currentBalance = userData?.balance || 0;
    const newBalance = currentBalance + rewardAmount;

    const { error: upsertError } = await supabase
      .from('users')
      .upsert(
        { user_id: formattedUserId, balance: newBalance },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('CRITICAL BALANCE ERROR:', upsertError);
      return res.status(500).json({ error: 'Failed to update user balance' });
    }

    return res.status(200).json({ success: true, balance: newBalance });

  } catch (error) {
    console.error('Execution Exception:', error.message || error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
                                 }
