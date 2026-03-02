import { useState, useEffect, useRef } from "react";
import { useZxing } from "react-zxing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanBarcode, RotateCcw, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { AIPersistence } from "@/lib/aiPersistence";
import { useUser } from "@/contexts/UserContext";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera, CameraPermissionState } from "@capacitor/camera";
import { logger } from "@/lib/logger";

interface BarcodeScannerProps {
  onFoodScanned: (foodData: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
    serving_size: string;
  }) => void;
  disabled?: boolean;
  className?: string;
}

export const BarcodeScanner = ({ onFoodScanned, disabled, className }: BarcodeScannerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [useExactConstraint, setUseExactConstraint] = useState(true);
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string>("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { userId } = useUser();

  const requestNativePermission = async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return true;
    try {
      const status = await CapCamera.requestPermissions({ permissions: ["camera"] });
      const granted: CameraPermissionState = status.camera;
      if (granted === "denied" || granted === "restricted") {
        setPermissionDenied(true);
        setCameraError("Camera access was denied. Go to iOS Settings > WeightCut Wizard > Camera and enable it.");
        return false;
      }
      return true;
    } catch {
      return true;
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsProcessing(true);
    setScannedProduct(null);

    try {
      const cacheKey = `barcode_${barcode}`;
      const cachedData = userId ? AIPersistence.load(userId, cacheKey) : null;
      if (cachedData) {
        setScannedProduct(cachedData);
        setIsProcessing(false);
        toast({ title: "Product found!", description: `${cachedData.productName} scanned successfully` });
        return;
      }

      const { data, error } = await supabase.functions.invoke("scan-barcode", {
        body: { barcode },
      });

      if (error) throw error;

      if (!data.found) {
        toast({
          title: "Product not found",
          description: "Could not find nutritional information for this barcode in OpenFoodFacts database. You can add it manually.",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      setScannedProduct(data);
      setIsProcessing(false);

      if (userId) {
        AIPersistence.save(userId, `barcode_${barcode}`, data, 24 * 30);
      }

      toast({
        title: "Product found!",
        description: `${data.productName} scanned successfully`,
      });
    } catch (error: any) {
      logger.error("Error scanning barcode", error);

      let errorMessage = "Failed to get product information";
      if (error.message?.includes("network") || error.message?.includes("fetch")) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Scan failed",
        description: errorMessage,
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  const { ref } = useZxing({
    paused: !isOpen,
    constraints: {
      audio: false,
      video: {
        facingMode: useExactConstraint ? { exact: facingMode } : { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    onDecodeResult(result) {
      if (isProcessing) return;

      const barcode = result.getText();

      if (barcode === lastScannedBarcode) return;

      setLastScannedBarcode(barcode);
      logger.info("Barcode scanned", { barcode });

      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      scanTimeoutRef.current = setTimeout(() => {
        handleBarcodeScanned(barcode);
      }, 500);
    },
    onError(error) {
      logger.error("Scanner error", error);
      const errorName = error instanceof Error ? error.name : String(error);

      // Fall back to ideal constraint on OverconstrainedError
      if (useExactConstraint && (errorName === "OverconstrainedError" || errorName === "ConstraintNotSatisfiedError")) {
        setUseExactConstraint(false);
        return;
      }

      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        setCameraError("Camera permission denied. Please enable camera access in your browser settings.");
      } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        setCameraError("No camera found. Please connect a camera device.");
      } else if (errorName === "NotReadableError" || errorName === "TrackStartError") {
        setCameraError("Camera is already in use by another application.");
      } else {
        setCameraError("Failed to access camera. Please ensure camera permissions are enabled.");
      }
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setCameraError("");
      setScannedProduct(null);
      setLastScannedBarcode("");
      setPermissionDenied(false);
      setUseExactConstraint(true);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    } else {
      setFacingMode("environment");
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const switchCamera = () => {
    setUseExactConstraint(true);
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    setLastScannedBarcode("");
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={async () => {
          const ok = await requestNativePermission();
          if (ok) setIsOpen(true);
        }}
        disabled={disabled}
        className={className}
        title="Scan Barcode"
      >
        <ScanBarcode className="h-4 w-4" />
        <span className="sr-only">Scan Barcode</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md w-[95vw] sm:w-full max-h-[90vh] p-0 gap-0 overflow-y-auto">
          <div className="p-4 pb-3 border-b border-border/40">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanBarcode className="h-5 w-5 text-primary" />
                Scan Barcode
              </DialogTitle>
            </DialogHeader>
          </div>

          <div>
            {/* Camera error */}
            {cameraError ? (
              <div className="mx-4 mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1.5">
                    <p className="text-sm text-destructive">{cameraError}</p>
                    <div className="text-xs text-muted-foreground">
                      <p>Tips:</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Check browser settings for camera permissions</li>
                        <li>Ensure you're using HTTPS (required for camera access)</li>
                        <li>Try refreshing the page and granting permissions again</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Camera viewfinder */}
            <div className="relative aspect-[4/3] bg-black overflow-hidden">
              <video
                ref={ref}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Processing overlay */}
              {isProcessing && !scannedProduct && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <div className="text-center">
                    <p className="text-white text-sm font-medium">Looking up product...</p>
                    <p className="text-white/50 text-xs mt-1">Searching OpenFoodFacts</p>
                  </div>
                </div>
              )}

              {/* Scan overlay with corner markers */}
              {!isProcessing && !cameraError && (
                <>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Scan area with vignette */}
                    <div className="relative w-64 h-32">
                      {/* Vignette overlay */}
                      <div className="absolute inset-0 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />

                      {/* Corner markers */}
                      <div className="absolute -top-1 -left-1 w-8 h-8 border-t-[3px] border-l-[3px] border-white/80 rounded-tl-lg" />
                      <div className="absolute -top-1 -right-1 w-8 h-8 border-t-[3px] border-r-[3px] border-white/80 rounded-tr-lg" />
                      <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-[3px] border-l-[3px] border-white/80 rounded-bl-lg" />
                      <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-[3px] border-r-[3px] border-white/80 rounded-br-lg" />

                      {/* Animated scan line */}
                      <div className="absolute top-1/2 -translate-y-1/2 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-pulse" />
                    </div>
                  </div>

                  {/* Camera switch button */}
                  <div className="absolute top-3 right-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={switchCamera}
                      className="h-9 w-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm border border-white/20"
                      title="Switch camera"
                    >
                      <RotateCcw className="h-4 w-4 text-white" />
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Result card */}
            {scannedProduct && (
              <div className="px-4 pt-4 space-y-3">
                {/* Product header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{scannedProduct.productName}</p>
                    {scannedProduct.brand && (
                      <p className="text-xs text-muted-foreground">{scannedProduct.brand}</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {scannedProduct.source}
                  </Badge>
                </div>

                {/* Nutrition breakdown — matches FoodSearchDialog pattern */}
                <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-3">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-primary tabular-nums">{scannedProduct.calories}</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">calories</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border/30">
                    <div className="text-center">
                      <p className="text-lg font-semibold text-blue-500 tabular-nums">{scannedProduct.protein_g}g</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Protein</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-orange-500 tabular-nums">{scannedProduct.carbs_g}g</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carbs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-purple-500 tabular-nums">{scannedProduct.fats_g}g</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fats</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 text-center pt-1">
                    Serving: {scannedProduct.serving_size || "1 serving"}
                  </p>
                </div>
              </div>
            )}

            {/* Help text */}
            {!scannedProduct && !cameraError && (
              <p className="px-4 py-3 text-xs text-muted-foreground text-center">
                Position barcode within the frame. Hold steady for best results.
              </p>
            )}

            {/* Action buttons */}
            <div className="px-4 pb-4 pt-3 space-y-2">
              {scannedProduct && (
                <Button
                  className="w-full h-11 font-semibold"
                  onClick={() => {
                    onFoodScanned({
                      meal_name: scannedProduct.productName,
                      calories: scannedProduct.calories,
                      protein_g: scannedProduct.protein_g,
                      carbs_g: scannedProduct.carbs_g,
                      fats_g: scannedProduct.fats_g,
                      serving_size: scannedProduct.serving_size || "1 serving",
                    });
                    setIsOpen(false);
                  }}
                >
                  Add to Meal &middot; {scannedProduct.calories} kcal
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setIsOpen(false);
                  setScannedProduct(null);
                  setLastScannedBarcode("");
                }}
                disabled={isProcessing && !scannedProduct}
              >
                {scannedProduct ? "Close Scanner" : "Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
