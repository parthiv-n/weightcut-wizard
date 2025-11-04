import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { pipeline } from "@huggingface/transformers";

interface VoiceInputProps {
  onTranscription: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInput({ onTranscription, disabled }: VoiceInputProps) {
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
      console.error('Error loading model:', error);
      toast({
        title: "Model loading failed",
        description: "Falling back to CPU processing",
        variant: "destructive",
      });
      
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
    <div className="flex items-center gap-2">
      {!isRecording && !isProcessing && !isModelLoading && (
        <Button
          type="button"
          variant="outline"
          onClick={startRecording}
          disabled={disabled}
          className="gap-2"
        >
          <Mic className="h-4 w-4" />
          Voice Input
        </Button>
      )}
      
      {isModelLoading && (
        <Button
          type="button"
          variant="outline"
          disabled
          className="gap-2"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading Model...
        </Button>
      )}
      
      {isRecording && (
        <Button
          type="button"
          variant="destructive"
          onClick={stopRecording}
          className="gap-2 animate-pulse"
        >
          <Square className="h-4 w-4" />
          Stop Recording
        </Button>
      )}
      
      {isProcessing && (
        <Button
          type="button"
          variant="outline"
          disabled
          className="gap-2"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          Processing...
        </Button>
      )}
    </div>
  );
}