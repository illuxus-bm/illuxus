/**
 * CreativesSection — dashboard entry point for an event's promotional
 * creatives: the designs, and the library of the ones that have been saved.
 *
 * Designs are branded graphics composed from the event's banner, photos,
 * logos and colours (palettes are read from the banner). Pick, tweak,
 * download; works on a phone.
 */
import { useState } from "react";

import CreativeLibrary from "@/components/event/creatives/CreativeLibrary";
import BrandedDesigns from "@/components/event/creatives/studio/BrandedDesigns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CreativesSection({ eventId }: { eventId: string }) {
  const [tab, setTab] = useState("designs");
  // Bumped on every save so the library refetches the next time it is shown.
  const [libraryKey, setLibraryKey] = useState(0);

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Creatives</h2>
          <p className="text-[13px] text-muted-foreground">
            Graphics built from this event's banner, speakers, sponsors, date and venue. Pick a design, then adjust anything you like.
          </p>
        </div>
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
          <TabsTrigger value="designs">Create</TabsTrigger>
          <TabsTrigger value="library">Saved</TabsTrigger>
        </TabsList>
      </div>

      {/* Kept mounted so switching to the library and back doesn't refetch
          the event or drop an in-progress export. */}
      <TabsContent value="designs" forceMount className="data-[state=inactive]:hidden">
        <BrandedDesigns eventId={eventId} onSaved={() => setLibraryKey((k) => k + 1)} />
      </TabsContent>
      <TabsContent value="library">
        <CreativeLibrary key={libraryKey} eventId={eventId} onCreate={() => setTab("designs")} />
      </TabsContent>
    </Tabs>
  );
}
