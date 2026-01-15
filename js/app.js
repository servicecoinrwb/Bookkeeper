import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

// 1. Initialize UI
document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    
    // Check Local Storage first
    const localData = localStorage.getItem('bk_data');
    if(localData) {
        State.data = JSON.parse(localData);
        UI.renderDashboard();
    }
});

// 2. Event Listeners
document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('csv-file').click();
});

document.getElementById('csv-file').addEventListener('change', (e) => {
    if(e.target.files[0]) Handlers.handleImport(e.target.files[0]);
});

document.getElementById('save-btn').addEventListener('click', Handlers.saveSession);

// Navigation Tabs
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => UI.switchTab(btn.dataset.tab));
});

// 3. Auth Listeners
document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, provider));
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    State.user = user;
    if(user) {
        // User is Signed In
        document.getElementById('login-btn').classList.add('hidden');
        document.getElementById('user-profile').classList.remove('hidden');
        document.getElementById('user-name').textContent = user.displayName;
        document.getElementById('user-avatar').src = user.photoURL;
        
        // Load Cloud Data
        const snap = await getDoc(doc(db, 'users', user.uid));
        if(snap.exists()) {
            State.data = JSON.parse(snap.data().data || '[]');
            UI.renderDashboard();
            UI.renderTransactions();
        }
    } else {
        // User is Signed Out (Guest Mode)
        document.getElementById('login-btn').classList.remove('hidden');
        document.getElementById('user-profile').classList.add('hidden');
        
        // Fallback to Local Storage instead of clearing everything
        const localData = localStorage.getItem('bk_data');
        if(localData) {
            State.data = JSON.parse(localData);
        } else {
            State.data = []; 
        }
        UI.renderDashboard();
    }
});
