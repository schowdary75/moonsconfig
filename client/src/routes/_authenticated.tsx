import { createFileRoute, Outlet } from '@/lib/routerCompat';
import { CrmLayout } from '@/components/crm-layout';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <CrmLayout>
      <Outlet />
    </CrmLayout>
  );
}
