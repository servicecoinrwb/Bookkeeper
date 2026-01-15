import { State } from './state.js';
import { UI } from './ui.js';
import { Handlers } from './handlers.js';
import { auth, onAuthStateChanged, signInWithPopup, signOut, provider, doc, getDoc, db } from './firebase.js';

window.App = { ui: UI, handlers: Handlers };

document.addEventListener('DOMContentLoaded', () => {
    UI.init();
    Handlers.loadSession();

    // Helper to safely add event listeners without crashing
    const addListener = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        } else {
            console.warn(`Skipping missing element: ${id}`);
        }
    };

    // File Inputs
    addListener('csv-file', 'change', (e) => Handlers.importCSV(e.target.files[0]));
    addListener('invoice-csv-file', 'change', (e) => { /* Add Invoice Import Handler if needed */ });

    // Filters
    const setupFilter = (id, field) => { 
        const el = document.getElementById(id); 
        if(el) el.addEventListener('change', (e) => { 
            State.filters[field] = e.target.value; 
            Handlers.refreshAll(); 
        }); 
    };
    setupFilter('year-filter', 'year'); 
    setupFilter('month-filter', 'month'); 
    setupFilter('mobile-year-filter', 'year'); 
    setupFilter('mobile-month-filter', 'month');

    // Search & Inputs
    addListener('tx-search', 'input', () => UI.renderTransactions());
    addListener('ar-search', 'input', () => UI.renderAR()); // Add AR search handler logic if separate
    addListener('ap-search', 'input', () => UI.renderAP()); // Add AP search handler logic if separate
    addListener('tax-rate-input', 'input', () => UI.renderTaxes());
    addListener('recon-input', 'input', () => UI.updateReconCalc());

    // Buttons (Fixed IDs to match your HTML)
    addListener('save-session-btn', 'click', Handlers.saveSession);
    addListener('add-rule-btn', 'click', Handlers.addRule); // Fixed ID
    addListener('btn-save-tx', 'click', Handlers.saveTransactionEdit);
    addListener('ap-ar-save-button', 'click', Handlers.saveApAr); // Fixed ID
    addListener('clear-session-button', 'click', () => UI.openModal('confirm-modal')); // Fixed ID
    addListener('confirm-delete-button', 'click', Handlers.clearData); // Fixed ID
    addListener('add-new-category-btn', 'click', Handlers.addCategory); // Fixed ID
    
    // Feature Buttons
    addListener('export-button', 'click', Handlers.exportToIIF);
    addListener('start-reconcile-btn', 'click', () => UI.openModal('reconcile-modal'));
    addListener('rules-button', 'click', () => UI.openModal('rules-modal'));
    addListener('add-category-button', 'click', () => UI.openModal('category-modal'));
    addListener('add-invoice-button', 'click', () => Handlers.openApArModal('ar'));
    addListener('add-bill-button', 'click', () => Handlers.openApArModal('ap'));

    // Auth
    addListener('login-btn', 'click', () => signInWithPopup(auth, provider));
    addListener('logout-btn', 'click', () => signOut(auth));

    onAuthStateChanged(auth, (user) => {
        State.user = user;
        if(user) {
            const loginBtn = document.getElementById('login-btn');
            const profile = document.getElementById('user-profile');
            const name = document.getElementById('user-name');
            const avatar = document.getElementById('user-avatar');
            const userInfo = document.getElementById('user-info'); // Check which ID is used in HTML

            if(loginBtn) loginBtn.classList.add('hidden');
            if(profile) profile.classList.remove('hidden');
            if(userInfo) userInfo.classList.remove('hidden'); // Handle both versions
            if(name) name.textContent = user.displayName;
            if(avatar) avatar.src = user.photoURL;
            
            Handlers.loadSession();
        } else {
            const loginBtn = document.getElementById('login-btn');
            const profile = document.getElementById('user-profile');
            const userInfo = document.getElementById('user-info');

            if(loginBtn) loginBtn.classList.remove('hidden');
            if(profile) profile.classList.add('hidden');
            if(userInfo) userInfo.classList.add('hidden');
        }
    });
});
