import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function WeightTracker() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-title font-bold">Weight Tracker</h1>
      <Card>
        <CardHeader>
          <CardTitle>Daily Weight Log</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Weight tracking coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}