import { Link } from "react-router";

import { APP } from "@/config/app";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="hover:text-foreground underline-offset-4 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}

/** `__COMMIT_HASH__` is `git describe --dirty`: a full SHA, optionally prefixed by a tag and suffixed by -dirty. */
const commit = __COMMIT_HASH__;
const sha = /[0-9a-f]{40}/.exec(commit)?.[0];

export function Footer() {
  const source = APP.repoUrl && sha ? `${APP.repoUrl}/tree/${sha}` : undefined;
  return (
    <footer className="text-muted-foreground border-t text-xs">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
        <Link className="hover:text-foreground underline-offset-4 hover:underline" to="/about">
          How it works
        </Link>
        {APP.repoUrl && <ExternalLink href={APP.repoUrl}>Source code</ExternalLink>}
        <ExternalLink href={APP.makinaDocs}>Makina docs</ExternalLink>
        {APP.termsUrl && <ExternalLink href={APP.termsUrl}>Terms</ExternalLink>}
        {import.meta.env.DEV && (
          <span className="text-warning font-medium">Development build: use pnpm start for real transactions</span>
        )}
        <span
          className="ml-auto font-mono break-all tabular-nums"
          title="Version and the exact commit this build comes from"
        >
          v{__APP_VERSION__} · {source ? <ExternalLink href={source}>{commit}</ExternalLink> : commit}
        </span>
      </div>
    </footer>
  );
}
