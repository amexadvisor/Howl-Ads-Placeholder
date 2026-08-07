import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Pubscale uses GET requests for postbacks
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Extract parameters sent by Pubscale
  const { offer_id, signature, token, user_id, value } = req.query;

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
    console.error('Missing Supabase environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const formattedUserId = user_id.toString().trim();
  const taskId = (offer_id || token || 'pubscale_offer').toString();

  try {
    // ------------------------------------------------------------------
    // STEP 1: DUPLICATE CHECK (Prevent double crediting if Pubscale retries)
    // ------------------------------------------------------------------
    if (token) {
      const { data: existingTx } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', formattedUserId)
        .eq('task_id', token.toString())
        .limit(1);

      if (existingTx && existingTx.length > 0) {
        console.log(`Duplicate transaction ignored for token: ${token}`);
        return res.status(200).send('OK'); // Return 200 so Pubscale stops retrying
      }
    }

    // ------------------------------------------------------------------
    // STEP 2: FETCH & UPDATE USER BALANCE
    // ------------------------------------------------------------------
    const { data: userData, error: userFetchError } = await supabase
      .from('users')
      .select('balance')
      .eq('user_id', formattedUserId)
      .maybeSingle();

    if (userFetchError) {
      console.error('Error fetching user balance:', userFetchError.message);
    }

    const currentBalance = userData?.balance || 0;
    const newBalance = currentBalance + rewardAmount;

    const { error: upsertError } = await supabase
      .from('users')
      .upsert({
        user_id: formattedUserId,
        balance: newBalance,
        updated_at: new Date().toISOString()
      });

    if (upsertError) {
      console.error('Error updating user balance:', upsertError.message);
      return res.status(500).json({ error: 'Failed to update user balance' });
    }

    // ------------------------------------------------------------------
    // STEP 3: INSERT TRANSACTION RECORD FOR OFFERWALL HISTORY
    // ------------------------------------------------------------------
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: formattedUserId,
        type: 'offerwall',
        detail: `+${rewardAmount} HOWL from Offerwall`,
        task_id: taskId,
        reward_amount: rewardAmount,
        timestamp: new Date().toISOString()
      });

    if (txError) {
      console.error('Failed to log offerwall transaction:', txError.message);
      // Fallback: Attempting minimal insert if optional schema columns differ
      await supabase.from('transactions').insert({
        user_id: formattedUserId,
        type: 'offerwall',
        detail: `+${rewardAmount} HOWL from Offerwall`,
        timestamp: new Date().toISOString()
      });
    }

    // Return 200 OK to confirm success to Pubscale
    return res.status(200).send('OK');

  } catch (error) {
    console.error('Postback processing execution error:', error.message || error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
