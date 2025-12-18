// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
