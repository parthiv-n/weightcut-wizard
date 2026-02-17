import { Sparkles } from "lucide-react";
import wizardAvatar from "@/assets/wizard-logo.png";

export default function Wizard() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-5 md:p-8 flex items-center justify-center">
      <div className="max-w-2xl mx-auto text-center space-y-8">
        {/* Wizard Image */}
        <div className="relative flex justify-center">
          <div className="relative">
            <img
              src={wizardAvatar}
              alt="Weight Cut Wizard"
              className="w-48 h-48 md:w-64 md:h-64 mx-auto drop-shadow-lg animate-pulse"
            />
            {/* Sparkles around wizard */}
            <div className="absolute -top-4 -right-4">
              <Sparkles className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <div className="absolute -bottom-2 -left-4">
              <Sparkles className="h-5 w-5 text-secondary animate-pulse delay-300" />
            </div>
            <div className="absolute top-1/2 -right-8">
              <Sparkles className="h-4 w-4 text-primary/60 animate-pulse delay-150" />
            </div>
          </div>
        </div>

        {/* Speech Bubble with "Coming Soon" */}
        <div className="relative">
          <div className="relative bg-gradient-to-br from-primary/10 to-secondary/10 border-2 border-primary/30 rounded-3xl p-6 md:p-8 shadow-lg">
            {/* Speech bubble tail pointing to wizard */}
            <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[20px] border-r-[20px] border-t-[20px] border-l-transparent border-r-transparent border-t-primary/30"></div>
            
            <div className="relative z-10">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Coming Soon
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground">
                The AI Wizard is preparing something magical...
              </p>
            </div>
          </div>
        </div>

        {/* Additional message */}
        <div className="space-y-2">
          <p className="text-sm md:text-base text-muted-foreground">
            Your mystical, science-based weight cut coach will be available soon!
          </p>
        </div>
      </div>
    </div>
  );
}
