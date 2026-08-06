import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
    const { user_id, value, token, signature } = req.query;

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
            .select('balance')
            .eq('user_id', user_id)
            .single();

        if (fetchError && fetchError.code === 'PGRST116') {
            const { error: insertError } = await supabase
                .from('users')
                .insert([{ user_id: user_id, balance: rewardAmount }]);

            if (insertError) throw insertError;
        } else {
            const newBalance = (user.balance || 0) + rewardAmount;

            const { error: updateError } = await supabase
                .from('users')
                .update({ balance: newBalance })
                .eq('user_id', user_id);

            if (updateError) throw updateError;
        }

        console.log(`Successfully credited user ${user_id} with ${rewardAmount}`);
        return res.status(200).send('OK');

    } catch (err) {
        console.error('Database error:', err.message);
        return res.status(500).send('Internal Server Error');
    }
                                    }
