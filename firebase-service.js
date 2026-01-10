// js/firebase-service.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth };

export const loginUser = async () => {
    const provider = new GoogleAuthProvider();
    return await signInWithPopup(auth, provider);
};

export const logoutUser = async () => {
    return await signOut(auth);
};

export const saveUserData = async (uid, data) => {
    const userDocRef = doc(db, 'users', uid);
    // Convert complex objects to JSON strings if needed, or save as is
    await setDoc(userDocRef, {
        data: JSON.stringify(data.transactions),
        categories: JSON.stringify(data.categories),
        rules: JSON.stringify(data.rules),
        lastUpdated: new Date()
    });
};

export const loadUserData = async (uid) => {
    const userDocRef = doc(db, 'users', uid);
    const docSnap = await getDoc(userDocRef);
    if (docSnap.exists()) {
        const d = docSnap.data();
        return {
            transactions: d.data ? JSON.parse(d.data) : [],
            categories: d.categories ? JSON.parse(d.categories) : [],
            rules: d.rules ? JSON.parse(d.rules) : []
        };
    }
    return null;
};