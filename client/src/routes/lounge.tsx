// @ts-nocheck -- behavior-parity screen pending incremental type hardening.
import React, { useEffect, useState } from 'react';
import { createFileRoute, useNavigate } from '@/lib/routerCompat';
import {
  publicGetPackageDetail,
  getLoungeComments,
  submitLoungeComment,
  type PackageDetail,
} from '@/lib/api/db.functions';
import {
  CalendarDays,
  MapPin,
  MessageSquare,
  Send,
  CheckCircle,
  Sparkles,
  User,
  Clock,
  Compass,
  Sunrise,
  Sunset,
  Phone,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/lib/toast';
import logo from '@/assets/logo.png';

export const Route = createFileRoute('/lounge')({
  component: ClientLoungePage,
});

interface Comment {
  id: number;
  author: string;
  comment_text: string;
  day_number: number;
  created_at: string;
}

function ClientLoungePage() {
  const navigate = useNavigate();
  // Get packageId from search params
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const packageId = Number(searchParams.get('packageId') || '1');

  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activeDayComment, setActiveDayComment] = useState<number | null>(null);

  // New comment input states
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Approval workspace states
  const isApproved = false;
  const [clientName, setClientName] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // Chat Designer sliding panel states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [generalCommentAuthor, setGeneralCommentAuthor] = useState('');
  const [generalCommentText, setGeneralCommentText] = useState('');
  const [submittingGeneralComment, setSubmittingGeneralComment] = useState(false);

  const loadData = async () => {
    try {
      const [detail, commentRows] = await Promise.all([
        publicGetPackageDetail({ data: { id: packageId } }),
        getLoungeComments({ data: { packageId } }),
      ]);
      setPkg(detail);
      setComments(commentRows as Comment[]);
    } catch (err) {
      console.error('Failed to load lounge details:', err);
      toast.error('Could not load itinerary. Please verify your link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [packageId]);

  const handlePostComment = async (dayNum: number) => {
    if (!commentAuthor.trim() || !commentText.trim()) {
      toast.error('Please enter both your name and comment.');
      return;
    }
    setSubmittingComment(true);
    try {
      await submitLoungeComment({
        data: {
          packageId,
          author: commentAuthor,
          commentText: commentText,
          dayNumber: dayNum,
        },
      });
      toast.success('Feedback submitted directly to your designer!');
      setCommentText('');
      // Reload comments
      const updated = await getLoungeComments({ data: { packageId } });
      setComments(updated as Comment[]);
    } catch (err) {
      console.error('Failed to save comment:', err);
      toast.error('Failed to post comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handlePostGeneralComment = async () => {
    if (!generalCommentAuthor.trim() || !generalCommentText.trim()) {
      toast.error('Please enter both your name and message.');
      return;
    }
    setSubmittingGeneralComment(true);
    try {
      await submitLoungeComment({
        data: {
          packageId,
          author: generalCommentAuthor,
          commentText: generalCommentText,
          dayNumber: 0, // 0 indicates general chat with designer
        },
      });
      setGeneralCommentText('');
      // Reload comments
      const updated = await getLoungeComments({ data: { packageId } });
      setComments(updated as Comment[]);
    } catch (err) {
      console.error('Failed to save comment:', err);
      toast.error('Failed to send message.');
    } finally {
      setSubmittingGeneralComment(false);
    }
  };

  const handleApproveQuote = () => {
    if (!clientName.trim()) {
      toast.error('Please enter your full name to approve.');
      return;
    }
    setShowApprovalModal(false);
    toast('Sign in to review the final terms and record your secure e-signature.');
    navigate({ to: '/traveller-hub' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F5] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin mb-4" />
        <h2 className="text-xl font-bold font-display text-foreground">
          Preparing your Client Lounge...
        </h2>
        <p className="text-xs text-muted-foreground mt-1">Fetching your bespoke travel itinerary</p>
      </div>
    );
  }

  if (!pkg) {
    return (
      <div className="min-h-screen bg-[#F9F8F5] flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-destructive font-display">
          Bespoke Proposal Not Found
        </h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          The itinerary link you accessed might have expired or is invalid. Please contact your
          travel advisor.
        </p>
      </div>
    );
  }

  const generalComments = comments.filter((c) => c.day_number === 0);

  return (
    <div className="min-h-screen bg-[#F9F8F5] text-foreground font-sans">
      {/* Luxury floating nav bar */}
      <header className="sticky top-0 z-40 bg-card/85 backdrop-blur-md border-b border-border/40 py-3.5 px-6 flex justify-between items-center max-w-7xl mx-auto w-full rounded-b-xl shadow-sm">
        <div className="flex items-center gap-3">
          <img src={logo} alt="MooNs" className="h-9 w-auto object-contain" />
          <div>
            <h1 className="font-bold text-sm tracking-tight">MooNs</h1>
            <p className="text-[10px] text-primary uppercase font-bold tracking-widest leading-none">
              Client Collaboration Lounge
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsChatOpen(true)}
            className="h-8 gap-1 text-xs border-primary/20 hover:bg-primary/5 text-primary"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat Designer
          </Button>
          {!isApproved ? (
            <Button
              onClick={() => setShowApprovalModal(true)}
              size="sm"
              className="h-8 text-xs font-semibold bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Approve Itinerary
            </Button>
          ) : (
            <Badge className="bg-emerald-600 text-white border-none py-1 px-3 text-[11px] gap-1 font-bold">
              <CheckCircle className="w-3.5 h-3.5" /> Approved
            </Badge>
          )}
        </div>
      </header>

      {/* Hero banner */}
      <main className="max-w-7xl mx-auto px-4 py-8 grid gap-8 md:grid-cols-[1fr_360px] items-start">
        {/* Left Column: Itinerary Details */}
        <div className="space-y-8">
          {/* Package Overview Card */}
          <div className="relative rounded-2xl overflow-hidden border bg-card shadow-sm">
            <div className="relative h-[280px]">
              {pkg.image_url ? (
                <img
                  src={pkg.image_url}
                  alt={pkg.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.src =
                      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?q=80&w=800&auto=format&fit=crop';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground">
                  Proposal Preview Image
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white space-y-2">
                <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-primary px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md">
                  Bespoke Proposal
                </span>
                <h2 className="text-2xl md:text-3xl font-bold font-display">{pkg.name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-primary" /> {pkg.destination}, {pkg.country}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5 text-primary" /> {pkg.days} Days /{' '}
                    {pkg.nights} Nights
                  </span>
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-primary" /> {pkg.category} Tier
                  </span>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm leading-relaxed text-muted-foreground">{pkg.description}</p>
            </div>
          </div>

          {/* Daily Schedule */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold font-display text-foreground border-b pb-2">
              Bespoke Day-by-Day Schedule
            </h3>

            <div className="space-y-4">
              {pkg.itinerary.map((day, index) => {
                const dayComments = comments.filter((c) => c.day_number === day.day_number);
                return (
                  <div
                    key={day.day_number}
                    className="p-6 rounded-xl border bg-card shadow-sm hover:shadow-md transition-all flex flex-col gap-4"
                  >
                    {/* Day Header */}
                    <div className="flex justify-between items-start border-b pb-3 border-border/40">
                      <div>
                        <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
                          Day {day.day_number}
                        </span>
                        <h4 className="font-bold text-sm text-foreground mt-0.5">{day.title}</h4>
                      </div>
                      {day.city && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] gap-1 py-0.5 px-2 bg-muted/60"
                        >
                          <MapPin className="w-3.5 h-3.5 text-muted-foreground" /> {day.city}
                        </Badge>
                      )}
                    </div>

                    {/* Summary */}
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {day.description}
                    </p>

                    {/* Default Luxury Pillars preview */}
                    <div className="grid grid-cols-3 gap-3 border-t border-border/40 pt-3 text-[11px]">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Sunrise className="w-3.5 h-3.5 text-amber-500" /> Morning Experience
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Compass className="w-3.5 h-3.5 text-blue-500" /> Afternoon Sightseeing
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Sunset className="w-3.5 h-3.5 text-purple-500" /> Evening Dinner
                      </div>
                    </div>

                    {/* Feedback commenting panel toggle */}
                    <div className="border-t border-border/40 pt-3 flex justify-between items-center">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveDayComment(
                            activeDayComment === day.day_number ? null : day.day_number,
                          )
                        }
                        className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        {dayComments.length > 0
                          ? `Feedback Box (${dayComments.length})`
                          : 'Share Itinerary Feedback'}
                      </button>

                      {dayComments.length > 0 && (
                        <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Last update:{' '}
                          {new Date(dayComments[0].created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    {/* Expandable Comments Drawer */}
                    {activeDayComment === day.day_number && (
                      <div className="mt-3 bg-muted/40 p-4 rounded-lg border border-border/60 space-y-4">
                        <h5 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Itinerary Collaborative Feedback
                        </h5>

                        {/* Comments list */}
                        <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                          {dayComments.map((c) => (
                            <div
                              key={c.id}
                              className="p-3 bg-card rounded-md border border-border/40 text-xs"
                            >
                              <div className="flex justify-between items-center font-bold mb-1">
                                <span className="flex items-center gap-1 text-primary">
                                  <User className="w-3.5 h-3.5 text-primary" /> {c.author}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-normal">
                                  {new Date(c.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-muted-foreground leading-relaxed">
                                {c.comment_text}
                              </p>
                            </div>
                          ))}
                          {dayComments.length === 0 && (
                            <p className="text-xs text-muted-foreground italic">
                              No feedback added for this day yet. Add comments below to inform your
                              travel planner.
                            </p>
                          )}
                        </div>

                        {/* Input Box */}
                        <div className="space-y-3 pt-2 border-t">
                          <Input
                            placeholder="Your Name (e.g. Rahul Sharma)"
                            value={commentAuthor}
                            onChange={(e) => setCommentAuthor(e.target.value)}
                            className="bg-card text-xs border-border/60"
                          />
                          <div className="flex gap-2">
                            <Textarea
                              placeholder="e.g. Can we change the afternoon temple visit to a private sailing yacht?"
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              rows={2}
                              className="bg-card text-xs resize-none border-border/60"
                            />
                            <Button
                              type="button"
                              onClick={() => handlePostComment(day.day_number)}
                              disabled={submittingComment}
                              className="h-auto px-4 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-semibold shadow-sm"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Inclusions & Finance */}
        <div className="space-y-6 md:sticky md:top-24">
          {/* Investment Board */}
          <div className="p-6 rounded-2xl border bg-card shadow-sm space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Estimated Investment
            </h4>
            <div className="border-b pb-4 space-y-1">
              <span className="text-xs text-muted-foreground">All-Inclusive Luxury Cost</span>
              <div className="text-3xl font-bold font-display text-primary">
                INR {Number(pkg.price).toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-muted-foreground block">
                Includes VIP transfers, hotels, experiences, and local DMCs.
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stays & Villas</span>
                <span className="font-semibold">Included (Gold/Platinum)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ground Logistics</span>
                <span className="font-semibold">Private Guided</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">DMC Assistance</span>
                <span className="font-semibold text-emerald-600">24/7 Priority Support</span>
              </div>
            </div>

            {!isApproved ? (
              <Button
                onClick={() => setShowApprovalModal(true)}
                className="w-full h-11 bg-primary hover:bg-primary/95 text-primary-foreground font-bold shadow-md"
              >
                <CheckCircle className="w-4 h-4 mr-1.5" /> Approve Quote Proposal
              </Button>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Proposal Approved!</span>
                  Your advisor has been notified. We will finalize bookings immediately.
                </div>
              </div>
            )}
          </div>

          {/* Inclusions / Perks */}
          <div className="p-6 rounded-2xl border bg-card shadow-sm space-y-4">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Inclusions & Perks
            </h4>
            <div className="space-y-2 text-xs">
              {pkg.inclusions.map((inc, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-foreground capitalize">
                      {inc.category}:
                    </span>{' '}
                    <span className="text-muted-foreground">{inc.item}</span>
                  </div>
                </div>
              ))}
              {pkg.inclusions.length === 0 && (
                <p className="text-muted-foreground italic">
                  Consult your designer for inclusion details.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* â”€â”€â”€ APPROVAL DIALOG â”€â”€â”€ */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md rounded-2xl border border-border/80 p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold font-display text-primary">
                  Accept Bespoke Proposal
                </h3>
                <p className="text-xs text-muted-foreground">
                  Sign and approve your custom MooN itinerary.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowApprovalModal(false)}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3.5">
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Your Full Name
                </span>
                <Input
                  placeholder="e.g. Dr. Ramesh Gupta"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="border-border/60"
                />
              </label>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                This preview cannot record acceptance. Continue to the secure Traveller Hub to
                review the final terms and provide a persisted e-signature.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowApprovalModal(false)}
                className="flex-1 text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApproveQuote}
                className="flex-1 text-xs h-9 bg-primary text-primary-foreground hover:bg-primary/95 font-semibold shadow-sm"
              >
                Continue Securely
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€â”€ CHAT DESIGNER SLIDE-OVER â”€â”€â”€ */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsChatOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-card h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 border-l border-border/50">
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground">Chat with Designer</h3>
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>{' '}
                    Online
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsChatOpen(false)}
                className="rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F9F8F5] dark:bg-background">
              {generalComments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                  <MessageSquare className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium">No messages yet.</p>
                  <p className="text-xs text-muted-foreground">
                    Send a message to your dedicated travel planner to request changes or ask
                    questions about this proposal.
                  </p>
                </div>
              ) : (
                generalComments.map((c) => (
                  <div
                    key={c.id}
                    className="bg-card p-3 rounded-xl rounded-tl-sm border shadow-sm text-sm"
                  >
                    <div className="flex justify-between items-end mb-1">
                      <span className="font-bold text-primary text-xs">{c.author}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-foreground leading-relaxed">{c.comment_text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-border/50 bg-card space-y-3">
              <Input
                placeholder="Your Name (e.g. Rahul)"
                value={generalCommentAuthor}
                onChange={(e) => setGeneralCommentAuthor(e.target.value)}
                className="text-xs bg-muted/30 border-border/60"
              />
              <div className="flex gap-2">
                <Textarea
                  placeholder="Type your message..."
                  value={generalCommentText}
                  onChange={(e) => setGeneralCommentText(e.target.value)}
                  rows={2}
                  className="resize-none text-xs bg-muted/30 border-border/60"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handlePostGeneralComment();
                    }
                  }}
                />
                <Button
                  onClick={handlePostGeneralComment}
                  disabled={submittingGeneralComment}
                  className="h-auto bg-primary hover:bg-primary/90 shadow-sm px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground">Press Enter to send</p>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="max-w-7xl mx-auto py-12 px-6 border-t mt-20 text-center text-xs text-muted-foreground space-y-2">
        <p>Bespoke proposal prepared exclusively for guests of MooNs.</p>
        <p>Copyright 2026 MooNs. All rights reserved.</p>
      </footer>
    </div>
  );
}
