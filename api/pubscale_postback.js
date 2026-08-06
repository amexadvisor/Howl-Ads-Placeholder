import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    const { user_id, value, token, signature, transaction_id, offer_name } = req.query;

    if (!user_id || !value) {
        return res.status(400).send('Missing required parameters');
    }

    const secretKey = '8fdc2af4-6a53-4f74-ac22-870eefd04b70';
    
    if (!secretKey) {
        return res.status(500).send('Configuration error');
    }

    const rewardAmount = parseFloat(value);
    const txId = transaction_id || token || `${user_id}-${Date.now()}`;
    const offerName = offer_name || 'PubScale Offer';

    try {
        const { data: existingTx } = await supabase
            .from('transactions')
            .select('transaction_id')
            .eq('transaction_id', txId)
            .single();

        if (existingTx) {
            return res.status(200).send('Duplicate transaction');
        }

        let { data: user, error: fetchError } = await supabase
            .from('users')
            .select('balance')
            .eq('user_id', user_id)
            .single();

        let newBalance = rewardAmount;

        if (fetchError && fetchError.code === 'PGRST116') {
            const { error: insertError } = await supabase
                .from('users')
                .insert([{ user_id: user_id.toString(), balance: rewardAmount }]);

            if (insertError) throw insertError;
        } else {
            newBalance = (user.balance || 0) + rewardAmount;

            const { error: updateError } = await supabase
                .from('users')
                .update({ balance: newBalance, updated_at: new Date().toISOString() })
                .eq('user_id', user_id);

            if (updateError) throw updateError;
        }

        await supabase.from('transactions').insert([{
            user_id: user_id.toString(),
            transaction_id: txId,
            type: 'pubscale',
            detail: `+${rewardAmount} HOWL from PubScale: ${offerName}`,
            timestamp: new Date().toISOString()
        }]);

        console.log(`Successfully credited user ${user_id} with ${rewardAmount}`);
        return res.status(200).send('OK');

    } catch (err) {
        console.error('Database error:', err.message);
        return res.status(500).send('Internal Server Error');
    }
}
