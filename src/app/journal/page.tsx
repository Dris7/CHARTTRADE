import { Panel } from "~/app/_components/ui/panel";

export default function JournalPage() {
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <div className="label">Journal & Stratégie</div>
        <h1 className="display text-3xl">
          Ton edge · <span className="text-(--color-fg-mute)">documenté</span>
        </h1>
      </div>
      <Panel title="Aujourd’hui" hint="prochaine itération">
        <p className="text-sm text-(--color-fg-dim)">
          Le journal de trades avec contexte macro (régime, yields, sentiment),
          les captures de setups et le post-mortem seront ici. Propulsé par
          Prisma ; l’interface arrive au prochain passage.
        </p>
      </Panel>
    </div>
  );
}
