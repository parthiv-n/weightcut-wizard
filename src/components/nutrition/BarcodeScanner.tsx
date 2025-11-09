import { useState, useEffect } from "react";
import { useZxing } from "react-zxing";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanBarcode, X, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface BarcodeScannerProps {
  onFoodScanned: (foodData: {
    meal_name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fats_g: number;
  }) => void;
  disabled?: boolean;
}

export const BarcodeScanner = ({ onFoodScanned, disabled }: BarcodeScannerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string>("");
  const { toast } = useToast();

  const { ref } = useZxing({
    constraints: {
      audio: false,
      video: {
        facingMode: "environment", // Use back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    },
    onDecodeResult(result) {
      if (isProcessing) return;
      
      const barcode = result.getText();
      console.log("Barcode scanned:", barcode);
      handleBarcodeScanned(barcode);
    },
    onError(error) {
      console.error("Scanner error:", error);
      setCameraError("Failed to access camera. Please ensure camera permissions are enabled.");
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setCameraError("");
    }
  }, [isOpen]);

  const handleBarcodeScanned = async (barcode: string) => {
    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-barcode", {
        body: { barcode },
      });

      if (error) throw error;

      if (!data.found) {
        toast({
          title: "Product not found",
          description: "Could not find nutritional information for this barcode",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      toast({
        title: "Product found!",
        description: `${data.productName} scanned successfully`,
      });

      onFoodScanned({
        meal_name: data.productName,
        calories: data.calories,
        protein_g: data.protein_g,
        carbs_g: data.carbs_g,
        fats_g: data.fats_g,
      });

      setIsOpen(false);
    } catch (error: any) {
      console.error("Error scanning barcode:", error);
      toast({
        title: "Scan failed",
        description: error.message || "Failed to get product information",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
      >
        <ScanBarcode className="mr-2 h-4 w-4" />
        Scan Barcode
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Scan Food Barcode
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cameraError ? (
              <Alert variant="destructive">
                <AlertDescription>{cameraError}</AlertDescription>
              </Alert>
            ) : null}
            
            <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
              <video 
                ref={ref} 
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              {isProcessing && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  <p className="text-white text-sm">Processing barcode...</p>
                </div>
              )}
              
              {!isProcessing && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-primary w-64 h-32 rounded-lg"></div>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground text-center">
                Position the barcode within the highlighted area
              </p>
              <p className="text-xs text-muted-foreground text-center">
                Ensure good lighting and hold steady
              </p>
            </div>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsOpen(false)}
            >
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
