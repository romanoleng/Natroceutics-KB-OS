import '../styles/globals.css';
import RouteProgress from '../components/RouteProgress';

export default function App({ Component, pageProps }) {
  return (
    <>
      <RouteProgress />
      <Component {...pageProps} />
    </>
  );
}
