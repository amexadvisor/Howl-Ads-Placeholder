export default function handler(req, res) {
    const { user_id, value, token, signature } = req.query;

    // PubScale sends a value/reward amount when a task is completed successfully
    if (user_id && value) {
        // TODO: Add your database credit logic here to add 'value' to 'user_id'
        console.log(`PubScale: Credited user ${user_id} with reward value: ${value}`);

        // PubScale expects a success response
        return res.status(200).send('OK');
    }

    return res.status(400).send('Invalid request');
}
