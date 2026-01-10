// js/firebase-service.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { FIREBASE_CONFIG } from "./config.js";

// Initialize Firebase
const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// Export the auth instance so app.js can use it
export { auth };

// --- Auth Functions ---
export const loginUser = async () => {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("Login Error:", error);
        throw error;
    }
};

export const logoutUser = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout Error:", error);
    }
};

// --- Database Functions ---
export const saveUserData = async (uid, data) => {
    try {
        const userDocRef = doc(db, 'users', uid);
        await setDoc(userDocRef, {
            data: JSON.stringify(data.transactions),
            categories: JSON.stringify(data.categories),
            rules: JSON.stringify(data.rules),
            lastUpdated: new Date()
        });
        console.log("Saved to cloud");
    } catch (error) {
        console.error("Save Error:", error);
        throw error;
    }
};

export const loadUserData = async (uid) => {
    try {
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
    } catch (error) {
        console.error("Load Error:", error);
        return null;
    }
};
