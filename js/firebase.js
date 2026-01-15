import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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

// CORRECTED EXPORTS
// Re-export Auth functions from the Auth SDK
export { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

// Re-export Firestore functions from the Firestore SDK
export { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
