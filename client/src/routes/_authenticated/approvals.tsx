// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/components/auth-context';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  adminGetListingRevisions,
  adminGetVendorsAll,
  adminReviewListingRevision,
  adminUpdateVendorStatus,
  type ListingRevisionRow,
  type VendorProfile,
} from '@/lib/api/db.functions';

export const Route = createFileRoute('/_authenticated/approvals')({
  component: Approvals,
});

function Approvals() {
  const { user } = useAuth();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [revisions, setRevisions] = useState<ListingRevisionRow[]>([]);

  async function load() {
    if (!auth) return;
    const [vendorRows, revisionRows] = await Promise.all([
      adminGetVendorsAll({ data: { auth } }),
      adminGetListingRevisions({ data: { auth, status: 'pending_review' } }),
    ]);
    setVendors(vendorRows.filter((vendor) => vendor.status === 'pending_review'));
    setRevisions(revisionRows);
  }

  useEffect(() => {
    load().catch((err) =>
      toast.error(err instanceof Error ? err.message : 'Failed to load approvals'),
    );
  }, [user?.session_token]);

  async function reviewVendor(vendorId: number, status: 'approved' | 'rejected') {
    if (!auth) return;
    await adminUpdateVendorStatus({ data: { auth, vendorId, status } });
    toast.success(`Vendor ${status}`);
    await load();
  }

  async function reviewRevision(revisionId: number, action: 'approve' | 'reject') {
    if (!auth) return;
    await adminReviewListingRevision({ data: { auth, revisionId, action } });
    toast.success(`Listing ${action}d`);
    await load();
  }

  return (
    <div className="space-y-6">
      <div />

      <Tabs defaultValue="vendors">
        <TabsList>
          <TabsTrigger value="vendors">Vendor Applications ({vendors.length})</TabsTrigger>
          <TabsTrigger value="listings">Listing Revisions ({revisions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vendors">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">{vendor.company_name}</TableCell>
                    <TableCell>
                      {vendor.contact_name}
                      <div className="text-xs text-muted-foreground">{vendor.email}</div>
                    </TableCell>
                    <TableCell>{vendor.service_categories.join(', ')}</TableCell>
                    <TableCell>{vendor.coverage_areas}</TableCell>
                    <TableCell className="p-2 align-middle text-right">
                      <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => reviewVendor(vendor.id, 'approved')}
                        >
                          <Check className="mr-2 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => reviewVendor(vendor.id, 'rejected')}
                        >
                          <X className="mr-2 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {vendors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No pending vendors.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="listings">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Listing</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision) => (
                  <TableRow key={revision.id}>
                    <TableCell>{revision.vendor_name}</TableCell>
                    <TableCell className="capitalize">{revision.listing_type}</TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {revision.payload?.name || revision.payload?.title}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {revision.payload?.description}
                      </div>
                    </TableCell>
                    <TableCell>{revision.payload?.destination}</TableCell>
                    <TableCell className="p-2 align-middle text-right">
                      <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none border-r border-border h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => reviewRevision(revision.id, 'approve')}
                        >
                          <Check className="mr-2 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                          onClick={() => reviewRevision(revision.id, 'reject')}
                        >
                          <X className="mr-2 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {revisions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No pending listing revisions.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
