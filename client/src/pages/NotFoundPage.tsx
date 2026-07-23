import { Link } from 'react-router';
export function Component() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">404</h1>
        <Link className="mt-3 inline-block text-brand-600" to="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
