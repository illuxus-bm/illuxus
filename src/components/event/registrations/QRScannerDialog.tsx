import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanLine, CheckCircle, XCircle, Camera, CameraOff } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type Registration = Tables<"registrations">;

interface QRScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrations: Registration[];
  onCheckIn: (reg: Registration) => Promise<void>;
}

export default function QRScannerDialog({ open, onOpenChange, registrations, onCheckIn }: QRScannerDialogProps) {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error" | "already"; message: string } | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<string>("qr-reader-" + Math.random().toString(36).slice(2));

  const startScanner = async () => {
    setResult(null);
    try {
      const scanner = new Html5Qrcode(containerRef.current);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {}
      );
      setScanning(true);
    } catch {
      setResult({ type: "error", message: "Could not access camera. Please allow camera permissions." });
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop();
    }
    setScanning(false);
  };

  const handleScan = async (data: string) => {
    // Try to match by registration ID or email
    const reg = registrations.find(
      (r) => r.id === data || r.email.toLowerCase() === data.toLowerCase()
    );
    if (!reg) {
      setResult({ type: "error", message: `No registration found for: ${data}` });
      return;
    }
    if (reg.checked_in) {
      setResult({ type: "already", message: `${reg.name} is already checked in` });
      return;
    }
    await onCheckIn(reg);
    setResult({ type: "success", message: `${reg.name} checked in successfully!` });
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
      setResult(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ScanLine className="h-4 w-4" /> QR Code Scanner
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Scan attendee QR codes to check them in. Codes should contain registration ID or email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            id={containerRef.current}
            className="w-full rounded-lg overflow-hidden bg-muted/50 min-h-[250px]"
          />

          {result && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-[13px] font-medium ${
                result.type === "success"
                  ? "bg-green-500/10 text-green-600 border border-green-500/20"
                  : result.type === "already"
                  ? "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20"
                  : "bg-red-500/10 text-red-600 border border-red-500/20"
              }`}
            >
              {result.type === "success" ? (
                <CheckCircle className="h-4 w-4 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0" />
              )}
              {result.message}
            </div>
          )}

          <div className="flex gap-2">
            {!scanning ? (
              <Button onClick={startScanner} size="sm" className="w-full gap-1.5 text-[13px]">
                <Camera className="h-3.5 w-3.5" /> Start Scanning
              </Button>
            ) : (
              <Button onClick={stopScanner} size="sm" variant="outline" className="w-full gap-1.5 text-[13px]">
                <CameraOff className="h-3.5 w-3.5" /> Stop Scanning
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
