import { Hero } from '../components/Hero';
import { useCreateCrawl } from '../hooks/useCreateCrawl';
import { useSeo } from '../hooks/useSeo';

// Landing route at /; submitting the Hero form creates a job and navigates to /jobs/<id>
export default function HomePage() {
  useSeo();
  const { submit, submitting, error } = useCreateCrawl();
  return <Hero onSubmit={submit} submitting={submitting} error={error} />;
}
