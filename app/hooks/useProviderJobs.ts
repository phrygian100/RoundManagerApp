import { getJobsForProvider, updateJobStatus } from 'app/services/jobService';
import type { Job } from 'app/types/models';
import { useState } from 'react';

export function useProviderJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchJobs = async (providerId: string) => {
    setLoading(true);
    const jobsList = await getJobsForProvider(providerId);
    setJobs(jobsList);
    setLoading(false);
    return jobsList;
  };

  const setJobStatus = async (jobId: string, status: Job['status']) => {
    setLoading(true);
    await updateJobStatus(jobId, status);
    setJobs((prev) => prev.map(job => job.id === jobId ? { ...job, status } : job));
    setLoading(false);
  };

  return {
    jobs,
    loading,
    fetchJobs,
    setJobStatus,
  };
} 