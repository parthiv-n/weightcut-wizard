import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Quote, CheckCircle2 } from "lucide-react";
import wizardLogo from "@/assets/wizard-logo.png";

interface WeightIncreaseQuestionnaireProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete: () => void;
}

export function WeightIncreaseQuestionnaire({ open, onOpenChange, onComplete }: WeightIncreaseQuestionnaireProps) {
    const [step, setStep] = useState<"question" | "diagnosis">("question");

    const handleSelect = (option: string) => {
        if (option === "Nothing unusual") {
            onOpenChange(false);
            onComplete();
            // Reset after animation
            setTimeout(() => setStep("question"), 300);
        } else {
            setStep("diagnosis");
        }
    };

    const handleGotIt = () => {
        onOpenChange(false);
        onComplete();
        // Reset after animation
        setTimeout(() => setStep("question"), 300);
    };

    return (
        <Sheet open={open} onOpenChange={(val) => {
            onOpenChange(val);
            if (!val) {
                setTimeout(() => setStep("question"), 300);
            }
        }}>
            <SheetContent side="bottom" className="h-[auto] max-h-[85vh] rounded-t-2xl pb-8">
                <SheetHeader className="mb-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-full bg-primary/20 p-2 flex-shrink-0 animate-pulse">
                            <img src={wizardLogo} alt="Wizard" className="w-10 h-10" />
                        </div>
                        <div>
                            <SheetTitle className="text-base text-left">The Wizard is Analyzing...</SheetTitle>
                            <p className="text-xs text-muted-foreground text-left">Analyzing today's slight weight increase.</p>
                        </div>
                    </div>
                </SheetHeader>

                {step === "question" ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="rounded-xl border border-border/50 p-4 mb-5 bg-gradient-to-r from-primary/5 to-secondary/5">
                            <div className="flex items-start gap-2">
                                <Quote className="h-4 w-4 text-primary mt-1 flex-shrink-0 opacity-50" />
                                <p className="text-sm font-medium leading-relaxed">
                                    "I see your weight went up slightly today. Don't panic! Before we look at your daily wisdom, what did you eat last night?"
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Button
                                variant="outline"
                                className="w-full justify-start h-auto p-4 text-left border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all font-normal whitespace-normal"
                                onClick={() => handleSelect("Salty")}
                            >
                                Heavy on the salt (e.g., takeout, soy sauce, processed foods)
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full justify-start h-auto p-4 text-left border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all font-normal whitespace-normal"
                                onClick={() => handleSelect("Carbs")}
                            >
                                High in carbs (e.g., pasta, rice, bread, potatoes)
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full justify-start h-auto p-4 text-left border-border/50 hover:bg-primary/10 hover:border-primary/30 transition-all font-normal whitespace-normal"
                                onClick={() => handleSelect("Late")}
                            >
                                I ate a large meal very close to bedtime
                            </Button>
                            <Button
                                variant="ghost"
                                className="w-full justify-center h-12 text-muted-foreground hover:text-foreground"
                                onClick={() => handleSelect("Nothing unusual")}
                            >
                                None of the above / Nothing unusual
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                        <div className="rounded-xl border border-green-500/30 p-5 mb-5 bg-green-500/10">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                                <h3 className="font-bold text-green-500">Diagnosis: Water Retention</h3>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                                This is completely normal! Carbs and sodium cause your body to hold onto extra water. For every gram of carbohydrate you store, your body holds about 3 grams of water.
                                <br /><br />
                                This is just temporary water weight, not fat. Stay hydrated, stick to your plan, and it will flush out in a day or two.
                            </p>

                            <Button className="w-full" onClick={handleGotIt}>
                                View Daily Wisdom →
                            </Button>
                        </div>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
