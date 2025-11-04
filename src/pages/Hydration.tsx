import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Hydration() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-title font-bold">Hydration Tracker</h1>
      <Card>
        <CardHeader>
          <CardTitle>Daily Hydration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Hydration tracking coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}