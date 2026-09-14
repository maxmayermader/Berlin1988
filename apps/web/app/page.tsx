import Link from 'next/link';
import { CreateJoinPanel } from '../components/home/CreateJoinPanel.js';
import { KickedBanner } from '../components/home/KickedBanner.js';
import { OpenLobbies } from '../components/home/OpenLobbies.js';
import { PageTransition } from '../components/ui/PageTransition.js';

export default function HomePage() {
  return (
    <PageTransition className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-16">
      <KickedBanner />
      <h1 className="text-[28px] font-semibold leading-[1.2]">Berlin 1988</h1>
      <CreateJoinPanel />
      <OpenLobbies />
      <Link href="/deck" className="text-base text-[#2563eb] underline">
        Build Loadout
      </Link>
    </PageTransition>
  );
}
