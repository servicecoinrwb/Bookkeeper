export const Utils = {
    formatCurrency: (num) => {
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency: 'USD' 
        }).format(num);
    },

    parseDate: (str) => {
        const date = new Date(str);
        return isNaN(date) ? null : date;
    },

    generateId: (prefix = 'id') => {
        return `${prefix}-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    },

    formatDateForInput: (dateObj) => {
        return dateObj.toISOString().split('T')[0];
    }
};
