import { type FormEvent, useState } from 'react';

import { Hero } from '../components/Hero';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';

// Landing route at /. Renders the Hero; on form submit creates a job + navigates
// to /jobs/<id> where the polling-driven report view takes over.
export default function HomePage() {
  useSeo();
  const [url, setUrl] = useState('');
  const { submit, submitting, error } = useCreateCrawl();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(url);
  }

  return (
    <Hero url={url} setUrl={setUrl} onSubmit={onSubmit} submitting={submitting} error={error} />
  );
}
