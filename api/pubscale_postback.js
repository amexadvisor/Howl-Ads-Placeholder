import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { user_id, value } = req.query;

  if (!user_id || !value) {
    return res.status(400).json({ error: 'Missing required user_id or value parameters' });
  }

  const rewardAmount = Math.round(parseFloat(value));
  if (isNaN(rewardAmount) || rewardAmount <= 0) {
    return res.status(400).json({ error: 'Invalid reward amount' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const formattedUserId = user_id.toString().trim();

  try {
    // ------------------------------------------------------------------
    // STEP 1: FETCH & UPDATE USER BALANCE
    // ------------------------------------------------------------------
    const { data: userData } = await supabase
      .from('users')
      .select('balance')
      .eq('user_id', formattedUserId)
      .maybeSingle();

    const currentBalance = userData?.balance || 0;
    const newBalance = currentBalance + rewardAmount;

    const { error: upsertError } = await supabase
      .from('users')
      .upsert(
        { user_id: formattedUserId, balance: newBalance },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      console.error('Error updating user balance:', upsertError.message);
      return res.status(500).json({ error: 'Failed to update user balance' });
    }

    // ------------------------------------------------------------------
    // STEP 2: INSERT TRANSACTION HISTORY (Minimal columns only)
    // ------------------------------------------------------------------
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: formattedUserId,
        type: 'offerwall',
        detail: `+${rewardAmount} HOWL from Offerwall`
      });

    if (txError) {
      console.error('Failed to insert history:', txError.message);
    }

    return res.status(200).send('OK');

  } catch (error) {
    console.error('Postback processing execution error:', error.message || error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
