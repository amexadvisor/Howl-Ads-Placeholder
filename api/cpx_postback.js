export default function handler(req, res) {
    const { status, trans_id, user_id, amount_usd, secure_hash } = req.query;

    if (status === '1') {
        // TODO: Add your database credit logic here
        console.log(`Credited user ${user_id} with $${amount_usd} (Tx: ${trans_id})`);
        return res.status(200).send('OK');
    } else if (status === '2') {
        console.log(`Survey reversed for user ${user_id}`);
        return res.status(200).send('OK');
    }

    return res.status(400).send('Invalid status');
}
