const fs = require('fs');
const path = require('path');

// Path to output CSV
const outputPath = path.join(__dirname, '..', 'docs', 'example-clients.csv');

// Helper to pad numbers
const pad = (num, size) => num.toString().padStart(size, '0');

const header = [
  'Address Line 1',
  'Town',
  'Postcode',
  'Name',
  'Mobile Number',
  'Email',
  'Source',
  'Quote (£)',
  'Account Number',
  'Round Order',
  'Visit Frequency',
  'Starting Date',
  'Starting Balance',
  'Runsheet Note',
  'Account notes',
].join(',') + '\n';

const rows = [];

for (let i = 1; i <= 200; i++) {
  const address = `${i} Oak Street`;
  const town = 'Townsville';
  const postcode = 'TS1 1AA';
  const name = `Client ${i}`;
  const mobile = `0712345${pad(6000 + i, 3)}`; // simple unique number
  const email = `client${i}@example.com`;
  const source = 'Import';
  const quote = 25;
  const accountNumber = 1000 + i;
  const roundOrder = i;
  
  // Make visit frequency more varied to show flexibility
  const frequencies = [4, 6, 8, 12, 16, 24, 'one-off'];
  const visitFrequency = frequencies[i % frequencies.length];
  
  // Generate a date string between 3 and 31 July 2025 (dd/mm/yyyy)
  const day = 3 + ((i - 1) % 29); // cycles 3..31
  const startingDate = `${day.toString().padStart(2,'0')}/07/2025`;
  const startingBalance = 0;
  
  // Add example runsheet and account notes for some clients
  const runsheetNote = i % 5 === 0 ? `Special access: Use side gate for property ${i}` : '';
  const accountNotes = i % 7 === 0 ? `Customer prefers morning visits. Contact via mobile only.` : '';

  rows.push([
    address,
    town,
    postcode,
    name,
    mobile,
    email,
    source,
    quote,
    accountNumber,
    roundOrder,
    visitFrequency,
    startingDate,
    startingBalance,
    runsheetNote,
    accountNotes,
  ].join(','));
}

const csvContent = header + rows.join('\n') + '\n';

fs.writeFileSync(outputPath, csvContent, 'utf8');
console.log(`Generated ${rows.length} client rows at ${outputPath}`); 