// js/ui.js - Render transactions function update
export const renderTransactions = () => {
    const tbody = document.getElementById('transaction-table');
    tbody.innerHTML = ''; 
    
    // Sort and limit
    const sorted = state.transactions
        .filter(t => (!t.type || t.type === 'transaction') && fastFilterByDate(t))
        .sort((a, b) => (a.date < b.date ? 1 : -1));

    const limit = 100;
    const subset = sorted.slice(0, limit);

    let html = '';
    for (let i = 0; i < subset.length; i++) {
        const tx = subset[i];
        const amountClass = tx.amount >= 0 ? 'text-green-600' : 'text-red-600';
        const dateStr = tx.date.substring(0, 10); 

        html += `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-2 py-3 text-center">
                    <input type="checkbox" class="h-4 w-4 text-indigo-600" data-id="${tx.id}" ${tx.reconciled ? 'checked' : ''}>
                </td>
                <td class="px-6 py-3 text-sm text-gray-500">${dateStr}</td>
                <td class="px-6 py-3 text-sm text-gray-900 truncate max-w-xs" title="${tx.description}">${tx.description}</td>
                <td class="px-6 py-3 text-sm font-medium ${amountClass}">${formatCurrency(tx.amount)}</td>
                <td class="px-6 py-3 text-sm"><span class="px-2 py-1 rounded bg-gray-100 text-xs font-semibold">${tx.category}</span></td>
                <td class="px-6 py-3 text-sm text-gray-500">${tx.job || '-'}</td>
                <td class="px-6 py-3 text-right text-sm"><button class="edit-btn text-indigo-600 hover:text-indigo-900 font-medium" data-id="${tx.id}">Edit</button></td>
            </tr>
        `;
    }
    // ... rest of file logic
    tbody.innerHTML = html;
};
// ... rest of exports
