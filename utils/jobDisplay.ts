import type { Client } from '../types/client';
import type { Job } from '../types/models';
import { displayAccountNumber } from './account';

/**
 * Get the display text and styling for a job's account identifier
 * Returns either "DD" (for gocardless jobs) or the account number
 */
export const getJobAccountDisplay = (job: Job, client?: Client) => {
  // Check if job is gocardless enabled (either from job or client)
  const isGoCardless = job.gocardlessEnabled || client?.gocardlessEnabled;
  
  if (isGoCardless) {
    return {
      text: 'DD',
      isGoCardless: true,
      style: {
        backgroundColor: '#FFD700', // Yellow background
        color: '#000000' // Black text
      }
    };
  }
  
  // Return account number for regular jobs
  return {
    text: client?.accountNumber ? displayAccountNumber(client.accountNumber) : 'N/A',
    isGoCardless: false,
    style: null // Use default styling
  };
};

/**
 * Get the display text for a job's account identifier (text only, no styling)
 */
export const getJobAccountText = (job: Job, client?: Client) => {
  const display = getJobAccountDisplay(job, client);
  return display.text;
}; 