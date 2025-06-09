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
import PromisePool from "es6-promise-pool";
import { getSaleInfoFromMls, rankGuesses } from './scrape.js';

const cors = corsLib({ origin: true });
const MAX_CONCURRENT = 3;

// Initialize Firebase Admin SDK
initializeApp();

// Add a guess to Firestore
export const addGuess = onRequest((req, res) => {
  cors(req, res, async () => {
    const data = req.body.data;

    if (!data) {
      res.status(400).json({ error: "Missing data field" });
      return;
    }

    const result = await updateData(data);
    if (result.error) {
      return res.status(500).json(result);
    }
    return res.json(result);
  });
});

// Load results for sold MLS IDs
export const loadResult = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const mlsIds = Array.isArray(req.query.mls) ? req.query.mls : [req.query.mls];
      const userId = req.query.userId;

      const querySnapshot = await getFirestore()
        .collection("mls")
        .where("status", "==", "Sold")
        .where("__name__", "in", mlsIds)
        .get();

      const user = await getFirestore().collection("users").doc(userId).get();
      const result = querySnapshot.docs.map(doc => ({
        mlsId: doc.id,
        winPrice: doc.data().winPrice,
        rank: user.data()?.guesses[doc.id]?.rank ?? null
      }));

      return res.json(result);
    } catch (error) {
      return res.status(500).json(error);
    }
  });
});

// Fetch top active MLS listings
export const fetchTop = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const userId = req.query.userId;
      const limit = req.query.limit ? Number(req.query.limit) : 5;

      const topMLS = await getFirestore()
        .collection("mls")
        .where("status", "==", "Active")
        .orderBy("accessCnt", "desc")
        .limit(limit)
        .get();

      const result = {};
      topMLS.forEach(doc => {
        result[doc.id] = doc.data();
      });

      return res.json(result);
    } catch (error) {
      return res.status(500).json(error);
    }
  });
});

// Update data in Firestore
export const updateData = async (data) => {
  try {
    const usersUpdate = { [`guesses.${data.mlsId}.price`]: data.price };
    await getFirestore().collection("users").doc(data.userId).update(usersUpdate, { merge: true });

    const guessUpdate = { [`guesses.${data.userId}`]: data.price };
    await getFirestore().collection("guesses").doc(data.mlsId).update(guessUpdate, { merge: true });

    const mlsDoc = await getFirestore().collection("mls").doc(data.mlsId).get();
    const mlsUpdate = {
      lastAcessTime: Date.now(),
      status: "Active", // Assuming the status is always "Active" when updating as we will need to scrape the website
      url: data.url ?? "",
      accessCnt: mlsDoc.exists ? mlsDoc.data().accessCnt + 1 : 1
    };

    await getFirestore().collection("mls").doc(data.mlsId).update(mlsUpdate, { merge: true });
    return { result: "Success" };
  } catch (error) {
    return { error: error.message };
  }
};

// Scheduled task to scrape website daily
export const scrapeWeb = onSchedule("every day 00:00", async () => {
  const promisePool = new PromisePool(handleActiveListing, MAX_CONCURRENT);
  await promisePool.start();
  logger.log("Active listings scraped and handled");
});

// Handle active MLS listings
export const handleActiveListing = async () => {
  const activeList = await getFirestore().collection("mls").where("status", "==", "Active").get();

  if (activeList.empty) {
    console.log("No matching documents.");
    return;
  }

  activeList.forEach(async (doc) => {
    const result = await getSaleInfoFromMls(doc.id);
    console.log("Scraped result:", result);

    if (result.status === "Sold") {
      const guesses = await getFirestore().collection("guesses").doc(doc.id).get();
      const priceNumber = Number(result.price.replace(/[^0-9.]/g, ""));
      const ranks = rankGuesses(guesses.data().guesses, priceNumber);

      const mlsUpdate = {
        status: "Sold",
        soldPrice: priceNumber,
        winPrice: null,
        winUser: null
      };

      for (const [userId, [rank, price]] of Object.entries(ranks)) {
        if (rank === 1) {
          mlsUpdate.winPrice = price;
          mlsUpdate.winUser = userId;
        }

        const usersUpdate = { [`guesses.${doc.id}.rank`]: rank };
        await getFirestore().collection("users").doc(userId).update(usersUpdate, { merge: true });
      }

      await getFirestore().collection("mls").doc(doc.id).update(mlsUpdate, { merge: true });
    }
  });
};

// const result1 = await updateData({userId: '1', mlsId: 'ML81982609', price: 1500000});
// const result2 = await updateData({userId: '2', mlsId: 'ML81982609', price: 1200000});
// const result3 = await updateData({userId: '3', mlsId: 'ML81982609', price: 1300000});
// const result4 = await updateData({userId: '4', mlsId: 'ML81952222', price: 1000000});
// const result = await handleActiveListing();