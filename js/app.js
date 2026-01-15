import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

// Expose App Global for HTML onclick="" events
window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession(); // Try local load first

    // Core Listeners
    document.getElementById('csv-file').addEventListener('change', (e) => Handlers.importCSV(e.target.files[0]));
    document.getElementById('save-session-btn').addEventListener('click', Handlers.saveSession);
    
    // Filters
    document.getElementById('year-filter').addEventListener('change', (e) => { State.filters.year = e.target.value; UI.updateDashboard(); UI.switchTab(State.currentView); });
    document.getElementById('month-filter').addEventListener('change', (e) => { State.filters.month = e.target.value; UI.updateDashboard(); UI.switchTab(State.currentView); });
    
    // Auth
    document.getElementById('login-btn').addEventListener('click', () => signInWithPopup(auth, provider));
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
    
    // Transaction Actions
    document.getElementById('btn-save-tx').addEventListener('click', Handlers.saveTransactionEdit);
    document.getElementById('tx-search').addEventListener('input', () => UI.renderTransactions());
    
    // Feature Buttons
    const exportBtn = document.getElementById('btn-export');
    if(exportBtn) exportBtn.addEventListener('click', Handlers.exportToIIF);

    // Auth State Logic
    onAuthStateChanged(auth, (user) => {
        State.user = user;
        if(user) {
            document.getElementById('login-btn').classList.add('hidden');
            document.getElementById('user-profile').classList.remove('hidden');
            document.getElementById('user-name').textContent = user.displayName;
            document.getElementById('user-avatar').src = user.photoURL;
            Handlers.loadSession(); // Load cloud data
        } else {
            document.getElementById('login-btn').classList.remove('hidden');
            document.getElementById('user-profile').classList.add('hidden');
            // Guest mode: rely on what was loaded from local storage in init
        }
    });
});
