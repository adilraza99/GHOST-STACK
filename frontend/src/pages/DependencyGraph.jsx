import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Network } from 'lucide-react';

export function DependencyGraph() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dependency Graph</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState icon={Network} message="Graph visualization implementation pending." />
      </CardContent>
    </Card>
  );
}
