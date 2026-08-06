import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    const { user_id, value, token, signature, offer_name } = req.query;

    if (!user_id || !value) {
        return res.status(400).send('Missing required parameters');
    }

    const secretKey = '8fdc2af4-6a53-4f74-ac22-870eefd04b70';
    
    if (!secretKey) {
        return res.status(500).send('Configuration error');
    }

    const rewardAmount = parseFloat(value);

    try {
        let { data: user, error: fetchError } = await supabase
            .from('users')
            .select('balance, history_log')
            .eq('user_id', user_id)
            .maybeSingle();

        let historyLog = user && user.history_log ? user.history_log : [];
        const newHistoryItem = {
            type: 'offerwall',
            detail: `+${rewardAmount} HOWL from ${offer_name || 'Partner Offerwall'}`,
            timestamp: new Date().toISOString()
        };
        historyLog.unshift(newHistoryItem);
        if (historyLog.length > 50) historyLog.pop();

        if (fetchError) {
            console.error('Fetch error:', fetchError.message);
        }

        if (!user) {
            const { error: insertError } = await supabase
                .from('users')
                .insert([{ 
                    user_id: user_id, 
                    balance: rewardAmount,
                    history_log: historyLog 
                }]);

            if (insertError) throw insertError;
        } else {
            const newBalance = (user.balance || 0) + rewardAmount;

            const { error: updateError } = await supabase
                .from('users')
                .update({ 
                    balance: newBalance,
                    history_log: historyLog 
                })
                .eq('user_id', user_id);

            if (updateError) throw updateError;
        }

        console.log(`Successfully credited user ${user_id} with ${rewardAmount} and updated history`);
        return res.status(200).send('OK');

    } catch (err) {
        console.error('Database error:', err.message);
        return res.status(500).send('Internal Server Error');
    }
}
