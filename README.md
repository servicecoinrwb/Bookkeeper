📘 Bookkeeper Pro

Bookkeeper Pro is a client-side web application designed to help HVAC businesses and other small service companies organize their financial data for easy import into QuickBooks Desktop.

It enables users to import bank transactions and invoices from CSV files, categorize expenses, track job profitability, manage payables and receivables, and generate key financial reports — all while keeping data private and local.

🔒 Privacy-First Design

Because the app runs entirely in the browser, all financial data stays on the user’s computer.
Nothing is uploaded to a server — ensuring complete privacy and secure offline persistence via local storage.

✨ Key Features
🏦 Bank Transaction Import

Upload CSV files from your bank.

Automatically merges new transactions without duplicates.

Supports weekly or monthly updates for ongoing bookkeeping.

📄 Invoice CSV Import

Import invoices exported from your service software (e.g., AppSheet).

Automatically populates Accounts Receivable (A/R).

📊 Comprehensive Dashboard

Get a live snapshot of your company’s financial health:

Total Income, Expenses, and Net Profit

Accounts Receivable (customer balances)

Accounts Payable (vendor balances)

Count of unreconciled transactions

Visual “PAST DUE” alert for invoices > 60 days

💼 Detailed Job Costing

Assign each transaction to a job or customer to view per-project profitability in the Job Profitability tab.

📥 A/R and A/P Management

Manually add or import invoices and bills.

Track paid/unpaid status for accurate cash-flow management.

📈 Financial Reporting

Profit & Loss Statement: income and expenses by category.

A/R & A/P Aging Reports: automatically groups balances by aging buckets (current, 1-30, 31-60, > 60 days).

🔍 Bank Reconciliation

A simple checkbox system lets you mark off cleared transactions while reviewing your bank statements.

💾 QuickBooks Desktop Export

Generate a ready-to-import .iif file, eliminating hours of manual entry.

🧠 Built-in HVAC Bookkeeping Guide

A quick reference section covering best practices for:

Bank Reconciliation

Job Costing

Financial Organization

🧭 How to Use
1️⃣ Load Data

Open index.html in your browser.

Upload or drag-and-drop your bank CSV file.

If you’ve used the app before, your previous session will auto-load from local storage.

2️⃣ Import Invoices

Navigate to the A/R (Invoices) tab.

Click “Import Invoice CSV” and upload from your service software.

3️⃣ Categorize & Assign Jobs

Go to the Transactions tab.

Click Edit on each record to select a Category and Job/Customer.

4️⃣ Manage Bills & Invoices

Add new bills in the A/P (Bills) tab.

As payments appear in your bank feed, mark matching invoices/bills as Paid.

5️⃣ Reconcile Accounts

Compare against your monthly bank statement.

Use the Rec checkbox to mark reconciled transactions.

The dashboard’s Unreconciled Count helps track progress.

6️⃣ Review Reports

Visit the Reports tab.

View P&L and Aging Reports, filtered by date range.

7️⃣ Export to QuickBooks

In the Transactions tab, enter your QuickBooks bank account and default expense account names.

Click Export to QuickBooks (.iif) to download your import file.

8️⃣ Save Your Work

Data saves automatically to local storage.

Optional “Save Session” and “Clear” buttons allow manual control.

🧩 Why It Matters

Bookkeeper Pro bridges the gap between modern financial data (CSV downloads) and traditional accounting workflows (QuickBooks Desktop).
It’s built specifically for service-based businesses like HVAC, plumbing, and electrical contractors who need a fast, offline-ready bookkeeping assistant.

⚙️ Tech Overview
Component	Description
Frontend	Vanilla JS + HTML + CSS (client-side only)
Storage	Browser LocalStorage
Security	100% offline – no external APIs or servers
Export	.iif file generation compatible with QuickBooks Desktop
🏁 Getting Started

Download or clone the repository.

Open index.html directly in your browser.

Start importing your CSV files — no installation required!

🧾 License

This project is released under the MIT License — free to use, modify, and distribute.

💬 Contributing

Contributions are welcome!
If you’d like to extend features (e.g., cloud sync, charting, or multi-user views), please open a pull request or issue.
