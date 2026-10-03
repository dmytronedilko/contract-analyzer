import type { ReactNode } from 'react';

import Link from 'next/link';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <nav aria-label="Settings" className="flex gap-4 border-b pb-2 text-sm">
          <Link href="/settings/organization" className="hover:underline">
            Organization
          </Link>
          <Link href="/settings/audit" className="hover:underline">
            Audit log
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
