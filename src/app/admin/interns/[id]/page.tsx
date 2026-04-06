import InternClientPage from './ClientPage';

export const dynamicParams = false;

export async function generateStaticParams() {
  return [{ id: '1' }];
}

export default function Page({ params }: { params: { id: string } }) {
  return <InternClientPage />;
}
