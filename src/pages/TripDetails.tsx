import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, arrayUnion, runTransaction, query, collection, where, limit, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { Trip, Ticket, Company } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Bus, CheckCircle2, CreditCard, Loader2, MapPin, User, Phone, Info, ChevronRight, PhoneCall, Globe, Map as MapIcon, X, Download } from 'lucide-react';
import { format, addMinutes } from 'date-fns';
import { fr } from 'date-fns/locale';
import { APIProvider, Map, AdvancedMarker, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { generateTicketPDF } from '../lib/pdfGenerator';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface TripDetailsProps {
  tripId: string;
  onBack: () => void;
  onSuccess: () => void;
}

function RouteDisplay({ origin, destination }: { origin: string; destination: string }) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination) return;

    // Clear previous routes
    polylinesRef.current.forEach(p => p.setMap(null));
    polylinesRef.current = [];

    routesLib.Route.computeRoutes({
      origin: origin,
      destination: destination,
      travelMode: 'DRIVING',
      fields: ['path', 'viewport'],
    }).then(({ routes }) => {
      if (routes?.[0]) {
        const newPolylines = routes[0].createPolylines();
        newPolylines.forEach(p => p.setMap(map));
        polylinesRef.current = newPolylines;
        if (routes[0].viewport) {
          map.fitBounds(routes[0].viewport);
        }
      }
    }).catch(err => {
      console.error("Route computation failed:", err);
    });

    return () => {
      polylinesRef.current.forEach(p => p.setMap(null));
    };
  }, [routesLib, map, origin, destination]);

  return null;
}

