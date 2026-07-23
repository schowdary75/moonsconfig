// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { Target, Users, Filter, Plus, Download, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  adminCreateAudience,
  adminDeleteAudience,
  adminGetAudiences,
  adminAiGenerateAudienceRule,
} from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';

export const Route = createFileRoute('/_authenticated/marketing/audiences')({
  component: AudiencesPage,
});

function AudiencesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const auth = user?.session_token ? { email: user.email, sessionToken: user.session_token } : null;
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    rules: 'destination = Dubai',
    size: 0,
  });
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || !auth) return;
    setIsAiGenerating(true);
    try {
      const rule = await adminAiGenerateAudienceRule({ data: { auth, prompt: aiPrompt } });
      setForm((prev) => ({ ...prev, rules: rule }));
      toast.success('AI generated audience rule!');
    } catch (err) {
      toast.error('Failed to generate rule via AI');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const { data: audiences = [], isLoading } = useQuery({
    queryKey: ['mktg_audiences', user?.session_token],
    queryFn: async () => {
      return await adminGetAudiences({ data: { auth: auth! } });
    },
    enabled: !!auth,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return audiences;
    return audiences.filter((aud: any) =>
      [aud.name, aud.description, aud.rules]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    );
  }, [audiences, query]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!auth) throw new Error('Missing session');
      return adminCreateAudience({ data: { auth, audience: form } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_audiences'] });
      setShowForm(false);
      setForm({ name: '', description: '', rules: 'destination = Dubai', size: 0 });
      toast.success('Audience created');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to create audience'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!auth) throw new Error('Missing session');
      return adminDeleteAudience({ data: { auth, id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mktg_audiences'] });
      toast.success('Audience deleted');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to delete audience'),
  });

  function deleteAudience(aud: any) {
    if (
      !window.confirm(
        `Delete audience "${aud.name}"? Campaigns using this segment may lose targeting context.`,
      )
    )
      return;
    deleteMutation.mutate(aud.id);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />

          <Button onClick={() => setShowForm((value) => !value)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Audience
          </Button>
        </div>

        {showForm && (
          <form
            className="rounded-lg border bg-card p-5 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                placeholder="Audience name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />

              <div className="col-span-1 md:col-span-2 relative">
                <Input
                  placeholder="Custom rule (e.g. theme = 'Honeymoon')"
                  value={form.rules}
                  onChange={(e) => setForm({ ...form, rules: e.target.value })}
                />
              </div>

              <div className="col-span-1 md:col-span-4 flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <Sparkles className="w-4 h-4 text-primary" />
                <Input
                  placeholder="Or let AI build the rule: 'Find me honeymooners going to Bali'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 bg-white"
                />
                <Button
                  type="button"
                  onClick={handleAiGenerate}
                  disabled={isAiGenerating || !aiPrompt.trim()}
                >
                  {isAiGenerating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    'Generate Rule'
                  )}
                </Button>
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving...' : 'Save Audience'}
              </Button>
            </div>
          </form>
        )}

        <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
          <div className="p-6 border-b flex items-center justify-between bg-card">
            <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-rose-500" /> Saved Segments
            </h2>
            <div className="flex gap-2">
              <div className="relative">
                <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Input
                  placeholder="Filter audiences..."
                  className="pl-9 h-9 text-sm w-64"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-100 text-xs font-bold text-zinc-400 uppercase tracking-wider bg-zinc-50/50">
                <div className="col-span-3 pl-4">Audience Name</div>
                <div className="col-span-4">Targeting Rules</div>
                <div className="col-span-2 text-right">Size (Users)</div>
                <div className="col-span-2 text-right">Last Updated</div>
                <div className="col-span-1 text-right pr-4">Actions</div>
              </div>

              <div className="divide-y divide-zinc-100 bg-white">
                {isLoading ? (
                  <div className="p-8 text-center text-zinc-500">Loading audiences...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">No audiences found.</div>
                ) : (
                  filtered.map((aud: any) => (
                    <div
                      key={aud.id}
                      className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-rose-50/30 transition-colors group"
                    >
                      <div className="col-span-3 pl-4">
                        <div className="font-semibold text-zinc-900 flex items-center gap-2">
                          <Users className="w-4 h-4 text-zinc-400 group-hover:text-rose-500 transition-colors" />
                          {aud.name}
                        </div>
                      </div>

                      <div className="col-span-4">
                        <code className="text-xs bg-zinc-50 text-zinc-600 px-2 py-1 rounded border border-zinc-100 break-words">
                          {aud.rules}
                        </code>
                      </div>

                      <div className="col-span-2 text-right">
                        <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                          {(aud.size || 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="col-span-2 text-right text-sm text-zinc-500">
                        {new Date(aud.createdAt).toLocaleDateString()}
                      </div>

                      <div className="col-span-1 text-right pr-4 flex justify-end gap-1">
                        <button
                          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete audience"
                          onClick={() => deleteAudience(aud)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Export CSV"
                          onClick={() => exportAudience(aud)}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function exportAudience(aud: any) {
  const csv = [
    ['id', 'name', 'description', 'rules', 'size', 'createdAt'].join(','),
    [aud.id, aud.name, aud.description || '', aud.rules || '', aud.size || 0, aud.createdAt || '']
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(','),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(aud.name || 'audience')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
