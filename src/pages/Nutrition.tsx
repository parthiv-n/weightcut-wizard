import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Nutrition() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-title font-bold">Nutrition & Diet Tracking</h1>
      <Card>
        <CardHeader>
          <CardTitle>Meal Tracker</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Nutrition tracking coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}