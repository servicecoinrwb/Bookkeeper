const today = new Date();

export const State = {
    user: null,
    data: [],
    // Added smarter rules based on your data
    rules: [
        { keyword: 'IRS', category: 'Payroll Expenses (Wages & Taxes)' },
        { keyword: 'Payroll', category: 'Payroll Expenses (Wages & Taxes)' },
        { keyword: 'Gusto', category: 'Payroll Expenses (Wages & Taxes)' },
        { keyword: 'ADP', category: 'Payroll Expenses (Wages & Taxes)' },
        { keyword: 'Intuit', category: 'Office Supplies & Software' }, // Often software/payroll
        { keyword: 'Speedway', category: 'Vehicle Expenses (Fuel, Repairs)' },
        { keyword: 'Shell', category: 'Vehicle Expenses (Fuel, Repairs)' },
        { keyword: 'BP', category: 'Vehicle Expenses (Fuel, Repairs)' },
        { keyword: 'Marathon', category: 'Vehicle Expenses (Fuel, Repairs)' },
        { keyword: 'Home Depot', category: 'COGS - Parts & Materials' },
        { keyword: 'Lowe', category: 'COGS - Parts & Materials' },
        { keyword: 'Supply', category: 'COGS - Parts & Materials' },
        { keyword: 'Trane', category: 'COGS - Equipment' },
        { keyword: 'Carrier', category: 'COGS - Equipment' },
        { keyword: 'Lennox', category: 'COGS - Equipment' },
        { keyword: 'Google', category: 'Marketing & Advertising' },
        { keyword: 'Stripe', category: 'Office Supplies & Software' }, // Or create a 'Merchant Fees' category
        { keyword: 'Transfer', category: 'Transfer' }
    ],
    currentView: 'dashboard',
    
    // Filters default to current month
    filters: { 
        year: today.getFullYear().toString(), 
        month: (today.getMonth() + 1).toString(), 
        search: '' 
    },
    
    // Default Categories
    categories: [
        'COGS - Equipment',
        'COGS - Parts & Materials',
        'Income (Sales/Service)',
        'Insurance',
        'Marketing & Advertising',
        'Office Supplies & Software',
        'Owner\'s Draw',
        'Payroll Expenses (Wages & Taxes)',
        'Permits & Licenses',
        'Rent/Lease',
        'Subcontractors',
        'Tools & Small Equipment',
        'Transfer',
        'Uncategorized',
        'Utilities',
        'Vehicle Expenses (Fuel, Repairs)'
    ]
};
