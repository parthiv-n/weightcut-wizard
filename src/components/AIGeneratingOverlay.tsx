
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AIStep {
    icon: LucideIcon;
    label: string;
    color?: string;
}

interface AIGeneratingOverlayProps {
    isOpen: boolean;
    isGenerating: boolean;
    steps: AIStep[];
    title?: string;
    subtitle?: string;
    onCompletion?: () => void;
}

export function AIGeneratingOverlay({
    isOpen,
    isGenerating,
    steps,
    title = "Analyzing Data",
    subtitle = "AI is processing your request...",
    onCompletion
}: AIGeneratingOverlayProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [isComplete, setIsComplete] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setCurrentStep(0);
            setIsComplete(false);
        }
    }, [isOpen]);

    // Handle step progression
    useEffect(() => {
        if (!isOpen || !isGenerating) return;

        const interval = setInterval(() => {
            setCurrentStep((prev) => {
                if (prev < steps.length - 1) {
                    return prev + 1;
                }
                return prev;
            });
        }, 2000); // Advance every 2 seconds roughly

        return () => clearInterval(interval);
    }, [isOpen, isGenerating, steps.length]);

    // Handle completion
    useEffect(() => {
        if (!isGenerating && isOpen) {
            // When generation stops, mark as complete
            setCurrentStep(steps.length);
            setIsComplete(true);

            const timeout = setTimeout(() => {
                onCompletion?.();
            }, 1500); // Close after 1.5s of showing completion
            return () => clearTimeout(timeout);
        }
    }, [isGenerating, isOpen, steps.length, onCompletion]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Background Glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

                <div className="text-center space-y-2 mb-8">
                    <h3 className="text-xl font-bold text-white transition-all duration-300">
                        {isComplete ? "Complete!" : title}
                    </h3>
                    <p className="text-zinc-400 text-sm transition-all duration-300">
                        {isComplete ? "Your results are ready." : subtitle}
                    </p>
                </div>

                <div className="space-y-4">
                    {steps.map((step, index) => {
                        const isActive = index === currentStep;
                        const isCompleted = index < currentStep || isComplete;

                        return (
                            <div
                                key={index}
                                className={cn(
                                    "flex items-center gap-3 p-3 rounded-xl transition-all duration-500",
                                    isActive ? "bg-zinc-800/50 border border-zinc-700/50 translate-x-0 opacity-100" : "opacity-50",
                                    // Simple stagger effect simulation with delay would require inline styles or more complex CSS, keeping it simple here
                                )}
                            >
                                <div className={cn(
                                    "h-8 w-8 rounded-full flex items-center justify-center transition-all duration-500",
                                    isActive ? "bg-primary/20 scale-110" : "bg-zinc-800",
                                    isCompleted ? "bg-green-500/20" : ""
                                )}>
                                    {isCompleted ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 transition-all duration-300" />
                                    ) : isActive ? (
                                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
                                    ) : (
                                        <step.icon className={cn("h-4 w-4 transition-colors duration-300", step.color || "text-zinc-500")} />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className={cn(
                                        "text-sm font-medium transition-colors duration-300",
                                        isActive ? "text-white" : "text-zinc-500",
                                        isCompleted ? "text-green-500" : ""
                                    )}>
                                        {step.label}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>,
        document.body
    );
}
