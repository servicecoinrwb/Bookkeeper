import { DEFAULT_CATEGORIES, DEFAULT_RULES } from "./config.js";
import { saveUserData } from "./firebase-service.js";

class AppState {
    constructor() {
        this.transactions = [];
        this.categories = [...DEFAULT_CATEGORIES];
        this.rules = [...DEFAULT_RULES];
        this.currentUser = null;
    }

    setData(data) {
        if (data.transactions) this.transactions = data.transactions;
        if (data.categories) this.categories = data.categories;
        if (data.rules) this.rules = data.rules;
    }

    addTransactions(newTxs) {
        this.transactions.push(...newTxs);
        this.persist();
    }

    updateTransaction(id, updates) {
        const tx = this.transactions.find(t => t.id === id);
        if (tx) {
            Object.assign(tx, updates);
            this.persist();
        }
    }

    clear() {
        this.transactions = [];
        this.categories = [...DEFAULT_CATEGORIES];
        localStorage.removeItem('bookkeeperSession');
    }

    async persist() {
        if (this.currentUser) {
            await saveUserData(this.currentUser.uid, {
                transactions: this.transactions,
                categories: this.categories,
                rules: this.rules
            });
        } else {
            localStorage.setItem('bookkeeperSession', JSON.stringify(this.transactions));
            localStorage.setItem('bookkeeperCategories', JSON.stringify(this.categories));
            localStorage.setItem('bookkeeperRules', JSON.stringify(this.rules));
        }
    }
}

export const state = new AppState();
