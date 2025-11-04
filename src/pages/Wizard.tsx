import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Wizard() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-title font-bold">AI Weight Cut Wizard</h1>
      <Card>
        <CardHeader>
          <CardTitle>Chat with the Wizard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">AI wizard chat coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}