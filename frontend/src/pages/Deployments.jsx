import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Rocket } from 'lucide-react';

export function Deployments() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment Analysis</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState icon={Rocket} message="Deployments implementation pending." />
      </CardContent>
    </Card>
  );
}
