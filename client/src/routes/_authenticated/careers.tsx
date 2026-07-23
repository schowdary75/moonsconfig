// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { getAdminApplications, updateApplicationStatus } from '@/lib/api/db.functions';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Loader2, Mail, ExternalLink, Sparkles } from 'lucide-react';
import { format } from 'date-fns';

export const Route = createFileRoute('/_authenticated/careers')({
  component: CareersAdminPage,
  loader: async () => await getAdminApplications(),
});

function CareersAdminPage() {
  const initialApps = Route.useLoaderData();
  const [applications, setApplications] = useState(initialApps);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const handleStatusUpdate = async (
    id: number,
    status: 'shortlisted' | 'rejected',
    email: string,
    name: string,
    jobTitle: string,
  ) => {
    try {
      setLoading(true);
      const res = await updateApplicationStatus({ data: { id, status, email, name, jobTitle } });
      if (res.success) {
        setApplications((apps) => apps.map((app) => (app.id === id ? { ...app, status } : app)));
        setSelectedApp(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-display tracking-tight">Careers Applications</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review candidates, evaluate mock tests, and manage interviews.
            <span className="inline-flex items-center gap-1 ml-2 text-[11px] font-semibold text-primary">
              <Sparkles className="w-3 h-3" /> Maya auto-shortlists candidates scoring 80%+ and
              emails the invite
            </span>
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow key={app.id}>
                <TableCell>
                  <div className="font-medium">{app.name}</div>
                  <div className="text-xs text-muted-foreground">{app.email}</div>
                </TableCell>
                <TableCell>{app.job_title || 'Unknown Role'}</TableCell>
                <TableCell>{format(new Date(app.created_at), 'MMM d, yyyy')}</TableCell>
                <TableCell>
                  {app.mock_test_score !== null ? (
                    <Badge
                      variant={
                        app.mock_test_score >= 80
                          ? 'default'
                          : app.mock_test_score >= 50
                            ? 'secondary'
                            : 'destructive'
                      }
                    >
                      {app.mock_test_score}%
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">N/A</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      app.status === 'pending'
                        ? 'outline'
                        : app.status === 'shortlisted'
                          ? 'default'
                          : 'destructive'
                    }
                  >
                    {app.status}
                  </Badge>
                </TableCell>
                <TableCell className="p-2 align-middle text-right">
                  <div className="flex w-full items-center justify-end rounded-md shadow-sm border border-border overflow-hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 rounded-none h-8 text-xs bg-background hover:bg-muted"
                      onClick={() => setSelectedApp(app)}
                    >
                      Evaluate
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {applications.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No applications found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedApp} onOpenChange={() => setSelectedApp(null)}>
        <SheetContent className="sm:overflow-y-auto">
          {selectedApp && (
            <>
              <SheetHeader className="mb-6">
                <SheetTitle className="text-2xl font-display">{selectedApp.name}</SheetTitle>
                <SheetDescription>
                  Application for {selectedApp.job_title || 'Role'}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm bg-muted/50 p-4 rounded-xl border border-border/50">
                  <div>
                    <span className="text-muted-foreground block text-xs font-semibold mb-1">
                      Email
                    </span>
                    <a
                      href={`mailto:${selectedApp.email}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      <Mail className="w-3 h-3" />
                      {selectedApp.email}
                    </a>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs font-semibold mb-1">
                      Phone
                    </span>
                    <span>{selectedApp.phone}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs font-semibold mb-1">
                      Applied Date
                    </span>
                    <span>{format(new Date(selectedApp.created_at), 'PPP')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs font-semibold mb-1">
                      Status
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {selectedApp.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-3">Cover Letter</h4>
                  <div className="bg-card border rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-sm">
                    {selectedApp.cover_letter}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-3 flex justify-between items-center">
                    Mock Test Result
                    {selectedApp.mock_test_score !== null && (
                      <Badge
                        className="ml-2"
                        variant={selectedApp.mock_test_score >= 80 ? 'default' : 'secondary'}
                      >
                        {selectedApp.mock_test_score}%
                      </Badge>
                    )}
                  </h4>
                  <div className="bg-card border rounded-xl p-4 text-sm shadow-sm space-y-3">
                    {selectedApp.mock_test_answers ? (
                      Object.entries(
                        typeof selectedApp.mock_test_answers === 'string'
                          ? JSON.parse(selectedApp.mock_test_answers)
                          : selectedApp.mock_test_answers,
                      ).map(([key, val]) => (
                        <div key={key} className="border-b last:border-0 pb-3 last:pb-0">
                          <p className="text-muted-foreground text-xs font-semibold mb-1">
                            Question {parseInt(key) + 1}
                          </p>
                          <p className="font-medium">Answer provided: {String(val)}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No test answers recorded.</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-3">Resume Attachment</h4>
                  <a
                    href={
                      selectedApp.resume_url?.startsWith('http')
                        ? selectedApp.resume_url
                        : selectedApp.resume_url || '#'
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="outline" className="w-full flex justify-between items-center">
                      View Document <ExternalLink className="w-4 h-4 ml-2" />
                    </Button>
                  </a>
                </div>
              </div>

              {selectedApp.status === 'pending' && (
                <div className="mt-8 pt-6 border-t flex gap-4">
                  <Button
                    variant="outline"
                    className="flex-1 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={loading}
                    onClick={() =>
                      handleStatusUpdate(
                        selectedApp.id,
                        'rejected',
                        selectedApp.email,
                        selectedApp.name,
                        selectedApp.job_title || 'Role',
                      )
                    }
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Reject
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={loading}
                    onClick={() =>
                      handleStatusUpdate(
                        selectedApp.id,
                        'shortlisted',
                        selectedApp.email,
                        selectedApp.name,
                        selectedApp.job_title || 'Role',
                      )
                    }
                  >
                    {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Shortlist & Invite
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
