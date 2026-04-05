import { useState, useEffect, useRef, useCallback } from "react";

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

type SpeechRecognitionErrorCode = "not-allowed" | "no-speech" | "aborted" | "network" | "audio-capture" | string;

interface SpeechRecognitionErrorEvent {
  error: SpeechRecognitionErrorCode;
}

const getSpeechRecognition = (): (new () => SpeechRecognition) | null => {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
};

interface UseSpeechRecognitionOptions {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  lang?: string;
}

export function useSpeechRecognition({ onTranscript, onError, lang = "en-US" }: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isListeningRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onErrorRef.current = onError;

  const isSupported = getSpeechRecognition() !== null;

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimText("");
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const SpeechRec = getSpeechRecognition();
    if (!SpeechRec) return;

    // Stop any existing instance
    recognitionRef.current?.stop();

    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        onTranscriptRef.current(final);
        setInterimText("");
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed") {
        onErrorRef.current?.("Microphone access denied. Enable it in Settings.");
        stopListening();
        return;
      }
      onErrorRef.current?.("Speech recognition error. Please try again.");
      stopListening();
    };

    recognition.onend = () => {
      // Auto-restart if user hasn't explicitly stopped
      if (isListeningRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started or context destroyed
          stopListening();
        }
      }
    };

    try {
      recognition.start();
      isListeningRef.current = true;
      setIsListening(true);
    } catch {
      onErrorRef.current?.("Could not start speech recognition.");
    }
  }, [lang, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  return { isListening, isSupported, startListening, stopListening, interimText };
}
