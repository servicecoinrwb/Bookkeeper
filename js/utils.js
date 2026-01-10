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
    toast.className = `fixed top-5 right-5 py-2 px-4 rounded-lg shadow-md transition-transform duration-300 z-50 ${isError ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`;
    toast.style.transform = 'translateX(0)';
    setTimeout(() => {
        toast.style.transform = 'translateX(150%)';
    }, 3000);
};

export const exportToIIF = (transactions) => {
    // Basic QuickBooks IIF Export
    let content = `!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n`;
    content += `!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM\tMEMO\n`;
    content += `!ENDTRNS\n`;

    transactions.forEach(tx => {
        const date = new Date(tx.date).toLocaleDateString('en-US', {month: '2-digit', day: '2-digit', year: 'numeric'});
        const type = tx.amount < 0 ? 'EXPENSE' : 'DEPOSIT';
        const accnt = tx.category === 'Uncategorized' ? 'Ask Accountant' : tx.category;
        const amount = tx.amount.toFixed(2);
        
        content += `TRNS\t\t${type}\t${date}\tChecking\t${tx.job || ''}\t${amount}\t\t${tx.description}\n`;
        content += `SPL\t\t${type}\t${date}\t${accnt}\t\t${-amount}\t\t\n`;
        content += `ENDTRNS\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quickbooks_import.iif';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};
