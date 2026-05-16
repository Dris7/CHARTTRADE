import { Panel } from "~/app/_components/ui/panel";

export default function JournalPage() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="label">Journal & Playbook</div>
        <h1 className="display text-3xl">
          Ton edge · <span className="text-(--color-fg-mute)">documenté</span>
        </h1>
      </div>
      <Panel title="Today" hint="coming next iteration">
        <p className="text-sm text-(--color-fg-dim)">
          Trade journal with macro context (regime, yields, sentiment), setup
          screenshots and post-mortem will live here. Backed by Prisma; UI ships
          with the next pass.
        </p>
      </Panel>
    </div>
  );
}
