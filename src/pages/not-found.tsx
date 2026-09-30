import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <Link className="text-brand text-sm underline" to="/">
        Back to Explore
      </Link>
    </section>
  );
}
