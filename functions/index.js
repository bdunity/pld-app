const functions = require("firebase-functions");

// Basic function to verify the backend is alive
exports.helloWorld = functions.https.onRequest((request, response) => {
    functions.logger.info("Hello logs!", { structuredData: true });
    response.send("PLD BDU API is ready.");
});