export default function TripDetails({ tripId, onBack, onSuccess }: TripDetailsProps) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'info' | 'seats' | 'payment' | 'confirmed'>('info');
  const [showMap, setShowMap] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [passengerName, setPassengerName] = useState(auth.currentUser?.displayName || '');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [assignedSerial, setAssignedSerial] = useState<string | null>(null);

  useEffect(() => {
    const fetchTripAndCompany = async () => {
      try {
        const docRef = doc(db, 'trips', tripId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const tripData = { id: docSnap.id, ...docSnap.data() } as Trip;
          setTrip(tripData);

          // Fetch company details
          const companyRef = doc(db, 'companies', tripData.companyId);
          const companySnap = await getDoc(companyRef);
          if (companySnap.exists()) {
            setCompany({ id: companySnap.id, ...companySnap.data() } as Company);
          }
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `trips/${tripId}`);
      } finally {
        setLoading(false);
      }
    };
    fetchTripAndCompany();
  }, [tripId]);

  const handleBooking = async () => {
    if (!trip || !selectedSeat || !auth.currentUser) return;
    setProcessing(true);

    try {
      // Find an available physical ticket first
      const ptQuery = query(
        collection(db, 'physicalTickets'),
        where('companyId', '==', trip.companyId),
        where('status', '==', 'available'),
        limit(1)
      );
      const ptSnap = await getDocs(ptQuery);
      if (ptSnap.empty) {
        throw new Error("Plus de matricules disponibles pour cette compagnie. L'agent doit réapprovisionner le stock.");
      }
      const ptDoc = ptSnap.docs[0];
      const ptRef = doc(db, 'physicalTickets', ptDoc.id);
      const ptSerial = ptDoc.data().serialNumber;

      await runTransaction(db, async (transaction) => {
        const tripRef = doc(db, 'trips', tripId);
        const tripDoc = await transaction.get(tripRef);
        
        if (!tripDoc.exists()) throw new Error("Le trajet n'existe plus.");
        
        const tripData = tripDoc.data() as Trip;
        const reservedSeats = tripData.reservedSeats || [];
        
        if (reservedSeats.includes(selectedSeat)) {
          throw new Error("Ce siège vient d'être réservé par un autre utilisateur.");
        }

        // Verify and lock physical ticket serial number within transaction
        const ptDocFromTrans = await transaction.get(ptRef);
        if (!ptDocFromTrans.exists() || ptDocFromTrans.data()?.status !== 'available') {
          throw new Error("Le matricule physique sélectionné n'est plus disponible. Veuillez réessayer.");
        }

        // 1. Create Ticket
        const ticketId = `TKT-${Date.now()}-${auth.currentUser.uid.slice(0, 5)}`;
        const ticketRef = doc(db, 'tickets', ticketId);
        const qrData = JSON.stringify({
          ticketId,
          tripId,
          seat: selectedSeat,
          user: auth.currentUser.uid,
          name: passengerName,
          serial: ptSerial
        });

        transaction.set(ticketRef, {
          userId: auth.currentUser.uid,
          tripId,
          companyId: tripData.companyId,
          from: tripData.from,
          to: tripData.to,
          seatNumber: selectedSeat,
          passengerName,
          passengerPhone,
          qrCode: qrData,
          status: 'paid',
          price: tripData.price,
          physicalSerialNumber: ptSerial,
          createdAt: serverTimestamp()
        });

        // 2. Update Trip
        transaction.update(tripRef, {
          availableSeats: tripData.availableSeats - 1,
          reservedSeats: arrayUnion(selectedSeat)
        });

        // 3. Update Physical Ticket
        transaction.update(ptRef, {
          status: 'reserved',
          assignedTicketId: ticketId,
          updatedAt: serverTimestamp()
        });

        // 4. Create Transaction
        const transRef = doc(db, 'transactions', `TRANS-${Date.now()}`);
        transaction.set(transRef, {
          ticketId,
          userId: auth.currentUser.uid,
          amount: tripData.price,
          provider: 'orange',
          reference: `REF-${Math.random().toString(36).substring(7).toUpperCase()}`,
          status: 'completed',
          createdAt: serverTimestamp()
        });
      });

      setAssignedSerial(ptSerial);
      setStep('confirmed');
    } catch (error) {
      alert(error instanceof Error ? error.message : "Erreur lors de la réservation");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="w-10 h-10 animate-spin text-orange-600" /></div>;
  if (!trip) return <div>Trajet non trouvé</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm border border-gray-100 hover:bg-gray-50">
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Détails du voyage</h1>
      </div>

      {step !== 'confirmed' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Trip Summary Card */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
               <div className="p-8 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-[0.2em]">Trajet Sélectionné</h2>
                    <div className="text-right flex flex-col items-end gap-2">
                      <p className="text-2xl font-black text-primary">{trip.price.toLocaleString()} FCFA</p>
                      <button 
                        onClick={() => setShowMap(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-primary hover:text-white text-slate-600 rounded-full text-[9px] font-black uppercase tracking-widest transition-all"
                      >
                        <MapIcon className="w-3 h-3" />
                        Suivre le trajet
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 relative">
                    <div className="flex-1 space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Départ</p>
                      <p className="text-2xl font-black text-slate-800">{trip.from}</p>
                      <p className="text-sm text-slate-500 font-medium">
                        {format(trip.departureTime.toDate(), 'HH:mm - EEEE d MMMM', { locale: fr })}
                      </p>
                    </div>
                    
                    <div className="flex flex-col items-center gap-1 group">
                       <div className="w-10 h-10 rounded-full border border-slate-100 bg-slate-50 flex items-center justify-center text-slate-300">
                         <ChevronRight className="w-5 h-5" />
                       </div>
                       {trip.distanceKm && (
                         <div className="flex items-center gap-1 text-primary">
                           <MapIcon className="w-3 h-3" />
                           <span className="text-[10px] font-black">{trip.distanceKm}KM</span>
                         </div>
                       )}
                    </div>

                    <div className="flex-1 text-right space-y-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Arrivée (est.)</p>
                      <p className="text-2xl font-black text-slate-800">{trip.to}</p>
                      <p className="text-sm text-slate-500 font-medium italic">
                        {trip.departureTime?.toDate ? format(addMinutes(trip.departureTime.toDate(), (trip.durationHours || 5.5) * 60), 'HH:mm') : '--:--'}
                      </p>
                    </div>
                  </div>
               </div>

               <div className="bg-slate-50/50 p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {company?.logo ? (
                      <img src={company.logo} alt={company.name} className="w-14 h-14 rounded-xl object-cover border border-white shadow-sm" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl flex items-center justify-center font-bold text-primary uppercase text-lg shadow-sm">
                        {company?.name?.slice(0, 3) || 'TSR'}
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">Opéré par</p>
                      <h4 className="font-bold text-slate-800 text-lg">{company?.name || trip.companyName || 'Transport Excellence'}</h4>
                      {company?.contact && (
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border border-slate-100">
                            <PhoneCall className="w-3 h-3 text-primary" />
                            {company.contact}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border border-slate-100">
                            <Globe className="w-3 h-3 text-primary" />
                            Site Web
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-green-50 text-green-600 rounded-xl border border-green-100">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Partenaire Vérifié</span>
                  </div>
               </div>
            </div>

            {/* Map Modal */}
            <AnimatePresence>
              {showMap && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl relative overflow-hidden flex flex-col"
                  >
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white z-10">
                      <div>
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Suivi d'itinéraire</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{trip.from} ➔ {trip.to}</p>
                      </div>
                      <button 
                        onClick={() => setShowMap(false)}
                        className="w-10 h-10 flex items-center justify-center bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex-1 relative">
                       {GOOGLE_MAPS_API_KEY ? (
                         <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
                           <Map
                             defaultCenter={{ lat: 12.37, lng: -1.53 }} // Burkina Faso center roughly
                             defaultZoom={7}
                             mapId="TRIP_FOLLOW_MAP"
                             internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                             style={{ width: '100%', height: '100%' }}
                           >
                             <RouteDisplay origin={trip.from} destination={trip.to} />
                           </Map>
                         </APIProvider>
                       ) : (
                         <div className="w-full h-full bg-slate-50 flex items-center justify-center text-center p-8">
                           <div className="space-y-4">
                             <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto text-slate-400">
                               <MapIcon className="w-8 h-8" />
                             </div>
                             <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Carte indisponible</p>
                             <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto">Veuillez configurer la clé API Google Maps pour activer le suivi.</p>
                           </div>
                         </div>
                       )}
                    </div>

                    <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Distance Totale</p>
                          <p className="text-xs font-bold text-slate-800">{trip.distanceKm || 'Calcul...'}{trip.distanceKm ? ' KM' : ''}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Vitesse moyenne</p>
                          <p className="text-xs font-bold text-slate-800">75 km/h</p>
                        </div>
                       <div className="space-y-1 text-right">
                         <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Statut du voyage</p>
                         <p className="text-xs font-bold text-green-600 uppercase">En route</p>
                       </div>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* Steps Rendering */}
            {step === 'info' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Informations passager
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Nom complet</label>
                    <input 
                      type="text" 
                      value={passengerName}
                      onChange={(e) => setPassengerName(e.target.value)}
                      className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-primary outline-none"
                      placeholder="Prénom Nom"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase text-slate-400 tracking-wider">Téléphone</label>
                    <input 
                      type="tel" 
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:border-primary outline-none"
                      placeholder="70 00 00 00"
                    />
                  </div>
                </div>
                <button 
                  onClick={() => setStep('seats')}
                  disabled={!passengerName || !passengerPhone}
                  className="w-full py-4 bg-primary text-white rounded-lg font-bold hover:bg-dark transition-all disabled:opacity-50"
                >
                  Choisir ma place
                </button>
              </motion.div>
            )}

            {step === 'seats' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-8">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800">Plan du bus</h3>
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-slate-100" /> Libre</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-primary" /> Sélection</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-slate-300" /> Occupé</div>
                  </div>
                </div>

                <div className="bg-slate-50 p-8 rounded-xl border border-slate-100">
                  <div className="grid grid-cols-4 gap-3 max-w-[280px] mx-auto">
                    {Array.from({ length: 44 }).map((_, i) => {
                      const num = (i + 1).toString();
                      const isReserved = trip.reservedSeats?.includes(num);
                      const isSelected = selectedSeat === num;
                      
                      return (
                        <button
                          key={num}
                          disabled={isReserved}
                          onClick={() => setSelectedSeat(num)}
                          className={`
                            h-10 rounded-lg font-bold text-xs transition-all border
                            ${isReserved ? 'bg-slate-200 text-slate-400 border-transparent cursor-not-allowed' : 
                              isSelected ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-primary'}
                          `}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button onClick={() => setStep('info')} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-lg font-bold">Retour</button>
                  <button 
                    disabled={!selectedSeat}
                    onClick={() => setStep('payment')}
                    className="flex-[2] py-4 bg-primary text-white rounded-lg font-bold disabled:opacity-50"
                  >
                    Confirmer le siège {selectedSeat}
                  </button>
                </div>
              </motion.div>
            )}

            {step === 'payment' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 space-y-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  Mode de paiement
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <button className="p-4 border-2 border-accent bg-accent/5 rounded-xl flex flex-col items-center gap-2">
                    <div className="w-12 h-6 bg-accent rounded flex items-center justify-center font-bold text-[10px] text-white">ORANGE</div>
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Orange Money</span>
                  </button>
                  
                  <button className="p-4 border-2 border-secondary bg-secondary/5 rounded-xl flex flex-col items-center gap-2 opacity-50 grayscale cursor-not-allowed">
                    <div className="w-12 h-6 bg-secondary rounded flex items-center justify-center font-bold text-[10px] text-primary">MOOV</div>
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Moov Money</span>
                  </button>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] text-slate-400 mb-2 uppercase font-black tracking-widest">Numéro de confirmation</p>
                  <div className="flex gap-2">
                    <input type="text" readOnly value={passengerPhone} className="flex-1 bg-white border border-slate-200 rounded h-10 px-3 text-sm font-medium outline-none" />
                    <button className="px-4 bg-dark text-white text-[10px] font-bold uppercase tracking-widest rounded transition-colors">Vérifier</button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button onClick={() => setStep('seats')} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-lg font-bold">Retour</button>
                  <button 
                    onClick={handleBooking}
                    disabled={processing}
                    className="flex-[2] py-4 bg-accent text-white rounded-lg font-bold flex items-center justify-center gap-3 disabled:opacity-50"
                  >
                    {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                     Régler {trip.price.toLocaleString()} FCFA
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right Sidebar - Summary */}
          <div className="space-y-6">
             <div className="bg-primary rounded-xl shadow-lg p-6 text-white relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-50 mb-6 underline decoration-secondary">Fiche de Réservation</h4>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="opacity-60">Billet Standard</span>
                    <span className="font-bold">{trip.price.toLocaleString()} FCFA</span>
                  </div>
                  <div className="flex justify-between items-center text-sm border-b border-white/10 pb-4">
                    <span className="opacity-60">Frais digitaux</span>
                    <span className="font-bold">Offert</span>
                  </div>
                  
                  <div className="pt-2 flex justify-between items-end">
                    <span className="text-xs font-bold opacity-60">A PAYER</span>
                    <span className="text-3xl font-black text-secondary">{trip.price.toLocaleString()} FCFA</span>
                  </div>
                </div>
             </div>
          </div>
        </div>
      )}

      {step === 'confirmed' && (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-12 rounded-[48px] shadow-xl border border-gray-100 text-center space-y-8 max-w-lg mx-auto"
        >
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Paiement Réussi !</h2>
            <p className="text-gray-500 font-medium">Votre voyage est confirmé. Préparez vos bagages !</p>
          </div>
          <div className="bg-gray-50 p-6 rounded-3xl space-y-4 text-left">
            <div className="flex justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Siège</span>
              <span className="text-lg font-bold text-gray-900">{selectedSeat}</span>
            </div>
            <div className="flex justify-between pt-4 border-t border-gray-200">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Passager</span>
              <span className="text-lg font-bold text-gray-900">{passengerName}</span>
            </div>
            {assignedSerial && (
              <div className="flex justify-between pt-4 border-t border-gray-200">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Matricule Billet</span>
                <span className="text-lg font-bold text-primary">{assignedSerial}</span>
              </div>
            )}
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                if (trip) {
                  // We construct a temporary ticket object for the PDF
                  const tempTicket: Ticket = {
                    id: `TKT-${Date.now()}`,
                    userId: auth.currentUser?.uid || '',
                    tripId: trip.id,
                    companyId: trip.companyId,
                    from: trip.from,
                    to: trip.to,
                    seatNumber: selectedSeat || '?',
                    passengerName,
                    passengerPhone,
                    qrCode: JSON.stringify({ id: 'temp' }),
                    status: 'paid',
                    price: trip.price,
                    physicalSerialNumber: 'Pending', // This is just for the preview PDF if needed
                    createdAt: { toDate: () => new Date() }
                  };
                  generateTicketPDF(tempTicket, trip, company || undefined);
                }
              }}
              className="flex-1 py-4 bg-slate-100 text-slate-900 rounded-3xl font-bold flex items-center justify-center gap-2 hover:bg-slate-200 transition-all"
            >
              <Download className="w-5 h-5" />
              Télécharger PDF
            </button>
            <button 
              onClick={onSuccess}
              className="flex-[1.5] py-5 bg-gray-900 text-white rounded-3xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all"
            >
              Ticket numérique
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
