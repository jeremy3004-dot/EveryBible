import { ErrorPageScreen } from '../components/ErrorPageScreen';

export default function ServerErrorPage() {
  return <ErrorPageScreen statusCode={500} />;
}
