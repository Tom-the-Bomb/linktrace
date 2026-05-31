import { useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { createCheck } from '../api';

// useCreateCrawl: submit a URL, create a job, navigate to its report. shared by the landing
// form, history page, and in-report new-crawl header.
export function useCreateCrawl() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(url: string) {
    setError(null);
    setSubmitting(true);
    try {
      const { job_id } = await createCheck(url);
      navigate(`/jobs/${job_id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error, setError };
}
