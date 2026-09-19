import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle } from 'lucide-react';

export function Incidents() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident Intelligence</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState icon={AlertTriangle} message="Incidents implementation pending." />
      </CardContent>
    </Card>
  );
}
