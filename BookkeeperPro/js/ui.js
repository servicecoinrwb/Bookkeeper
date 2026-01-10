// js/ui.js
import { state } from "./state.js";
import { formatCurrency } from "./utils.js";

export const renderDashboard = () => {
    const income = state.transactions
        .filter(t => t.amount >= 0 && t.category !== 'Transfer')
        .reduce((sum, t) => sum + t.amount, 0);

    const expense = state.transactions
        .filter(t => t.amount < 0 && t.category !== "Owner's Draw" && t.category !== "Transfer")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const draws = state.transactions
        .filter(t => t.amount < 0 && t.category === "Owner's Draw")
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const net = income - expense;

    document.getElementById('total-income').textContent = formatCurrency(income);
    document.getElementById('total-expense').textContent = formatCurrency(expense);
    document.getElementById('total-draws').textContent = formatCurrency(draws);
    document.getElementById('net-total').textContent = formatCurrency(net);
};

export const renderTransactions = () => {
    const tbody = document.getElementById('transaction-table');
    tbody.innerHTML = '';

    // Sort by date desc
    const sorted = [...state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(tx => {
        const row = document.createElement('tr');
        const amountClass = tx.amount >= 0 ? 'text-green-600' : 'text-red-600';

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(tx.date).toLocaleDateString()}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${tx.description}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${amountClass}">${formatCurrency(tx.amount)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm"><span class="px-2 py-1 rounded bg-gray-100 text-xs">${tx.category}</span></td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${tx.job || '-'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button class="edit-btn text-indigo-600 hover:text-indigo-900" data-id="${tx.id}">Edit</button>
            </td>
        `;
        tbody.appendChild(row);
    });
};

export const populateCategorySelect = (selectId) => {
    const select = document.getElementById(selectId);
    select.innerHTML = state.categories.map(c => `<option value="${c}">${c}</option>`).join('');
};