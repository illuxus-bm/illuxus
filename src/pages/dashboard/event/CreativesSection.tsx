/**
 * CreativesSection — dashboard entry point for an event's promotional
 * creatives: the studio where they are designed, and the library of the ones
 * that have been saved.
 */
import { useState } from "react";

import CreativeLibrary from "@/components/event/creatives/CreativeLibrary";
import CreativeStudio from "@/components/event/creatives/CreativeStudio";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CreativesSection({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState("studio");
  // Bumped on every save so the library refetches the next time it is shown.
  const [libraryKey, setLibraryKey] = useState(0);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Creatives</h2>
          <p className="text-[13px] text-muted-foreground">
            Posters built from this event's speakers, sponsors, date and venue. Pick a design, then adjust anything you like.
          </p>
        </div>
        <TabsList>
          <TabsTrigger value="studio">Studio</TabsTrigger>
          <TabsTrigger value="library">Saved</TabsTrigger>
        </TabsList>
      </div>

      {/* Kept mounted so switching to the library and back doesn't refetch
          the event or drop an in-progress export. */}
      <TabsContent value="studio" forceMount className="data-[state=inactive]:hidden">
        <CreativeStudio eventId={eventId} onSaved={() => setLibraryKey((k) => k + 1)} />
      </TabsContent>
      <TabsContent value="library">
        <CreativeLibrary key={libraryKey} eventId={eventId} onCreate={() => setTab("studio")} />
      </TabsContent>
    </Tabs>
  );
}
