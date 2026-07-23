// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import { createFileRoute } from '@/lib/routerCompat';
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { adminGetGlobalSeo, adminSaveGlobalSeo, adminUploadAsset } from '@/lib/api/db.functions';
import { useAuth } from '@/components/auth-context';
import { toast } from '@/lib/toast';
import { Save, UploadCloud } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/seo/')({
  component: GlobalSeoPage,
});

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
      {label}
    </label>
    {children}
  </div>
);

function GlobalSeoPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({
    siteName: 'MooN Travel',
    defaultTitle: 'Luxury Curated Holidays',
    defaultDescription: '',
    defaultKeywords: '',
    ogImage: '',
    twitterHandle: '',
    googleAnalyticsId: '',
    paymentQrUrl: '',
    paymentUpiName: '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const auth = { email: user?.email!, sessionToken: user?.session_token! };
      const data = await adminGetGlobalSeo({ data: { auth } });
      if (data) {
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch (e) {
      toast.error('Failed to load SEO settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const auth = { email: user?.email!, sessionToken: user?.session_token! };
      const res = await adminSaveGlobalSeo({ data: { auth, settings } });
      if (res.success) {
        toast.success('Global SEO settings saved!');
      }
    } catch (e) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const uploadQr = async (file: File | null) => {
    if (!file) return;
    try {
      const auth = { email: user?.email!, sessionToken: user?.session_token! };
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        toast.info('Uploading QR Code...');
        const result = await adminUploadAsset({
          data: { auth, originalFilename: file.name, mimeType: file.type as any, base64 },
        });
        if (result.success) {
          update('paymentQrUrl', result.publicUrl!);
          toast.success('QR Code uploaded!');
        } else {
          toast.error('Upload failed');
        }
      };
      reader.readAsDataURL(file);
    } catch (e) {
      toast.error('Failed to upload image');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Global Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage site-wide search engine optimization properties, metadata, and payment
            configurations.
          </p>
        </div>
        <Button onClick={handleSave} disabled={loading || saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <div>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="social">Social (Open Graph)</TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <div className="grid gap-6">
              <Field label="Site Name">
                <Input
                  value={settings.siteName || ''}
                  onChange={(e) => update('siteName', e.target.value)}
                  placeholder="e.g. MooN Travel"
                />
              </Field>
              <Field label="Default Meta Title">
                <Input
                  value={settings.defaultTitle || ''}
                  onChange={(e) => update('defaultTitle', e.target.value)}
                  placeholder="Default title for pages without one"
                />
              </Field>
              <Field label="Default Meta Description">
                <Textarea
                  value={settings.defaultDescription || ''}
                  onChange={(e) => update('defaultDescription', e.target.value)}
                  placeholder="Default description"
                  className="min-h-24"
                />
              </Field>
              <Field label="Global Keywords">
                <Input
                  value={settings.defaultKeywords || ''}
                  onChange={(e) => update('defaultKeywords', e.target.value)}
                  placeholder="Comma-separated default keywords"
                />
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="social" className="space-y-6">
            <div className="grid gap-6">
              <Field label="Default Open Graph Image URL">
                <Input
                  value={settings.ogImage || ''}
                  onChange={(e) => update('ogImage', e.target.value)}
                  placeholder="https://yourdomain.com/default-og.jpg"
                />
              </Field>
              <Field label="Twitter Handle">
                <Input
                  value={settings.twitterHandle || ''}
                  onChange={(e) => update('twitterHandle', e.target.value)}
                  placeholder="@MooNTravel"
                />
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            <div className="grid gap-6">
              <Field label="Google Analytics ID (GA4)">
                <Input
                  placeholder="G-XXXXXXXXXX"
                  value={settings.googleAnalyticsId}
                  onChange={(e) => update('googleAnalyticsId', e.target.value)}
                />
              </Field>
            </div>
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <div className="grid gap-6 max-w-xl">
              <Field label="Payee Name / UPI ID">
                <Input
                  placeholder="e.g. KAKARLA VEERA VENKATA SANDEEP"
                  value={settings.paymentUpiName || ''}
                  onChange={(e) => update('paymentUpiName', e.target.value)}
                />
              </Field>
              <Field label="QR Code Image">
                <div className="border border-dashed border-border rounded-lg p-6 text-center space-y-4 bg-muted/20">
                  {settings.paymentQrUrl ? (
                    <div className="flex flex-col items-center gap-4">
                      <img
                        src={settings.paymentQrUrl}
                        alt="QR Code"
                        className="w-32 h-32 object-contain bg-white rounded-lg shadow-sm p-2"
                      />
                      <label className="cursor-pointer text-sm font-semibold text-primary hover:underline">
                        Change Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => uploadQr(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-2">
                      <UploadCloud className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm font-semibold">Upload QR Code</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => uploadQr(e.target.files?.[0] || null)}
                      />
                    </label>
                  )}
                </div>
              </Field>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
