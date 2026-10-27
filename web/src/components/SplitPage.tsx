import { TopNav } from './TopNav';
import { GridRow } from './ui/GridRow';

// the 8/4 page behind sign-in and not-found: a headline cell and an optional side cell
export function SplitPage({
  title,
  aside,
  showAuth,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  showAuth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <TopNav showAuth={showAuth} />
      <main className="frame flex-1">
        <section className="grid grid-cols-1 lg:grid-cols-12">
          <div className="cell px-5 pt-12 pb-10 sm:px-8 lg:col-span-8 lg:border-r lg:py-20">
            <h1 className="tracking-display text-closing sm:text-closing-lg leading-none font-semibold">
              {title}
            </h1>
            {children}
          </div>
          {aside && (
            <div className="cell border-t px-5 pt-10 pb-12 sm:px-8 lg:col-span-4 lg:border-t-0 lg:py-20">
              {aside}
            </div>
          )}
        </section>
        <GridRow inner={['lg:left-[66.666%]']} />
      </main>
    </div>
  );
}
