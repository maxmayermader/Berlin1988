import Link from 'next/link';
import { CreateJoinPanel } from '../components/home/CreateJoinPanel.js';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
      <h1 className="text-[28px] font-semibold leading-[1.2]">Berlin 1988</h1>
      <CreateJoinPanel />
      <Link href="/deck" className="text-base text-[#2563eb] underline">
        Build Loadout
      </Link>
    </main>
  );
}
