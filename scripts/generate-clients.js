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
  const visitFrequency = 4;
  const startingDate = '2025-07-02';
  const startingBalance = 0;

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
  ].join(','));
}

const csvContent = header + rows.join('\n') + '\n';

fs.writeFileSync(outputPath, csvContent, 'utf8');
console.log(`Generated ${rows.length} client rows at ${outputPath}`); 