import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Pubscale uses GET requests to send the postback query parameters
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 1. Extract the data Pubscale sent in the URL
  const { offer_id, signature, token, user_id, value } = req.query;

  // Basic validation to ensure we have the necessary data
  if (!user_id || !value) {
    return res.status(400).json({ error: 'Missing user_id or value' });
  }

  const rewardAmount = parseInt(value, 10);

  // Initialize Supabase client (Ensure these are set in your Vercel Environment Variables!)
  const supabaseUrl = process.env.SUPABASE_URL; 
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // ==========================================
    // STEP 1: ADD BALANCE (You already have this working)
    // ==========================================
    const { data: userData } = await supabase
      .from('users')
      .select('balance')
      .eq('user_id', user_id)
      .single();

    const newBalance = (userData?.balance || 0) + rewardAmount;

    await supabase
      .from('users')
      .upsert({ 
        user_id: user_id, 
        balance: newBalance, 
        updated_at: new Date().toISOString() 
      });


    // ==========================================
    // STEP 2: THE MISSING PIECE - LOG TO HISTORY
    // ==========================================
    // This inserts the record into Supabase so index.html can see it in the "Offerwall" tab
    const { error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user_id.toString(),
        type: 'offerwall',                            // MUST be 'offerwall' to match your frontend tabs
        detail: `+${rewardAmount} HOWL from Offerwall`,
        task_id: offer_id || token,                   // Logs the specific offer ID
        reward_amount: rewardAmount,
        timestamp: new Date().toISOString()
      });

    if (txError) {
      console.error("Supabase History Insert Error:", txError);
      // We log the error but don't crash, so Pubscale still gets their success response
    }

    // ==========================================
    // STEP 3: RESPOND TO PUBSCALE
    // ==========================================
    // Pubscale needs a 200 OK response so they know the callback succeeded
    return res.status(200).send('OK');

  } catch (error) {
    console.error('Vercel Postback Processing Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
