/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import corsLib from "cors";
const cors = corsLib({ origin: true });

import PromisePool from "es6-promise-pool";
// Maximum concurrent account deletions.
const MAX_CONCURRENT = 3;
import { getSaleInfoFromMls, rankGuesses } from './scrape.js';

// local test
initializeApp({
  projectId: 'guessprice-a08ba'
});
// initializeApp();

export const updateData = async (data) => {
  console.log(data);
  // * here we need transaction call and batch
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
    return {result: `Success`};
  } catch (error) {
    return {error: error.message};
  }
}

// Take the text parameter passed to this HTTP endpoint and insert it into
// Firestore under the path /messages/:documentId/original
export const addGuess = onRequest((req, res) => {
  cors(req, res, async () => {
    const data = req.body.data;

    if (!data) {
      res.status(400).json({error: "Missing data field"});
      return;
    }
    // * here we need transaction call and batch
    const result = await updateData(data);
    if (result.error) {
      return res.status(500).json(result);
    }
    return res.json(result);
  });
});

// Run once a day at midnight, to scrape website
// Manually run the task here https://console.cloud.google.com/cloudscheduler
export const scrapeWeb = onSchedule("every day 00:00", async (event) => {
  // Use a pool so that we delete maximum `MAX_CONCURRENT` users in parallel.
  const promisePool = new PromisePool(
      async () => handleActiveListing(),
      MAX_CONCURRENT,
  );
  await promisePool.start();

  logger.log("active listing scraped & hanled");
});

export const handleActiveListing = async () => {
  // fetch all active lisitng
  const activeList = await getFirestore().collection('mls').where('status', '==', 'Active').get();
  if (activeList.empty) {
    console.log('No matching documents.');
    return;
  }
  // * need concurrency handling
  activeList.forEach(async(doc) => {
    const result = await getSaleInfoFromMls(doc.id);
    if (result.status == 'Sold') {
      // do computation
      const guesses = await getFirestore().collection('guesses').doc(doc.id).get();
      const ranks = rankGuesses(guesses, result.price);
      // set mls status
      let mlsUpdate = {};
      mlsUpdate[`status`] = 'Sold';
      mlsUpdate[`winPrice`] = result.price;
      console.log(mlsUpdate);
      const mlsResult = await getFirestore()
          .collection("mls")
          .doc(doc.id)
          .update(mlsUpdate, { merge: true });
      // set user rank
      ranks.forEach(async(userId, rank) => {
        let usersUpdate = {};
        usersUpdate[`guesses.${doc.mlsId}.rank`] = rank
        console.log(usersUpdate);
        const userResult = await getFirestore()
            .collection("users")
            .doc(userId)
            .update(usersUpdate, { merge: true });
      });
    }
  });
}
