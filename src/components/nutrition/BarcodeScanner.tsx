import { useState, useEffect, useRef } from "react";
import { useZxing } from "react-zxing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanBarcode, X, Camera, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AIPersistence } from "@/lib/aiPersistence";
import { useUser } from "@/contexts/UserContext";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera, CameraPermissionState } from "@capacitor/camera";

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
      return true; // non-iOS or plugin unavailable — fall through to getUserMedia
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    setIsProcessing(true);
    setScannedProduct(null);

    try {
      // Check cache first (barcodes don't change — 30-day TTL)
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

      // Show product information
      setScannedProduct(data);
      setIsProcessing(false);

      // Cache barcode result for 30 days
      if (userId) {
        AIPersistence.save(userId, `barcode_${barcode}`, data, 24 * 30);
      }

      toast({
        title: "Product found!",
        description: `${data.productName} scanned successfully`,
      });
    } catch (error: any) {
      console.error("Error scanning barcode:", error);
      
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
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    onDecodeResult(result) {
      if (isProcessing) return;
      
      const barcode = result.getText();
      
      // Prevent duplicate scans of the same barcode
      if (barcode === lastScannedBarcode) return;
      
      setLastScannedBarcode(barcode);

      // Clear any existing timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      
      // Add a small delay to prevent rapid re-scanning
      scanTimeoutRef.current = setTimeout(() => {
        handleBarcodeScanned(barcode);
      }, 500);
    },
    onError(error) {
      console.error("Scanner error:", error);
      const errorName = error instanceof Error ? error.name : String(error);
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
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    } else {
      // Always start with rear camera when dialog opens
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
    setFacingMode(prev => prev === "environment" ? "user" : "environment");
    setLastScannedBarcode(""); // Reset to allow re-scanning
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
        <DialogContent className="max-w-md w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Scan Food Barcode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cameraError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="mt-2">
                  {cameraError}
                  <div className="mt-2 text-xs">
                    <p>Tips:</p>
                    <ul className="list-disc list-inside mt-1 space-y-1">
                      <li>Check browser settings for camera permissions</li>
                      <li>Ensure you're using HTTPS (required for camera access)</li>
                      <li>Try refreshing the page and granting permissions again</li>
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}

            {scannedProduct && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="mt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-green-900 dark:text-green-100">
                        {scannedProduct.productName}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {scannedProduct.source}
                      </Badge>
                    </div>
                    {scannedProduct.brand && (
                      <p className="text-xs text-muted-foreground">Brand: {scannedProduct.brand}</p>
                    )}
                    <div className="text-xs space-y-1 pt-1">
                      <p>Calories: {scannedProduct.calories} kcal</p>
                      <p>Protein: {scannedProduct.protein_g}g | Carbs: {scannedProduct.carbs_g}g | Fats: {scannedProduct.fats_g}g</p>
                      <p className="text-muted-foreground">Serving: {scannedProduct.serving_size}</p>
                    </div>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                      Adding to meal form...
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
              <video 
                ref={ref} 
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {isProcessing && !scannedProduct && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <p className="text-white text-sm">Searching database...</p>
                </div>
              )}
              
              {!isProcessing && !cameraError && (
                <>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative">
                      <div className="border-2 border-primary w-64 h-32 rounded-lg"></div>
                      <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-lg"></div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-lg"></div>
                      <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-lg"></div>
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-lg"></div>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2 flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={switchCamera}
                      className="h-8 w-8 bg-black/50 hover:bg-black/70 border border-white/20"
                      title="Switch camera"
                    >
                      <RotateCcw className="h-4 w-4 text-white" />
                    </Button>
                  </div>
                </>
              )}
            </div>
            
            {!scannedProduct && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground text-center">
                  Position the barcode within the highlighted area
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  Ensure good lighting and hold steady. Data from OpenFoodFacts database.
                </p>
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setIsOpen(false);
                  setScannedProduct(null);
                  setLastScannedBarcode("");
                }}
                disabled={isProcessing && !scannedProduct}
              >
                <X className="mr-2 h-4 w-4" />
                {scannedProduct ? "Close" : "Cancel"}
              </Button>
              {scannedProduct && (
                <Button
                  variant="default"
                  className="flex-1"
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
                  Add to Meal
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
