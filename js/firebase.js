import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBwuxBEU2Yt-QGtCbnyOYf7sEfqjTG0agc",
    authDomain: "bookkeeper-478720.firebaseapp.com",
    projectId: "bookkeeper-478720",
    storageBucket: "bookkeeper-478720.firebasestorage.app",
    messagingSenderId: "46086691914",
    appId: "1:46086691914:web:f6e33d544943dd24ab9ab3",
    measurementId: "G-4WCP4Q5ZBZ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

export { signInWithPopup, signOut, doc, getDoc, setDoc, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
// Note: You might need to adjust imports depending on specific firebase module exports
