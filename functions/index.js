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

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore} from "firebase-admin/firestore";
import corsLib from "cors";
const cors = corsLib({ origin: true });

import PromisePool from "es6-promise-pool";
// Maximum concurrent account deletions.
const MAX_CONCURRENT = 3;
import { getSaleInfoFromMls, rankGuesses } from './scrape.js';

// local test
initializeApp();

export const loadResult = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const mlsIds = Array.isArray(req.query.mls) ? req.query.mls : [req.query.mls];
      const userId = req.query.userId;
      // filter out sold mlsIds

      console.log(mlsIds);
      console.log(userId);

      const querySnapshot = await getFirestore().collection("mls")
        .where("status", "==", "Sold")
        .where("__name__", "in", mlsIds)
        .get();
      const user = await getFirestore().collection("users").doc(userId).get();
      // set winPrice and user rank
      let result = [];
      console.log(user.data());
      querySnapshot.forEach((doc) => {
        const mlsId = doc.id;
        const data = doc.data();
        result.push({
          mlsId: mlsId,
          winPrice: data.winPrice,
          rank: user.data()?.guesses[mlsId]?.rank ?? null  // safe access in case it's missing
        });
      });
      console.log("hereeeeeee");
      console.log(result);
      return res.json(result);
    } catch(error) {
      return res.status(500).json(error);
    }
  });
});

export const updateData = async (data) => {
  console.log(data);
  // * here we need transaction call and batch
  try {
    // update user table
    let usersUpdate = {};
    usersUpdate[`guesses.${data.mlsId}.price`] = data.price;
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
      console.log("------");
      console.log(guesses.data().guesses);
      console.log(result.price);
      console.log("------");
      const numericStr = result.price.replace(/[^0-9.]/g, ""); // "1580000"
      const priceNumber = Number(numericStr); // 1580000
      const ranks = rankGuesses(guesses.data().guesses, priceNumber);
      // set mls status
      let mlsUpdate = {};
      mlsUpdate[`status`] = 'Sold';
      mlsUpdate[`soldPrice`] = priceNumber;

      // set user rank
      for (const [userId, [rank, price]] of Object.entries(ranks)) {
        if (rank == 1) {
          mlsUpdate[`winPrice`] = price;
          mlsUpdate[`winUser`] = userId;
        }
        let usersUpdate = {};
        usersUpdate[`guesses.${doc.id}.rank`] = rank
        console.log(usersUpdate);
        const userResult = await getFirestore()
            .collection("users")
            .doc(userId)
            .update(usersUpdate, { merge: true });
      }

      console.log(mlsUpdate);
      const mlsResult = await getFirestore()
          .collection("mls")
          .doc(doc.id)
          .update(mlsUpdate, { merge: true });
    }
  });
}

// const result1 = await updateData({userId: '1', mlsId: 'ML81952283', price: 1500000});
// const result2 = await updateData({userId: '2', mlsId: 'ML81952283', price: 1200000});
// const result3 = await updateData({userId: '3', mlsId: 'ML81952283', price: 1300000});
// const result = await handleActiveListing();
