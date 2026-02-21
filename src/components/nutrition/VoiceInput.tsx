import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pipeline } from "@huggingface/transformers";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export function VoiceInput({ onTranscription, disabled, className }: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const transcriberRef = useRef<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  const loadModel = async () => {
    if (transcriberRef.current) return;

    setIsModelLoading(true);
    try {
      toast({
        title: "Loading AI model...",
        description: "This may take a moment on first use",
      });

      transcriberRef.current = await pipeline(
        "automatic-speech-recognition",
        "onnx-community/whisper-tiny.en",
        { device: "webgpu" }
      );

      toast({
        title: "Model loaded",
        description: "Ready to transcribe",
      });
    } catch (error) {
      // Fallback to CPU if WebGPU fails
      try {
        transcriberRef.current = await pipeline(
          "automatic-speech-recognition",
          "onnx-community/whisper-tiny.en"
        );
      } catch (fallbackError) {
        console.error('Fallback loading failed:', fallbackError);
        toast({
          title: "Failed to load model",
          description: "Please refresh and try again",
          variant: "destructive",
        });
      }
    } finally {
      setIsModelLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      // Load model if not already loaded
      if (!transcriberRef.current) {
        await loadModel();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        await processRecording();
      };

      mediaRecorder.start();
      setIsRecording(true);

      toast({
        title: "Recording...",
        description: "Speak what you ate",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to use voice input",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processRecording = async () => {
    setIsProcessing(true);
    try {
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

      // Convert blob to URL for Whisper model
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!transcriberRef.current) {
        throw new Error("Model not loaded");
      }

      toast({
        title: "Transcribing...",
        description: "Processing your audio",
      });

      const result = await transcriberRef.current(audioUrl);

      URL.revokeObjectURL(audioUrl);

      if (result.text) {
        toast({
          title: "Transcription complete",
          description: `"${result.text}"`,
        });
        onTranscription(result.text);
      } else {
        throw new Error("No transcription returned");
      }
    } catch (error: any) {
      console.error('Error processing recording:', error);
      toast({
        title: "Transcription failed",
        description: error.message || "Failed to transcribe audio",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      chunksRef.current = [];
    }
  };

  return (
    <>
      <style>{`
        @keyframes waveform {
          0% { transform: scaleY(0.4); opacity: 0.6; }
          100% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>

      {!isRecording && !isProcessing && !isModelLoading && (
        <Button
          type="button"
          variant="outline"
          onClick={startRecording}
          disabled={disabled}
          className={className}
          title="Voice Input"
        >
          <Mic className="h-4 w-4 text-orange-500" />
          <span className="text-[10px] text-muted-foreground font-normal">Voice</span>
        </Button>
      )}

      {isModelLoading && (
        <Button
          type="button"
          variant="outline"
          disabled
          className={className}
          title="Loading model..."
        >
          <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
          <span className="text-[10px] text-muted-foreground font-normal overflow-hidden whitespace-nowrap text-ellipsis max-w-full">Loading</span>
        </Button>
      )}

      {isRecording && (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={stopRecording}
            className={`${className} bg-red-500/5 dark:bg-red-500/10 border-red-500/20`}
            title="Stop Recording"
          >
            <Mic className="h-4 w-4 text-red-500 animate-pulse" />
            <span className="text-[10px] text-red-600/80 font-normal">Recording</span>
          </Button>

          {/* Floating native iOS feel Voice recording pill */}
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-background border border-border/40 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.4)] rounded-full px-5 py-2.5 flex items-center gap-3 z-[100] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
            <div className="flex items-center gap-[3px] h-5 mr-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-[3.5px] rounded-full bg-red-500"
                  style={{
                    height: `${30 + Math.random() * 70}%`,
                    animation: `waveform 0.6s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate ${i * 0.15}s`
                  }}
                />
              ))}
            </div>
            <span className="text-sm font-medium pr-2 text-foreground/80 pointer-events-none">Listening...</span>
            <button
              onClick={stopRecording}
              className="h-8 w-8 rounded-full bg-red-100 hover:bg-red-200 dark:bg-red-500/20 dark:hover:bg-red-500/30 flex items-center justify-center transition-colors shrink-0"
              aria-label="Stop recording"
            >
              <Square className="h-3 w-3 text-red-600 dark:text-red-400 fill-current" />
            </button>
          </div>
        </>
      )}

      {isProcessing && (
        <Button
          type="button"
          variant="outline"
          disabled
          className={className}
          title="Processing..."
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-[10px] text-muted-foreground font-normal text-ellipsis overflow-hidden">Processing</span>
        </Button>
      )}
    </>
  );
}