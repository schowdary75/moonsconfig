import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from '@/lib/routerCompat';
import { Search, X, Briefcase, Hotel, Compass, ArrowRight, Loader2 } from 'lucide-react';
import {
  getPackages,
  getStays,
  getExperiences,
  PackageRow,
  StayRow,
  ExperienceRow,
} from '@/lib/api/db.functions';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const navigate = useRef(useNavigate());
  const inputRef = useRef<HTMLInputElement>(null);

  // Search input state
  const [query, setQuery] = useState('');

  // Data states
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [experiences, setExperiences] = useState<ExperienceRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch all data once when the modal is opened
  useEffect(() => {
    if (!isOpen) return;

    const loadSearchData = async () => {
      setLoading(true);
      try {
        const [pkgs, stys, exps] = await Promise.all([getPackages(), getStays(), getExperiences()]);
        setPackages(pkgs);
        setStays(stys);
        setExperiences(exps);
      } catch (err) {
        console.error('Failed to load global search data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSearchData();
    setQuery('');

    // Focus input field
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, [isOpen]);

  // Handle keyboard listener to close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter lists based on user input
  const cleanQuery = query.trim().toLowerCase();

  const matchedPackages = cleanQuery
    ? packages.filter(
        (p) =>
          p.name.toLowerCase().includes(cleanQuery) ||
          p.destination.toLowerCase().includes(cleanQuery) ||
          p.description.toLowerCase().includes(cleanQuery),
      )
    : [];

  const matchedStays = cleanQuery
    ? stays.filter(
        (s) =>
          s.hotel.toLowerCase().includes(cleanQuery) ||
          s.name.toLowerCase().includes(cleanQuery) ||
          s.country.toLowerCase().includes(cleanQuery),
      )
    : [];

  const matchedExperiences = cleanQuery
    ? experiences.filter(
        (e) =>
          e.title.toLowerCase().includes(cleanQuery) ||
          e.description.toLowerCase().includes(cleanQuery) ||
          e.place.toLowerCase().includes(cleanQuery),
      )
    : [];

  const totalResults = matchedPackages.length + matchedStays.length + matchedExperiences.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* Dialog box */}
      <div className="relative z-10 w-full max-w-2xl bg-black border border-white/10 rounded-3xl overflow-hidden shadow-2xl animate-scaleUp text-left flex flex-col max-h-[80vh] font-sans">
        {/* Input area */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
          <Search className="text-white/40 shrink-0" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search packages, boutique hotels, or local activities..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-white text-base focus:outline-none placeholder-white/30"
          />
          {loading ? (
            <Loader2 className="animate-spin text-white/40" size={16} />
          ) : query ? (
            <button
              onClick={() => setQuery('')}
              className="text-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          ) : (
            <span className="text-[10px] uppercase font-mono tracking-wider text-white/30 border border-white/10 px-1.5 py-0.5 rounded-md">
              ESC
            </span>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[50vh]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-white/40">
              <Loader2 className="animate-spin text-white" size={24} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                Indexing portal items...
              </span>
            </div>
          ) : !query ? (
            // Search guide / instructions
            <div className="text-center py-8 space-y-3">
              <p className="font-display italic text-lg text-white/60">Wander beautifully.</p>
              <p className="text-xs text-white/40 leading-relaxed max-w-md mx-auto">
                Type destinations like "Bali", stays like "Villa", or experiences like "Desert" to
                explore catalog offerings instantly.
              </p>
            </div>
          ) : totalResults === 0 ? (
            // No results found
            <div className="text-center py-12 space-y-2 text-white/40">
              <p className="font-semibold text-sm">No matches found for "{query}"</p>
              <p className="text-xs leading-relaxed max-w-sm mx-auto">
                Try searching for a country name, hotel keyword, or check your spelling.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Category 1: Slow-Travel Packages */}
              {matchedPackages.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40 flex items-center gap-2">
                    <Briefcase size={12} />
                    <span>Travel Packages ({matchedPackages.length})</span>
                  </h3>
                  <div className="grid gap-2">
                    {matchedPackages.slice(0, 4).map((p) => (
                      <Link
                        key={p.id}
                        to="/packages/$id"
                        params={{ id: String(p.id) }}
                        onClick={onClose}
                        className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/15 transition-all group cursor-pointer"
                      >
                        <div className="space-y-1">
                          <h4 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                            {p.name}
                          </h4>
                          <p className="text-xs text-white/50">
                            {p.nights} Nights · {p.destination}
                          </p>
                        </div>
                        <ArrowRight
                          size={14}
                          className="text-white/30 group-hover:translate-x-1 group-hover:text-white transition-all shrink-0"
                        />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Category 2: Boutique Stays */}
              {matchedStays.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40 flex items-center gap-2">
                    <Hotel size={12} />
                    <span>Boutique Stays ({matchedStays.length})</span>
                  </h3>
                  <div className="grid gap-2">
                    {matchedStays.slice(0, 4).map((s) => {
                      return (
                        <Link
                          key={s.hotel + s.name}
                          to="/stays"
                          search={{ search: s.hotel }}
                          onClick={onClose}
                          className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/15 transition-all group cursor-pointer"
                        >
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                              {s.hotel}
                            </h4>
                            <p className="text-xs text-white/50">
                              {s.name}, {s.country} - live rate by RFQ
                            </p>
                          </div>
                          <ArrowRight
                            size={14}
                            className="text-white/30 group-hover:translate-x-1 group-hover:text-white transition-all shrink-0"
                          />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Category 3: Unique Experiences */}
              {matchedExperiences.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40 flex items-center gap-2">
                    <Compass size={12} />
                    <span>Immersive Experiences ({matchedExperiences.length})</span>
                  </h3>
                  <div className="grid gap-2">
                    {matchedExperiences.slice(0, 4).map((e) => {
                      return (
                        <Link
                          key={e.title}
                          to="/experiences"
                          search={{ search: e.title }}
                          onClick={onClose}
                          className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-white/15 transition-all group cursor-pointer"
                        >
                          <div className="space-y-1">
                            <h4 className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                              {e.title}
                            </h4>
                            <p className="text-xs text-white/50">{e.place} - live rate by RFQ</p>
                          </div>
                          <ArrowRight
                            size={14}
                            className="text-white/30 group-hover:translate-x-1 group-hover:text-white transition-all shrink-0"
                          />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02] flex justify-between items-center text-[10px] text-white/30 font-sans">
          <span>Search matches dynamically across all slow travel products</span>
          <span className="flex items-center gap-1 font-mono">
            <span>⌘</span>
            <span>+</span>
            <span>K</span>
          </span>
        </div>
      </div>
    </div>
  );
}
