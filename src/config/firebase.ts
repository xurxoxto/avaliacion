// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { enableIndexedDbPersistence, initializeFirestore } from 'firebase/firestore';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBDpBLvhKw5zCeATrBWn_L-emkaS_pjRJQ",
  authDomain: "avaliacioncompetencias.firebaseapp.com",
  projectId: "avaliacioncompetencias",
  storageBucket: "avaliacioncompetencias.firebasestorage.app",
  messagingSenderId: "487567899638",
  appId: "1:487567899638:web:30b047c1318f7c4111a5d7"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Safari can block Firestore's default streaming transport with
// "Fetch API cannot load ... due to access control checks".
// Auto-detect long polling fixes this without affecting other browsers.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});

// Cloud-first sync. If the network drops temporarily, Firestore can queue writes locally
// and sync them when connectivity returns.
enableIndexedDbPersistence(db).catch(() => {
  // Ignore (e.g. multiple tabs, private mode)
});
