// js/config.js

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBwuxBEU2Yt-QGtCbnyOYf7sEfqjTG0agc",
    authDomain: "bookkeeper-478720.firebaseapp.com",
    projectId: "bookkeeper-478720",
    storageBucket: "bookkeeper-478720.firebasestorage.app",
    messagingSenderId: "46086691914",
    appId: "1:46086691914:web:f6e33d544943dd24ab9ab3",
    measurementId: "G-4WCP4Q5ZBZ"
};

export const DEFAULT_CATEGORIES = [
    'Income (Sales/Service)',
    'COGS - Equipment',
    'COGS - Parts & Materials',
    'Subcontractors',
    'Payroll Expenses (Wages & Taxes)',
    'Vehicle Expenses (Fuel, Repairs)',
    'Tools & Small Equipment',
    'Permits & Licenses',
    'Marketing & Advertising',
    'Insurance',
    'Office Supplies & Software',
    'Rent/Lease',
    'Utilities',
    'Owner\'s Draw',
    'Paycheck',
    'Transfer',
    'Uncategorized'
];

export const DEFAULT_RULES = [
    { keyword: 'Speedway', category: 'Vehicle Expenses (Fuel, Repairs)' },
    { keyword: 'Home Depot', category: 'COGS - Parts & Materials' },
    { keyword: 'Trane', category: 'COGS - Equipment' },
    { keyword: 'Gusto', category: 'Payroll Expenses (Wages & Taxes)' }
];
