import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    // Updated to use 'offer_id' matching your PubScale dashboard configuration
    const { user_id, value, token, signature, offer_id } = req.query;

    if (!user_id || !value) {
        return res.status(400).send('Missing required parameters');
    }

    const secretKey = '8fdc2af4-6a53-4f74-ac22-870eefd04b70';
    
    if (!secretKey) {
        return res.status(500).send('Configuration error');
    }

    const rewardAmount = parseFloat(value);
    const txId = token || `pubscale-${Date.now()}`;
    const offer = offer_id ? `Offer #${offer_id}` : 'PubScale Offer';

    try {
        let { data: user, error: fetchError } = await supabase
            .from('users')
            .select('balance')
            .eq('user_id', user_id.toString())
            .single();

        if (fetchError && fetchError.code === 'PGRST116') {
            const { error: insertError } = await supabase
                .from('users')
                .insert([{ user_id: user_id.toString(), balance: rewardAmount }]);

            if (insertError) throw insertError;
        } else {
            const newBalance = ((user && user.balance) || 0) + rewardAmount;

            const { error: updateError } = await supabase
                .from('users')
                .update({ balance: newBalance })
                .eq('user_id', user_id.toString());

            if (updateError) throw updateError;
        }

        // --- OFFERWALL HISTORY INSERTION ---
        const { error: historyError } = await supabase
            .from('transactions') 
            .insert([{
                user_id: user_id.toString(),
                transaction_id: txId,
                type: 'offerwall',
                detail: `+${rewardAmount} HOWL from ${offer}`,
                task_id: txId,
                reward_amount: rewardAmount,
                timestamp: new Date().toISOString()
            }]);

        if (historyError) {
            console.error('Failed to log offerwall history to Supabase:', historyError.message);
        }
        // -----------------------------------

        return res.status(200).send('OK');

    } catch (err) {
        console.error('Database error:', err.message);
        return res.status(500).send('Internal Server Error');
    }
}
