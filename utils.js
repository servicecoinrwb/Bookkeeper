// js/utils.js

export const formatCurrency = (amount) => {
    const value = parseFloat(amount);
    if (isNaN(value)) return '$0.00';
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

export const parseDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) ? date : null;
};

export const showToast = (message, isError = false) => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `fixed top-5 right-5 py-2 px-4 rounded-lg shadow-md transition-transform duration-300 ${isError ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`;
    toast.style.transform = 'translateX(0)';
    setTimeout(() => {
        toast.style.transform = 'translateX(150%)';
    }, 3000);
};