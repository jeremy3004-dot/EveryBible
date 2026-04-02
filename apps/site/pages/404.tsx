import { ErrorPageScreen } from '../components/ErrorPageScreen';

export default function NotFoundPage() {
  return <ErrorPageScreen statusCode={404} />;
}
