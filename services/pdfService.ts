import { Platform } from 'react-native';
import * as Print from 'react-native-print';
import type { Client } from '../types/client';
import type { User } from '../types/models';

export interface InvoiceItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'startingBalance' | 'job' | 'payment';
}

export interface InvoiceData {
  client: Client & { balance: number };
  userProfile: User | null;
  invoiceItems: InvoiceItem[];
  runningBalance: number;
}

/**
 * Generate HTML content for the invoice PDF
 */
export const generateInvoiceHTML = (data: InvoiceData): string => {
  const { client, userProfile, invoiceItems, runningBalance } = data;
  
  const addressParts = [client.address1, client.town, client.postcode].filter(Boolean);
  const displayAddress = addressParts.length > 0
    ? addressParts.join(', ')
    : client.address || 'No address';

  const currentDate = new Date().toLocaleDateString('en-GB');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice - ${client.name}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          line-height: 1.3;
          color: #333;
          background: #fff;
          padding: 15px;
        }
        
        .invoice-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          padding: 15px;
          background: #f9f9f9;
          border-radius: 6px;
        }
        
        .company-info h1 {
          font-size: 20px;
          font-weight: bold;
          color: #1976d2;
          margin-bottom: 4px;
        }
        
        .company-info p {
          color: #666;
          margin-bottom: 2px;
          font-size: 11px;
        }
        
        .invoice-details {
          text-align: right;
        }
        
        .invoice-title {
          font-size: 26px;
          font-weight: bold;
          color: #1976d2;
          margin-bottom: 4px;
        }
        
        .invoice-meta {
          color: #666;
          font-size: 11px;
        }
        
        .client-section {
          margin-bottom: 18px;
          padding: 12px;
          background: #f9f9f9;
          border-radius: 6px;
        }
        
        .section-title {
          font-size: 14px;
          font-weight: bold;
          margin-bottom: 6px;
          color: #333;
        }
        
        .client-name {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 4px;
        }
        
        .client-details {
          font-size: 11px;
          color: #666;
        }
        
        .balance-section {
          margin-bottom: 18px;
          padding: 12px;
          background: #f9f9f9;
          border-radius: 6px;
        }
        
        .balance-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .balance-amount {
          font-size: 20px;
          font-weight: bold;
          color: #f44336;
        }
        
        .account-history {
          margin-bottom: 20px;
        }
        
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 8px;
          font-size: 11px;
        }
        
        .table th {
          background: #f5f5f5;
          padding: 6px 4px;
          text-align: left;
          font-weight: bold;
          border-bottom: 1px solid #ddd;
          font-size: 10px;
        }
        
        .table td {
          padding: 4px 4px;
          border-bottom: 1px solid #eee;
          vertical-align: top;
        }
        
        .table tr:nth-child(even) {
          background: #f9f9f9;
        }
        
        .amount-positive {
          color: #f44336;
        }
        
        .amount-negative {
          color: #4CAF50;
        }
        
        .balance-positive {
          color: #4CAF50;
        }
        
        .balance-negative {
          color: #f44336;
        }
        
        .payment-instructions {
          padding: 12px;
          background: #f9f9f9;
          border-radius: 6px;
        }
        
        .instruction-text {
          margin-bottom: 4px;
          color: #666;
          font-size: 11px;
        }
        
        .instruction-highlight {
          font-weight: bold;
          color: #333;
        }
        
        @media print {
          body {
            padding: 10px;
            font-size: 11px;
          }
          
          .invoice-header {
            page-break-inside: avoid;
            margin-bottom: 15px;
            padding: 12px;
          }
          
          .table {
            page-break-inside: auto;
          }
          
          .table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          
          .table th {
            padding: 4px 3px;
          }
          
          .table td {
            padding: 3px 3px;
          }
          
          .section-title {
            font-size: 13px;
          }
          
          .balance-amount {
            font-size: 18px;
          }
        }
      </style>
    </head>
    <body>
      <!-- Invoice Header -->
      <div class="invoice-header">
        <div class="company-info">
          <h1>${userProfile?.businessName || 'Your Company Name'}</h1>
          <p>${userProfile?.address || 'Your Company Address'}</p>
          <p>Phone: ${userProfile?.phone || 'Your Phone'}</p>
        </div>
        
        <div class="invoice-details">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-meta">
            <p>Date: ${currentDate}</p>
            <p>Invoice #: ${client.accountNumber || 'N/A'}</p>
          </div>
        </div>
      </div>

      <!-- Client Information -->
      <div class="client-section">
        <div class="section-title">Bill To:</div>
        <div class="client-name">${client.name || 'No name'}</div>
        <div class="client-details">
          <p>${displayAddress}</p>
          ${client.accountNumber ? `<p>Account: ${client.accountNumber}</p>` : ''}
        </div>
      </div>

      <!-- Balance Summary -->
      <div class="balance-section">
        <div class="balance-row">
          <span class="section-title">Outstanding Balance:</span>
          <span class="balance-amount">£${Math.abs(client.balance).toFixed(2)}</span>
        </div>
      </div>

      <!-- Account History -->
      <div class="account-history">
        <div class="section-title">Account History</div>
        
        <table class="table">
          <thead>
            <tr>
              <th style="width: 15%;">Date</th>
              <th style="width: 50%;">Description</th>
              <th style="width: 15%;">Amount</th>
              <th style="width: 20%;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${invoiceItems.map((item, index) => {
              let runningTotal = (client.startingBalance || 0);
              for (let i = 0; i <= index; i++) {
                runningTotal += invoiceItems[i].amount;
              }
              
              const formattedDate = item.type === 'startingBalance' 
                ? 'Opening' 
                : new Date(item.date).toLocaleDateString('en-GB');
              
              return `
                <tr>
                  <td>${formattedDate}</td>
                  <td>${item.description}</td>
                  <td class="${item.amount >= 0 ? 'amount-positive' : 'amount-negative'}">
                    ${item.amount >= 0 ? '+' : ''}£${item.amount.toFixed(2)}
                  </td>
                  <td class="${runningTotal >= 0 ? 'balance-positive' : 'balance-negative'}">
                    £${runningTotal.toFixed(2)}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- Payment Instructions -->
      <div class="payment-instructions">
        <div class="section-title">Payment Instructions</div>
        <p class="instruction-text">
          Please settle your balance of <span class="instruction-highlight">£${Math.abs(client.balance).toFixed(2)}</span>
        </p>
        ${userProfile?.bankSortCode && userProfile?.bankAccountNumber ? `
          <p class="instruction-text">Sort Code: <span class="instruction-highlight">${userProfile.bankSortCode}</span></p>
          <p class="instruction-text">Account Number: <span class="instruction-highlight">${userProfile.bankAccountNumber}</span></p>
        ` : ''}
        <p class="instruction-text">
          Reference: <span class="instruction-highlight">${client.accountNumber || 'Your Account Number'}</span>
        </p>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate and download PDF for the invoice
 */
export const generateInvoicePDF = async (data: InvoiceData): Promise<void> => {
  try {
    const html = generateInvoiceHTML(data);
    const fileName = `Invoice-${data.client.accountNumber || data.client.name}-${new Date().toISOString().split('T')[0]}`;

    if (Platform.OS === 'web') {
      // Web platform: Use browser's print functionality
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
        
        // Close the window after printing
        printWindow.onafterprint = () => {
          printWindow.close();
        };
      } else {
        throw new Error('Unable to open print window. Please check your browser\'s popup settings.');
      }
    } else {
      // Mobile platform: Use react-native-print
      const options = {
        html,
        fileName,
        width: 612,
        height: 792,
        base64: false,
      };

      await Print.print(options);
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF. Please try again.');
  }
};

/**
 * Check if PDF generation is supported on the current platform
 */
export const isPDFGenerationSupported = (): boolean => {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && 'print' in window;
  }
  return true; // react-native-print supports iOS and Android
}; 