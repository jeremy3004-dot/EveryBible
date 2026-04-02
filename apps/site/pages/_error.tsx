import type { NextPageContext } from 'next';

import { ErrorPageScreen } from '../components/ErrorPageScreen';

interface ErrorPageProps {
  statusCode: number;
}

export default function ErrorPage({ statusCode }: ErrorPageProps) {
  return <ErrorPageScreen statusCode={statusCode} />;
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext): ErrorPageProps => ({
  statusCode: res?.statusCode ?? err?.statusCode ?? 404,
});
