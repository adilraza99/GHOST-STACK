import { Card, CardHeader, CardTitle, CardContent } from '../components/Card';
import { EmptyState } from '../components/EmptyState';

export function Services() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Services Registry</CardTitle>
      </CardHeader>
      <CardContent>
        <EmptyState message="Services implementation pending." />
      </CardContent>
    </Card>
  );
}
