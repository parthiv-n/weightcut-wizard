
// Enhanced Browser Test for WeightCut Wizard Meal Planner API
// This script tests the meal-planner Supabase Edge Function from the browser console

async function findSupabaseClient() {
  console.log('🔍 Searching for Supabase client...\n');
  
  // Method 1: Check global window objects
  if (window.supabaseClient) {
    console.log('✅ Found supabase client on window.supabaseClient');
    return window.supabaseClient;
  }
  
  if (window.supabase) {
    console.log('✅ Found supabase client on window.supabase');
    return window.supabase;
  }
  
  // Method 2: Try to access from React app internals
  try {
    const rootElement = document.querySelector('#root');
    if (rootElement && rootElement._reactInternals) {
      console.log('🔍 Attempting to access client from React internals...');
      // This is a more advanced approach that might work in some cases
      // but is not guaranteed due to React's internal structure changes
    }
  } catch (e) {
    console.log('⚠️  Could not access React internals');
  }
  
  // Method 3: Create new client if we can extract config
  console.log('🔍 Attempting to create new Supabase client...');
  
  // Try to extract Supabase config from the app
  const scripts = Array.from(document.querySelectorAll('script'));
  let supabaseUrl = null;
  let supabaseKey = null;
  
  // Look for Vite environment variables in the built app
  for (const script of scripts) {
    if (script.textContent && script.textContent.includes('VITE_SUPABASE_URL')) {
      const urlMatch = script.textContent.match(/VITE_SUPABASE_URL['"]\s*:\s*['"]([^'"]+)['"]/);
      const keyMatch = script.textContent.match(/VITE_SUPABASE_PUBLISHABLE_KEY['"]\s*:\s*['"]([^'"]+)['"]/);
      
      if (urlMatch) supabaseUrl = urlMatch[1];
      if (keyMatch) supabaseKey = keyMatch[1];
      break;
    }
  }
  
  // Fallback: Try common environment variable patterns
  if (!supabaseUrl || !supabaseKey) {
    // Check if they're available in any global config
    if (window.__VITE_ENV__) {
      supabaseUrl = window.__VITE_ENV__.VITE_SUPABASE_URL;
      supabaseKey = window.__VITE_ENV__.VITE_SUPABASE_PUBLISHABLE_KEY;
    }
  }
  
  if (supabaseUrl && supabaseKey) {
    console.log('✅ Found Supabase config, creating new client...');
    console.log('📍 Supabase URL:', supabaseUrl);
    console.log('🔑 Using publishable key:', supabaseKey.substring(0, 20) + '...');
    
    // Load Supabase from CDN if not available
    if (typeof window.supabase === 'undefined') {
      console.log('📦 Loading Supabase from CDN...');
      await loadSupabaseFromCDN();
    }
    
    if (window.supabase && window.supabase.createClient) {
      const client = window.supabase.createClient(supabaseUrl, supabaseKey, {
        auth: {
          storage: localStorage,
          persistSession: true,
          autoRefreshToken: true,
        }
      });
      console.log('✅ Created new Supabase client');
      return client;
    }
  }
  
  return null;
}

async function loadSupabaseFromCDN() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
    script.onload = () => {
      console.log('✅ Supabase loaded from CDN');
      resolve();
    };
    script.onerror = () => {
      console.log('❌ Failed to load Supabase from CDN');
      reject();
    };
    document.head.appendChild(script);
  });
}

async function checkAuthentication(supabase) {
  console.log('🔐 Checking authentication status...\n');
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.log('❌ Auth error:', error.message);
      return false;
    }
    
    if (session && session.user) {
      console.log('✅ User is authenticated');
      console.log('👤 User ID:', session.user.id);
      console.log('📧 Email:', session.user.email);
      console.log('🕒 Session expires:', new Date(session.expires_at * 1000).toLocaleString());
      return true;
    } else {
      console.log('❌ User is not authenticated');
      console.log('💡 Please log in to the app first, then run this test again');
      return false;
    }
  } catch (error) {
    console.log('❌ Failed to check authentication:', error.message);
    return false;
  }
}

