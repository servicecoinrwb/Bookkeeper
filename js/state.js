export const State = {
    user: null,
    data: [],
    currentView: 'dashboard',
    filters: { 
        year: 'all', 
        month: 'all', 
        search: '' 
    },
    
    // Default Categories
    categories: [
        'Income', 'COGS', 'Materials', 'Labor', 
        'Fuel', 'Rent', 'Utilities', 'Owner Draw', 
        'Transfer', 'Uncategorized'
    ],

    // Methods to manipulate data
    addTransactions(newTxs) {
        this.data = [...this.data, ...newTxs];
    },

    clearData() {
        this.data = [];
    }
};
