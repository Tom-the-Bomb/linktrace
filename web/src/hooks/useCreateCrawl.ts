import { useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { createCheck } from '../api';
import { errMessage } from '../lib/format';

export function useCreateCrawl() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(url: string) {
    setError(null);
    setSubmitting(true);
    try {
      const { job_id, joined } = await createCheck(url);
      navigate(`/jobs/${job_id}`, { state: { joined: !!joined } });
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}