async function testMealPlannerAPI() {
  console.log('🧪 Testing Meal Planner API from browser...\n');
  console.log('=' * 60 + '\n');
  
  // Step 1: Find or create Supabase client
  const supabase = await findSupabaseClient();
  
  if (!supabase) {
    console.log('❌ Could not find or create Supabase client\n');
    console.log('💡 TROUBLESHOOTING STEPS:');
    console.log('1. Make sure you are on the WeightCut Wizard app page');
    console.log('2. Try navigating to the Nutrition page first');
    console.log('3. Check if you are logged in');
    console.log('4. Open Network tab in DevTools and manually trigger a meal plan generation');
    console.log('5. Look for the request to "meal-planner" function in the Network tab');
    return;
  }
  
  // Step 2: Check authentication
  const isAuthenticated = await checkAuthentication(supabase);
  
  if (!isAuthenticated) {
    console.log('💡 Please log in to the app and try again');
    return;
  }
  
  // Step 3: Prepare test request
  const requestBody = {
    prompt: "Generate a high protein meal plan for cutting weight",
    action: "generate", 
    userData: {
      currentWeight: 80,
      goalWeight: 75,
      tdee: 2200,
      daysToWeighIn: 30
    }
  };
  
  console.log('\n📤 REQUEST DETAILS:');
  console.log('Function:', 'meal-planner');
  console.log('Body:', JSON.stringify(requestBody, null, 2));
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Step 4: Make API call
  try {
    console.log('🚀 Invoking meal-planner function...');
    const startTime = Date.now();
    
    const response = await supabase.functions.invoke('meal-planner', {
      body: requestBody
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️  Request completed in ${duration}ms\n`);
    
    // Step 5: Analyze response
    console.log('📥 RAW RESPONSE:');
    console.log('Status:', response.status || 'undefined');
    console.log('Error:', response.error || 'none');
    console.log('Data type:', typeof response.data);
    console.log('Data:', response.data);
    
    if (response.error) {
      console.log('\n❌ ERROR DETAILS:');
      console.log('Error message:', response.error.message || 'No message');
      console.log('Error details:', response.error.details || 'No details');
      console.log('Error hint:', response.error.hint || 'No hint');
      console.log('Error code:', response.error.code || 'No code');
      
      // Common error troubleshooting
      if (response.error.message && response.error.message.includes('JWT')) {
        console.log('\n💡 JWT Error - Try refreshing the page and logging in again');
      }
      if (response.error.message && response.error.message.includes('rate limit')) {
        console.log('\n💡 Rate Limit - Wait a moment and try again');
      }
      if (response.error.message && response.error.message.includes('API key')) {
        console.log('\n💡 API Key Issue - Check Supabase configuration');
      }
      
      return;
    }
    
    if (response.data) {
      console.log('\n🔍 RESPONSE ANALYSIS:');
      console.log('Response keys:', Object.keys(response.data));
      
      if (response.data.mealPlan) {
        console.log('✅ mealPlan exists');
        console.log('mealPlan type:', typeof response.data.mealPlan);
        console.log('mealPlan keys:', Object.keys(response.data.mealPlan));
        
        if (response.data.mealPlan.meals && Array.isArray(response.data.mealPlan.meals)) {
          console.log(`✅ meals array found (${response.data.mealPlan.meals.length} meals)`);
          
          response.data.mealPlan.meals.forEach((meal, idx) => {
            console.log(`\n   📍 Meal ${idx + 1}:`);
            console.log(`      Name: ${meal.name || 'Unnamed'}`);
            console.log(`      Type: ${meal.type || 'no-type'}`);
            console.log(`      Calories: ${meal.calories || 0}`);
            console.log(`      Protein: ${meal.protein || 0}g`);
            console.log(`      Carbs: ${meal.carbs || 0}g`);
            console.log(`      Fats: ${meal.fats || 0}g`);
            if (meal.ingredients && meal.ingredients.length > 0) {
              console.log(`      Ingredients: ${meal.ingredients.length} items`);
            }
          });
          
          // Calculate totals
          const totals = response.data.mealPlan.meals.reduce((acc, meal) => ({
            calories: acc.calories + (meal.calories || 0),
            protein: acc.protein + (meal.protein || 0),
            carbs: acc.carbs + (meal.carbs || 0),
            fats: acc.fats + (meal.fats || 0)
          }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
          
          console.log('\n📊 TOTALS:');
          console.log(`   Calories: ${totals.calories}`);
          console.log(`   Protein: ${totals.protein}g`);
          console.log(`   Carbs: ${totals.carbs}g`);
          console.log(`   Fats: ${totals.fats}g`);
          
        } else {
          console.log('❌ No meals array found in mealPlan');
          console.log('mealPlan content:', response.data.mealPlan);
        }
        
        // Check for safety information
        if (response.data.safetyStatus) {
          console.log('\n🛡️  SAFETY INFO:');
          console.log('Status:', response.data.safetyStatus);
          console.log('Message:', response.data.safetyMessage);
        }
        
        if (response.data.dailyCalorieTarget) {
          console.log('🎯 Daily Calorie Target:', response.data.dailyCalorieTarget);
        }
        
      } else {
        console.log('❌ No mealPlan in response');
        console.log('Available keys:', Object.keys(response.data));
      }
    } else {
      console.log('❌ No data in response');
    }
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ EXCEPTION OCCURRED:');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Network-specific error handling
    if (error.message.includes('fetch')) {
      console.log('\n💡 Network Error - Check your internet connection');
    }
    if (error.message.includes('CORS')) {
      console.log('\n💡 CORS Error - This might be a development environment issue');
    }
  }
}

// Instructions and auto-execution
console.log('🚀 WeightCut Wizard Meal Planner API Test');
console.log('=' * 50);
console.log('📋 INSTRUCTIONS:');
console.log('1. Make sure you are logged into the WeightCut Wizard app');
console.log('2. This test will automatically run in 2 seconds...');
console.log('3. Or manually run: testMealPlannerAPI()');
console.log('');
console.log('💡 TROUBLESHOOTING:');
console.log('- If client not found: Navigate to Nutrition page first');
console.log('- If auth fails: Log out and log back in');
console.log('- If API fails: Check Network tab for detailed error info');
console.log('');

// Auto-run the test after a short delay
setTimeout(() => {
  testMealPlannerAPI();
}, 2000);
