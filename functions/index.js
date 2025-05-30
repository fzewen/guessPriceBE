/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");

// The Firebase Admin SDK to access Firestore.
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const cors = require("cors")({origin: true}); // Allows all origins

initializeApp();

// Take the text parameter passed to this HTTP endpoint and insert it into
// Firestore under the path /messages/:documentId/original
exports.addGuess = onRequest((req, res) => {
  cors(req, res, async () => {
    const data = req.body.data;

    if (!data) {
      res.status(400).json({error: "Missing data field"});
      return;
    }

    console.log(data);
    // here we need transaction call
    try {
      // update user table
      let usersUpdate = {};
      usersUpdate[`guesses.${data.mlsId}`] = data.price;
      console.log(usersUpdate);
      const userResult = await getFirestore()
          .collection("users")
          .doc(data.userId)
          .update(usersUpdate, { merge: true });

      // update guess table
      let guessUpdate = {};
      guessUpdate[`guesses.${data.userId}`] = data.price;
      console.log(guessUpdate);
      const guessResult = await getFirestore()
          .collection("guesses")
          .doc(data.mlsId)
          .update(guessUpdate, { merge: true });

      // update active mls list
      let mlsUpdate = {};
      mlsUpdate[`lastAcessTime`] = Date.now();
      mlsUpdate[`status`] = 'Active';
      console.log(mlsUpdate);
      const mlsResult = await getFirestore()
          .collection("mls")
          .doc(data.mlsId)
          .update(mlsUpdate, { merge: true });
      res.json({result: `Success`});
    } catch (error) {
      res.status(500).json({error: error.message});
    }
  });
});


// Take the text parameter passed to this HTTP endpoint and insert it into
// Firestore under the path /messages/:documentId/original
exports.addMessage = onRequest((req, res) => {
  cors(req, res, async () => {
    const original = req.query.text;

    if (typeof original !== "string") {
      res.status(400).json({error: "Missing or invalid 'text' parameter."});
      return;
    }

    try {
      const writeResult = await getFirestore()
          .collection("messages")
          .add({original});

      res.json({result: `Message with ID: ${writeResult.id} added.`});
    } catch (error) {
      res.status(500).json({error: "Internal Server Error"});
    }
  });
});

// Listens for new messages added to /messages/:documentId
// and saves an uppercased version of the message
// to /messages/:documentId/uppercase
exports.makeUppercase = onDocumentCreated("/messages/{documentId}", (event) => {
  const original = event.data.data().original;

  if (typeof original !== "string") {
    logger.warn(
        "No valid 'original' field in document:",
        event.params.documentId,
    );
    return null;
  }

  const uppercase = original.toUpperCase();

  logger.log("Uppercasing", event.params.documentId, original);
  logger.log("New value", uppercase);

  return event.data.ref.set({uppercase}, {merge: true});
});

