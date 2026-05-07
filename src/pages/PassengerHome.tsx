import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trip } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Search, MapPin, Calendar, Clock, Bus, ChevronRight, Filter, Ticket as TicketIcon, Landmark, History, ArrowUpDown, ArrowUp, ArrowDown, X, TrendingUp, Map as MapIcon } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getPopularDestinations } from '../services/geminiService';

interface PassengerHomeProps {
  onSelectTrip: (id: string) => void;
  onNavigate?: (view: string) => void;
}

export default function PassengerHome({ onSelectTrip, onNavigate }: PassengerHomeProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFrom, setSearchFrom] = useState('');
  const [searchTo, setSearchTo] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [selectedTripForSummary, setSelectedTripForSummary] = useState<Trip | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<{ city: string, reason: string, icon: string }[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  
  useEffect(() => {
    const tripsRef = collection(db, 'trips');
    const q = query(
      tripsRef, 
      where('status', '==', 'scheduled'),
      orderBy('departureTime', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const tripsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trip[];
      setTrips(tripsData);
      setLoading(false);
      
      // Load AI Suggestions once trips are loaded
      if (tripsData.length > 0 && !aiSuggestions.length) {
        const uniqueCities = Array.from(new Set(tripsData.flatMap(t => [t.from, t.to])));
        fetchAiSuggestions(uniqueCities);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });

    return () => unsubscribe();
  }, []);

  const fetchAiSuggestions = async (cities: string[]) => {
    setLoadingAi(true);
    const suggestions = await getPopularDestinations(cities);
    setAiSuggestions(suggestions);
    setLoadingAi(false);
  };

  const toggleSort = () => {
    if (sortOrder === null) setSortOrder('asc');
    else if (sortOrder === 'asc') setSortOrder('desc');
    else setSortOrder(null);
  };

  const filteredTrips = trips
    .filter(trip => {
      const matchesFrom = trip.from.toLowerCase().includes(searchFrom.toLowerCase());
      const matchesTo = trip.to.toLowerCase().includes(searchTo.toLowerCase());
      
      let matchesDate = true;
      if (searchDate && trip.departureTime?.toDate) {
        const tripDate = format(trip.departureTime.toDate(), 'yyyy-MM-dd');
        matchesDate = tripDate === searchDate;
      }

      return matchesFrom && matchesTo && matchesDate;
    })
    .sort((a, b) => {
      if (sortOrder === 'asc') return a.price - b.price;
      if (sortOrder === 'desc') return b.price - a.price;
      return 0;
    });

  return (
    <div className="space-y-8">
      {/* Quick Navigation */}
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        <button 
          onClick={() => onNavigate?.('history')}
          className="flex-shrink-0 flex items-center gap-3 px-6 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-primary transition-all group"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 group-hover:bg-primary group-hover:text-white transition-colors">
            <History className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Voyages</p>
            <p className="text-xs font-bold text-slate-800">Mes Billets</p>
          </div>
        </button>

        <button 
          onClick={() => onNavigate?.('transaction-history')}
          className="flex-shrink-0 flex items-center gap-3 px-6 py-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-primary transition-all group"
        >
          <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 group-hover:bg-primary group-hover:text-white transition-colors">
            <Landmark className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Finances</p>
            <p className="text-xs font-bold text-slate-800">Mes Paiements</p>
          </div>
        </button>
      </div>

      {/* Search Section */}
      <section id="search-section" className="bg-white p-6 sm:p-8 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          Rechercher un trajet
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Ville de départ</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <MapPin className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                placeholder="Ex: Ouagadougou"
                value={searchFrom}
                onChange={(e) => setSearchFrom(e.target.value)}
                className="w-full h-12 pl-12 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-primary transition-all"
              />
              {searchFrom && (
                <button 
                  onClick={() => setSearchFrom('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Destination</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <MapPin className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                placeholder="Ex: Bobo-Dioulasso"
                value={searchTo}
                onChange={(e) => setSearchTo(e.target.value)}
                className="w-full h-12 pl-12 pr-10 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-primary transition-all"
              />
              {searchTo && (
                <button 
                  onClick={() => setSearchTo('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Date du voyage</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                <Calendar className="w-4 h-4" />
              </span>
              <input 
                type="date" 
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                className="w-full h-12 pl-12 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-primary transition-all"
              />
              {searchDate && (
                <button 
                  onClick={() => setSearchDate('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {(searchFrom || searchTo || searchDate) && (
          <button 
            onClick={() => {
              setSearchFrom('');
              setSearchTo('');
              setSearchDate('');
            }}
            className="w-full mt-6 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            Réinitialiser les filtres
          </button>
        )}
      </section>

      {/* AI Recommendations */}
      <AnimatePresence>
        {aiSuggestions.length > 0 && (
          <motion.section 
            id="ai-suggestions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 px-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Destinations suggérées par l'IA</h3>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {aiSuggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => setSearchTo(suggestion.city)}
                  className="flex-shrink-0 w-64 bg-white p-4 rounded-xl border border-slate-100 shadow-sm hover:border-primary hover:shadow-md transition-all text-left flex gap-3 group"
                >
                  <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    {suggestion.icon === 'nature' ? <MapPin className="w-5 h-5" /> : 
                     suggestion.icon === 'trade' ? <Landmark className="w-5 h-5" /> :
                     suggestion.icon === 'crossroads' ? <ArrowUpDown className="w-5 h-5" /> :
                     <Landmark className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate uppercase">{suggestion.city}</p>
                    <p className="text-[10px] text-slate-500 font-medium leading-tight line-clamp-2">{suggestion.reason}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Results Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Trajets Disponibles ({filteredTrips.length})</h3>
          <button 
            onClick={toggleSort}
            className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors ${sortOrder ? 'text-primary' : 'text-slate-400 hover:text-primary'}`}
          >
            {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : sortOrder === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3" />}
            Prix {sortOrder === 'asc' ? '(Croissant)' : sortOrder === 'desc' ? '(Décroissant)' : ''}
          </button>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredTrips.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-dashed border-slate-200">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bus className="w-8 h-8 text-slate-300" />
            </div>
            <p className="text-slate-500 text-sm font-medium">Aucun trajet trouvé pour cette recherche.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredTrips.map((trip) => (
              <motion.div
                key={trip.id}
                whileHover={{ y: -2 }}
                onClick={() => setSelectedTripForSummary(trip)}
                className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:border-primary cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between group transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-slate-200 group-hover:bg-primary transition-colors">
                    <Bus className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-4 mb-1">
                      <div className="flex flex-col">
                        <p className="font-bold text-slate-800 text-lg">
                          {trip.departureTime?.toDate ? format(trip.departureTime.toDate(), 'HH:mm') : '00:00'}
                        </p>
                        <p className="text-[9px] font-black uppercase text-slate-300 tracking-tighter leading-none">Départ</p>
                      </div>
                      
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-px bg-slate-200 relative">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-slate-300">➔</div>
                        </div>
                        <p className="text-[8px] font-bold text-slate-300 uppercase mt-1">~{trip.durationHours || 5.5}h {trip.distanceKm ? `(${trip.distanceKm}km)` : ''}</p>
                      </div>

                      <div className="flex flex-col">
                        <p className="font-bold text-slate-800 text-lg">
                          {trip.departureTime?.toDate ? format(addMinutes(trip.departureTime.toDate(), (trip.durationHours || 5.5) * 60), 'HH:mm') : '00:00'}
                        </p>
                        <p className="text-[9px] font-black uppercase text-slate-300 tracking-tighter leading-none">Arrivée</p>
                      </div>

                      <div className="h-6 w-px bg-slate-100 mx-2" />

                      <p className="font-bold text-slate-800 text-lg">
                        {trip.from} - {trip.to}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 italic font-medium">
                      Compagnie Excellence • Climatisé • Wi-Fi
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:flex-col sm:items-end gap-1 mt-4 sm:mt-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                  <span className="text-xl font-black text-primary">{trip.price.toLocaleString()} FCFA</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${trip.availableSeats > 10 ? 'text-green-600' : 'text-accent'}`}>
                    {trip.availableSeats} places libres
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Trip Summary Modal */}
      <AnimatePresence>
        {selectedTripForSummary && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div 
              initial={{ y: "100%", opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }} 
              exit={{ y: "100%", opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-8 shadow-2xl flex flex-col gap-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-[0.2em]">Résumé du Voyage</h3>
                <button 
                  onClick={() => setSelectedTripForSummary(null)} 
                  className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-4 relative">
                    <div className="flex items-center gap-4">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Départ</p>
                        <p className="font-bold text-slate-800">{selectedTripForSummary.from}</p>
                      </div>
                    </div>
                    <div className="absolute left-1.25 top-4 bottom-4 w-px border-l-2 border-dashed border-slate-200" />
                    {selectedTripForSummary.distanceKm && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 bg-white px-2 py-0.5 rounded-full border border-slate-100 flex items-center gap-1.5 shadow-sm">
                        <MapIcon className="w-2.5 h-2.5 text-primary" />
                        <span className="text-[9px] font-black text-primary">{selectedTripForSummary.distanceKm} KM</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-2.5 h-2.5 rounded-full border-2 border-primary bg-white shadow-sm" />
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Arrivée (est.)</p>
                        <p className="font-bold text-slate-800">
                          {selectedTripForSummary.to} 
                          <span className="ml-2 text-primary">
                            à {selectedTripForSummary.departureTime?.toDate ? format(addMinutes(selectedTripForSummary.departureTime.toDate(), (selectedTripForSummary.durationHours || 5.5) * 60), 'HH:mm') : '00:00'}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Horaire</p>
                    <div className="flex items-center gap-2 justify-end">
                      <Clock className="w-4 h-4 text-primary" />
                      <p className="text-xl font-black text-primary italic">
                        {selectedTripForSummary.departureTime?.toDate ? format(selectedTripForSummary.departureTime.toDate(), 'HH:mm') : '00:00'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bus & Services</p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <Bus className="w-4 h-4 text-slate-400" />
                      Premium Excellence
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total à payer</p>
                    <p className="text-base font-black text-slate-800 italic">{selectedTripForSummary.price.toLocaleString()} FCFA</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button 
                  onClick={() => {
                    onSelectTrip(selectedTripForSummary.id);
                    setSelectedTripForSummary(null);
                  }}
                  className="w-full py-5 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-600 transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3 active:scale-95"
                >
                  <TicketIcon className="w-4 h-4" />
                  Continuer vers la réservation
                </button>
                <button 
                  onClick={() => setSelectedTripForSummary(null)}
                  className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Retour aux résultats
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
