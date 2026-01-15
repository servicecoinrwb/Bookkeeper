import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    // Helper to safely add event listeners
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
        // Note: We silent fail here because some buttons use onclick="" in HTML now
    };

    // --- Inputs & Filters ---
    addListener('csv-file', 'change', (e) => Handlers.importCSV(e.target.files[0]));
    
    // Desktop Filters
    addListener('year-filter', 'change', (e) => { State.filters.year = e.target.value; Handlers.refreshAll(); });
    addListener('month-filter', 'change', (e) => { State.filters.month = e.target.value; Handlers.refreshAll(); });
    
    // Mobile Filters
    addListener('mobile-year-filter', 'change', (e) => { State.filters.year = e.target.value; Handlers.refreshAll(); });
    addListener('mobile-month-filter', 'change', (e) => { State.filters.month = e.target.value; Handlers.refreshAll(); });

    // Live Search
    addListener('tx-search', 'input', () => UI.renderTransactions());
    
    // Calculators
    addListener('tax-rate-input', 'input', () => UI.renderTaxes());
    addListener('recon-input', 'input', () => UI.updateReconCalc());

    // --- Action Buttons (IDs Fixed to match new HTML) ---
    addListener('save-session-btn', 'click', Handlers.saveSession);
    addListener('btn-add-rule', 'click', Handlers.addRule); // Fixed ID
    addListener('btn-save-tx', 'click', Handlers.saveTransactionEdit);
    addListener('btn-save-apar', 'click', Handlers.saveApAr); // Fixed ID
    
    // Clear Data Flow
    addListener('clear-session-btn', 'click', () => UI.openModal('confirm-modal')); // Fixed ID
    addListener('btn-confirm-clear', 'click', Handlers.clearData); // Fixed ID
    
    // Categories & Export
    addListener('btn-add-cat', 'click', Handlers.addCategory); // Fixed ID
    addListener('btn-export', 'click', Handlers.exportToIIF); // Fixed ID

    // --- Auth ---
    addListener('login-btn', 'click', () => signInWithPopup(auth, provider));
    addListener('logout-btn', 'click', () => signOut(auth));

    onAuthStateChanged(auth, (user) => {
        State.user = user;
        const loginBtn = document.getElementById('login-btn');
        const profile = document.getElementById('user-profile');
        const name = document.getElementById('user-name');
        const avatar = document.getElementById('user-avatar');

        if(user) {
            if(loginBtn) loginBtn.classList.add('hidden');
            if(profile) profile.classList.remove('hidden');
            if(name) name.textContent = user.displayName;
            if(avatar) avatar.src = user.photoURL;
            Handlers.loadSession();
        } else {
            if(loginBtn) loginBtn.classList.remove('hidden');
            if(profile) profile.classList.add('hidden');
        }
    });
});
