import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CorporatePage } from '@/components/omninja/corporate-page';
import { corporatePages, corporateSlugs } from '@/lib/corporate-pages';

export function generateStaticParams() {
  return corporateSlugs.map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  const page = corporatePages[section];
  if (!page) return {};
  return {
    title: `${page.navLabel} | OMNININJA`,
    description: page.lead,
    openGraph: {
      title: `${page.navLabel} | OMNININJA`,
      description: page.lead,
      siteName: 'OMNININJA',
      type: 'website',
    },
  };
}

export default async function CorporateSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const page = corporatePages[section];
  if (!page) notFound();
  return <CorporatePage page={page} />;
}

