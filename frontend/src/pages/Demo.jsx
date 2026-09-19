import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PlaySquare } from 'lucide-react';

export function Demo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Demo Simulator</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState icon={PlaySquare} message="Demo simulator implementation pending." />
      </CardContent>
    </Card>
  );
}
