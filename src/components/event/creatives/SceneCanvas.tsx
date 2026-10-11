/**
 * Draws a studio `Scene` into a canvas that scales to its container.
 *
 * The bitmap is rendered at `pixelWidth` (not the scene's full size) so a
 * grid of thumbnails stays cheap; the export path renders the same scene at
 * full size through `renderSceneToBlob`.
 */
import { useEffect, useRef } from "react";

import { renderScene } from "@/lib/creatives/studio/render";
import type { Scene } from "@/lib/creatives/studio/scene";
import { cn } from "@/lib/utils";

interface SceneCanvasProps {
  scene: Scene;
  /** Bitmap width in CSS px; doubled on high-density screens. */
  pixelWidth: number;
  className?: string;
}

export default function SceneCanvas({ scene, pixelWidth, className }: SceneCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const density = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(1, (pixelWidth * density) / scene.width);
    // Render off-screen and copy across in one step, so a slow image never
    // leaves a half-drawn creative on screen and a stale render can't land
    // on top of a newer one.
    void renderScene(scene, undefined, scale).then((buffer) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.getContext("2d")?.drawImage(buffer, 0, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [scene, pixelWidth]);

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-auto w-full", className)}
      style={{ aspectRatio: `${scene.width} / ${scene.height}` }}
    />
  );
}
