import { useDebouncedCallback } from "@/hooks/useDebounce";

// Fighter macro distribution: 40% protein, 30% carbs, 30% fats
export function calculateMacrosFromCalories(calories: number) {
  const proteinGrams = Math.round(calories * 0.40 / 4);
  const carbsGrams = Math.round(calories * 0.30 / 4);
  const fatsGrams = Math.round((calories - proteinGrams * 4 - carbsGrams * 4) / 9);

  return {
    protein_g: proteinGrams.toString(),
    carbs_g: carbsGrams.toString(),
    fats_g: fatsGrams.toString()
  };
}

export function adjustMacrosToMatchCalories(
  changedMacro: 'protein' | 'carbs' | 'fats',
  newValue: number,
  currentMacros: { protein: number; carbs: number; fats: number },
  calorieGoal: number
) {
  const MACRO_FLOOR = 10;
  const calPerGram = { protein: 4, carbs: 4, fats: 9 };

  const changedCalories = newValue * calPerGram[changedMacro];
  const remainingCalories = calorieGoal - changedCalories;

  const others = (['protein', 'carbs', 'fats'] as const).filter(m => m !== changedMacro);
  const [a, b] = others;

  const currentA = currentMacros[a];
  const currentB = currentMacros[b];
  const currentOtherTotal = currentA + currentB;

  let newA: number, newB: number;

  if (currentOtherTotal > 0) {
    const ratioA = currentA / currentOtherTotal;
    newA = Math.round((remainingCalories * ratioA) / calPerGram[a]);
    newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
  } else {
    newA = Math.round((remainingCalories / 2) / calPerGram[a]);
    newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
  }

  if (newA < MACRO_FLOOR) {
    newA = MACRO_FLOOR;
    newB = Math.round((remainingCalories - newA * calPerGram[a]) / calPerGram[b]);
  }
  if (newB < MACRO_FLOOR) {
    newB = MACRO_FLOOR;
    newA = Math.round((remainingCalories - newB * calPerGram[b]) / calPerGram[a]);
  }
  newA = Math.max(newA, MACRO_FLOOR);
  newB = Math.max(newB, MACRO_FLOOR);

  return {
    [changedMacro]: newValue,
    [a]: newA,
    [b]: newB,
  } as { protein: number; carbs: number; fats: number };
}

export function useMacroCalculation() {
  const debouncedMacroCalculation = useDebouncedCallback((calories: string, updateFunction: (meal: any) => void) => {
    const calorieValue = parseInt(calories) || 0;
    const macros = calculateMacrosFromCalories(calorieValue);
    updateFunction((prev: any) => ({ ...prev, ...macros }));
  }, 300);

  const handleCalorieChange = (calories: string, updateFunction: (meal: any) => void) => {
    updateFunction((prev: any) => ({ ...prev, calories }));
    debouncedMacroCalculation(calories, updateFunction);
  };

  return {
    calculateMacrosFromCalories,
    adjustMacrosToMatchCalories,
    debouncedMacroCalculation,
    handleCalorieChange,
  };
}
