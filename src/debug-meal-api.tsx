// Debug component to test meal planner API
// Add this to your app temporarily for testing

import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function MealPlannerDebug() {
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');

  const testAPI = async () => {
    setLoading(true);
    setError('');
    setResponse('');
    
    const requestBody = {
      prompt: "Generate a high protein meal plan for weight cutting",
      action: "generate",
      userData: {
        currentWeight: 80,
        goalWeight: 75,
        tdee: 2200,
        daysToWeighIn: 30
      }
    };
    
    setRequest(JSON.stringify(requestBody, null, 2));
    
    try {
      console.log('🧪 Testing meal planner API...');
      console.log('📤 Request:', requestBody);
      
      const result = await supabase.functions.invoke('meal-planner', {
        body: requestBody
      });
      
      console.log('📥 Raw response:', result);
      
      if (result.error) {
        setError(JSON.stringify(result.error, null, 2));
      } else {
        setResponse(JSON.stringify(result.data, null, 2));
        
        // Structure analysis
        console.log('\n🔍 STRUCTURE ANALYSIS:');
        if (result.data?.mealPlan) {
          console.log('✅ mealPlan exists');
          if (result.data.mealPlan.meals) {
            console.log(`✅ meals array (${result.data.mealPlan.meals.length} meals)`);
            result.data.mealPlan.meals.forEach((meal: any, idx: number) => {
              console.log(`   Meal ${idx + 1}: ${meal.name} (${meal.type}) - ${meal.calories} cal`);
            });
          } else {
            console.log('❌ No meals array found');
            console.log('Available keys:', Object.keys(result.data.mealPlan));
          }
        }
      }
    } catch (err: any) {
      console.error('❌ Error:', err);
      setError(err.message || 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>🧪 Meal Planner API Debug Tool</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={testAPI} disabled={loading}>
            {loading ? 'Testing...' : 'Test Meal Planner API'}
          </Button>
          
          {request && (
            <div>
              <h3 className="font-semibold mb-2">📤 Request:</h3>
              <Textarea value={request} readOnly className="font-mono text-sm" rows={8} />
            </div>
          )}
          
          {response && (
            <div>
              <h3 className="font-semibold mb-2 text-green-600">📥 Response:</h3>
              <Textarea value={response} readOnly className="font-mono text-sm" rows={15} />
            </div>
          )}
          
          {error && (
            <div>
              <h3 className="font-semibold mb-2 text-red-600">❌ Error:</h3>
              <Textarea value={error} readOnly className="font-mono text-sm" rows={8} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


