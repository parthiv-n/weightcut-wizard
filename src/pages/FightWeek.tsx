import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FightWeek() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-title font-bold">Fight Week Schedule</h1>
      <Card>
        <CardHeader>
          <CardTitle>7-Day Countdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Fight week planning coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}